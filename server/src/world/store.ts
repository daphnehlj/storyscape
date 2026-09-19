import { randomUUID } from 'node:crypto';
import type { GapReport, Question, Scene, Stage, WorldEvent } from '@app/shared';
import type { ClarifyOutcome, ClarifySession } from '../clarify/session.js';
import type { Brief } from '../clarify/normalizeBrief.js';
import type { RankedGap } from '../clarify/types.js';

// Worlds live in memory. A restart loses them, which is the right trade for a
// hackathon: the alternative is a database nobody has time to debug at 4am.

export interface StoredAnswer {
  questionId: string;
  optionId?: string;
  text?: string;
  at: number;
}

// One event-stream connection.
export interface EventSink {
  push(event: WorldEvent): void;
  close(): void;
}

export interface WorldRecord {
  id: string;
  story: string;
  stage: Stage;
  brief?: Brief;
  ranked?: RankedGap[];
  gapReports?: GapReport[];
  questions?: Question[];
  answers: Map<string, StoredAnswer>;
  clarify?: ClarifySession;
  clarifyOutcome?: ClarifyOutcome;
  scene?: Scene;
  subscribers: Set<EventSink>;
  createdAt: number;
}

const worlds = new Map<string, WorldRecord>();

export function createWorld(story: string): WorldRecord {
  const world: WorldRecord = {
    id: randomUUID().slice(0, 8),
    story,
    stage: 'brief',
    answers: new Map(),
    subscribers: new Set(),
    createdAt: Date.now(),
  };
  worlds.set(world.id, world);
  return world;
}

export function getWorld(id: string): WorldRecord | undefined {
  return worlds.get(id);
}

export function emit(world: WorldRecord, event: WorldEvent): void {
  for (const sink of world.subscribers) {
    try {
      sink.push(event);
    } catch {
      // A dead connection must never take the pipeline down with it.
      world.subscribers.delete(sink);
    }
  }
}

export function setStage(world: WorldRecord, stage: Stage): void {
  world.stage = stage;
  emit(world, { type: 'stage', stage });
}

export function log(world: WorldRecord, text: string, extra?: { tool?: string; rationale?: string }): void {
  emit(world, { type: 'log', text, ...extra });
}

// What a client gets the moment it connects, so a refresh mid-question lands
// exactly where it left off. Answers come from GET /answers, which keeps this
// to events the contract already has.
export function replayFor(world: WorldRecord): WorldEvent[] {
  const events: WorldEvent[] = [{ type: 'stage', stage: world.stage }];
  if (world.questions?.length) events.push({ type: 'questions', questions: world.questions });
  if (world.gapReports?.length) events.push({ type: 'gaps', gaps: world.gapReports });
  if (world.scene) events.push({ type: 'scene', scene: world.scene });
  return events;
}

export function addSubscriber(world: WorldRecord, sink: EventSink): void {
  world.subscribers.add(sink);
  world.clarify?.onSubscriberChange(world.subscribers.size);
}

export function removeSubscriber(world: WorldRecord, sink: EventSink): void {
  world.subscribers.delete(sink);
  world.clarify?.onSubscriberChange(world.subscribers.size);
}
