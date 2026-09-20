import { randomBytes } from 'node:crypto';
import { SceneSchema, validateSceneRefs, type Scene, type Stage, type WorldEvent } from '@app/shared';
import { createInitialScene } from './initialScene.js';

type Listener = (event: WorldEvent) => void;

export interface World {
  id: string;
  stage: Stage;
  scene: Scene;
  // Monotonic for the life of the world, so ids are never reused (B diffs by id).
  idCounter: number;
  seedCounter: number;
  listeners: Set<Listener>;
  // Replayed on connect: without it, a client that arrives after a failure sees
  // a finished world and no reason why.
  history: WorldEvent[];
}

const worlds = new Map<string, World>();

export function createWorld(): World {
  const id = randomBytes(8).toString('base64url');
  const world: World = {
    id,
    stage: 'read',
    scene: createInitialScene(id),
    idCounter: 0,
    seedCounter: 0,
    listeners: new Set(),
    history: [],
  };
  worlds.set(id, world);
  return world;
}

export function getWorld(id: string): World | undefined {
  return worlds.get(id);
}

export function nextId(world: World, prefix: string): string {
  world.idCounter += 1;
  return `${prefix}-${world.idCounter}`;
}

export function nextSeed(world: World): number {
  world.seedCounter += 1;
  return (world.scene.terrain.seed + world.seedCounter * 7919) % 2 ** 31;
}

export class InvalidSceneError extends Error {}

// Throws rather than sending: an invalid scene must never reach the wire.
export function assertValidScene(scene: Scene): Scene {
  const parsed = SceneSchema.parse(scene);
  const problems = validateSceneRefs(parsed);
  if (problems.length > 0) throw new InvalidSceneError(problems.join('; '));
  return parsed;
}

// Synchronous read-modify-commit, so concurrent asset jobs and the agent can't
// overwrite each other's changes (no await between reading and writing the scene).
export function updateScene(world: World, build: (scene: Scene) => Scene): Scene {
  world.scene = assertValidScene(build(world.scene));
  emit(world, { type: 'scene', scene: world.scene });
  return world.scene;
}

export function setStage(world: World, stage: Stage): void {
  world.stage = stage;
  emit(world, { type: 'stage', stage });
}

export function logEvent(world: World, text: string): void {
  emit(world, { type: 'log', text });
}

export function emitError(world: World, message: string): void {
  emit(world, { type: 'error', message });
}

export function subscribe(world: World, listener: Listener): () => void {
  world.listeners.add(listener);
  return () => world.listeners.delete(listener);
}

// Scenes are not kept: the latest one is world.scene, and replaying every
// intermediate scene would flood a reconnecting client.
const REPLAYABLE = new Set(['log', 'error']);

function emit(world: World, event: WorldEvent): void {
  if (REPLAYABLE.has(event.type)) world.history.push(event);
  for (const listener of world.listeners) listener(event);
}
