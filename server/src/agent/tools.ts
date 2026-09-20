import { z } from 'zod';
import {
  BiomeSchema,
  PaletteSchema,
  PlatformSchema,
  TimeOfDaySchema,
  WeatherSchema,
  type LibraryEntry,
  type Scene,
  type SceneObject,
  type Zone,
} from '@app/shared';
import type { ToolDef } from '../llm/index.js';
import { describeScene } from './describeScene.js';

export class ToolError extends Error {}

export interface ToolContext {
  library: Map<string, LibraryEntry>;
  nextId: (prefix: string) => string;
  nextSeed: () => number;
}

export interface ToolOutcome {
  scene: Scene;
  result: string;
  finished?: boolean;
}

interface Tool<S extends z.ZodObject> {
  def: ToolDef & { parameters: S };
  handle: (scene: Scene, args: z.infer<S>, ctx: ToolContext) => ToolOutcome;
}

function defineTool<S extends z.ZodObject>(
  name: string,
  description: string,
  parameters: S,
  handle: Tool<S>['handle'],
): Tool<S> {
  return { def: { name, description, parameters }, handle };
}

// Sky zones float between this and the sky ceiling; below it they'd clip terrain.
const MIN_SKY_ELEVATION = 60;
// Objects may sit a little outside their zone's circle before it counts as a mistake.
const ZONE_EDGE_TOLERANCE = 1.2;

// Tuples serialise to prefixItems, which function-calling schemas don't reliably
// support, so fixed-length arrays are declared with .length().
const Vec2Arg = z.array(z.number()).length(2);
const Vec3Arg = z.array(z.number()).length(3);

function withinBounds(scene: Scene, x: number, z: number): boolean {
  const half = scene.bounds.size / 2;
  return Math.abs(x) <= half && Math.abs(z) <= half;
}

function findZone(scene: Scene, zoneId: string): Zone {
  const zone = scene.zones.find((z) => z.id === zoneId);
  if (!zone) {
    const known = scene.zones.map((z) => `${z.id} (${z.name})`).join(', ') || 'none yet';
    throw new ToolError(`Unknown zoneId "${zoneId}". Existing zones: ${known}.`);
  }
  return zone;
}

// Library ids are added to scene.assets on first use; hero ids are already there.
function withAsset(scene: Scene, assetId: string, ctx: ToolContext): Scene {
  if (assetId in scene.assets) return scene;
  if (!ctx.library.has(assetId)) {
    throw new ToolError(`Unknown assetId "${assetId}". Use an id from the LIBRARY list.`);
  }
  return { ...scene, assets: { ...scene.assets, [assetId]: { id: assetId, source: 'library' } } };
}

const setTerrain = defineTool(
  'set_terrain',
  'Set the ground: biome, how hilly it is (0 flat – 1 mountainous), and optional water plane height.',
  z.object({
    biome: BiomeSchema,
    heightVariation: z.number().min(0).max(1),
    waterLevel: z.number().optional().describe('y height of a water plane; omit for no water'),
  }),
  (scene, args) => {
    const terrain = {
      biome: args.biome,
      heightVariation: args.heightVariation,
      seed: scene.terrain.seed,
      ...(args.waterLevel !== undefined && { water: { level: args.waterLevel } }),
    };
    return { scene: { ...scene, terrain }, result: `Terrain set to ${args.biome}.` };
  },
);

const setEnvironment = defineTool(
  'set_environment',
  "Set time of day, weather, fog (0–1) and the colour palette. Always pass the brief's palette.",
  z.object({
    timeOfDay: TimeOfDaySchema,
    weather: WeatherSchema,
    fogDensity: z.number().min(0).max(1),
    palette: z
      .array(z.string())
      .length(3)
      .describe('exactly 3 hex colours in order: [sky/horizon, ground, accent]'),
  }),
  (scene, args) => {
    const palette = PaletteSchema.safeParse(args.palette);
    if (!palette.success) throw new ToolError('palette must be 3 hex colours like ["#cfe3f7", "#8ec06c", "#f2c14e"].');
    // skybox is owned by the asset jobs, not the agent.
    const environment = {
      ...args,
      palette: palette.data,
      ...(scene.environment.skybox && { skybox: scene.environment.skybox }),
    };
    return { scene: { ...scene, environment }, result: 'Environment set.' };
  },
);

const createZone = defineTool(
  'create_zone',
  `Create a named place in the world. Ground zones: elevation 0. Sky zones: elevation >= ${MIN_SKY_ELEVATION} and a platform.`,
  z.object({
    name: z.string().min(1),
    description: z.string(),
    center: Vec2Arg.describe('[x, z] in metres'),
    radius: z.number().min(3).max(80),
    elevation: z.number().min(0),
    platform: PlatformSchema.optional().describe('required for sky zones'),
    storyNote: z.string().optional().describe('one sentence tying this place to the story'),
  }),
  (scene, args, ctx) => {
    const [x, zPos] = args.center as [number, number];
    if (!withinBounds(scene, x, zPos)) {
      throw new ToolError(`center [${x}, ${zPos}] is outside the world (±${scene.bounds.size / 2}).`);
    }
    if (args.elevation > 0 && args.elevation < MIN_SKY_ELEVATION) {
      throw new ToolError(`elevation must be 0 (ground) or at least ${MIN_SKY_ELEVATION} (sky).`);
    }
    if (args.elevation > scene.bounds.skyHeight) {
      throw new ToolError(`elevation must be at most ${scene.bounds.skyHeight}.`);
    }
    if (args.elevation > 0 && !args.platform) {
      throw new ToolError('Sky zones need platform "cloud" or "rock".');
    }
    const zone: Zone = {
      id: ctx.nextId('zone'),
      name: args.name,
      description: args.description,
      center: [x, zPos],
      radius: args.radius,
      elevation: args.elevation,
      ...(args.platform && { platform: args.platform }),
      ...(args.storyNote && { storyNote: args.storyNote }),
    };
    return { scene: { ...scene, zones: [...scene.zones, zone] }, result: `Created zone ${zone.id} "${zone.name}".` };
  },
);

const placeObject = defineTool(
  'place_object',
  'Place one model. size is target height in metres (defaults to the library default).',
  z.object({
    assetId: z.string(),
    zoneId: z.string().optional(),
    position: Vec3Arg.describe('[x, y, z]; y is ignored when snapToGround is true'),
    size: z.number().positive().optional(),
    rotationY: z.number().optional().describe('degrees'),
    snapToGround: z.boolean().optional().describe('defaults to true'),
    label: z.string().optional(),
    storyNote: z.string().optional(),
  }),
  (scene, args, ctx) => {
    const [x, y, zPos] = args.position as [number, number, number];
    if (!withinBounds(scene, x, zPos)) {
      throw new ToolError(`position [${x}, ${y}, ${zPos}] is outside the world (±${scene.bounds.size / 2}).`);
    }
    if (args.zoneId !== undefined) {
      const zone = findZone(scene, args.zoneId);
      const distance = Math.hypot(x - zone.center[0], zPos - zone.center[1]);
      if (distance > zone.radius * ZONE_EDGE_TOLERANCE) {
        throw new ToolError(
          `position is ${distance.toFixed(0)}m from the center of ${zone.id} [${zone.center.join(', ')}] but its radius is ${zone.radius}. Move it closer or omit zoneId.`,
        );
      }
    }
    const withRef = withAsset(scene, args.assetId, ctx);
    const size = args.size ?? ctx.library.get(args.assetId)?.defaultSize;
    if (size === undefined) throw new ToolError(`Unknown assetId "${args.assetId}" has no default size — pass size explicitly.`);
    const object: SceneObject = {
      id: ctx.nextId('obj'),
      assetId: args.assetId,
      position: [x, y, zPos],
      snapToGround: args.snapToGround ?? true,
      rotationY: args.rotationY ?? 0,
      size,
      ...(args.zoneId !== undefined && { zoneId: args.zoneId }),
      ...(args.label && { label: args.label }),
      ...(args.storyNote && { storyNote: args.storyNote }),
    };
    return {
      scene: { ...withRef, objects: [...withRef.objects, object] },
      result: `Placed ${object.id} (${args.assetId}).`,
    };
  },
);

const scatter = defineTool(
  'scatter',
  'Scatter many small library models randomly inside a zone (trees, rocks, bushes...).',
  z.object({
    assetIds: z.array(z.string()).min(1),
    zoneId: z.string(),
    count: z.number().int().min(1).max(200),
    sizeRange: Vec2Arg.optional().describe('[min, max] height in metres; defaults around the library default'),
  }),
  (scene, args, ctx) => {
    findZone(scene, args.zoneId);
    let next = scene;
    for (const assetId of args.assetIds) next = withAsset(next, assetId, ctx);
    const sizeRange = (args.sizeRange as [number, number] | undefined) ?? defaultSizeRange(args.assetIds, ctx);
    if (sizeRange[0] <= 0 || sizeRange[0] > sizeRange[1]) {
      throw new ToolError('sizeRange must be [min, max] with 0 < min <= max.');
    }
    const entry = { id: ctx.nextId('scatter'), assetIds: args.assetIds, zoneId: args.zoneId, count: args.count, seed: ctx.nextSeed(), sizeRange };
    return { scene: { ...next, scatters: [...next.scatters, entry] }, result: `Created ${entry.id}.` };
  },
);

// ±20% around the average library default height.
function defaultSizeRange(assetIds: string[], ctx: ToolContext): [number, number] {
  const sizes = assetIds.map((id) => ctx.library.get(id)?.defaultSize ?? 1);
  const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  return [mean * 0.8, mean * 1.2];
}

const remove = defineTool(
  'remove',
  'Remove a zone, object or scatter by id. Removing a zone also removes everything in it.',
  z.object({ id: z.string() }),
  (scene, { id }) => {
    if (scene.zones.some((z) => z.id === id)) {
      const next = {
        ...scene,
        zones: scene.zones.filter((z) => z.id !== id),
        objects: scene.objects.filter((o) => o.zoneId !== id),
        scatters: scene.scatters.filter((s) => s.zoneId !== id),
      };
      const removedCount = scene.objects.length - next.objects.length + scene.scatters.length - next.scatters.length;
      return { scene: next, result: `Removed zone ${id} and ${removedCount} things in it.` };
    }
    if (scene.objects.some((o) => o.id === id)) {
      return { scene: { ...scene, objects: scene.objects.filter((o) => o.id !== id) }, result: `Removed ${id}.` };
    }
    if (scene.scatters.some((s) => s.id === id)) {
      return { scene: { ...scene, scatters: scene.scatters.filter((s) => s.id !== id) }, result: `Removed ${id}.` };
    }
    throw new ToolError(`Nothing with id "${id}" exists.`);
  },
);

const describe = defineTool(
  'describe_scene',
  'Get a text summary of everything in the world so far, to check your work.',
  z.object({}),
  (scene) => ({ scene, result: describeScene(scene) }),
);

const finish = defineTool(
  'finish',
  'Call when the world is complete.',
  z.object({}),
  (scene) => ({ scene, result: 'Done.', finished: true }),
);

// Heterogeneous parameter types; each entry's handler only ever sees its own schema's output.
const TOOLS: Tool<z.ZodObject>[] = [setTerrain, setEnvironment, createZone, placeObject, scatter, remove, describe, finish] as Tool<z.ZodObject>[];

export const TOOL_DEFS: ToolDef[] = TOOLS.map((t) => t.def);

// Parses and applies one call. Throws ToolError with a message meant for the agent.
export function runTool(name: string, rawArgs: string, scene: Scene, ctx: ToolContext): ToolOutcome {
  const tool = TOOLS.find((t) => t.def.name === name);
  if (!tool) throw new ToolError(`Unknown tool "${name}".`);
  let json: unknown;
  try {
    json = JSON.parse(rawArgs || '{}');
  } catch {
    throw new ToolError('Arguments were not valid JSON.');
  }
  const parsed = tool.def.parameters.safeParse(json);
  if (!parsed.success) {
    throw new ToolError(parsed.error.issues.map((i) => `${i.path.join('.') || 'args'}: ${i.message}`).join('; '));
  }
  return tool.handle(scene, parsed.data, ctx);
}
