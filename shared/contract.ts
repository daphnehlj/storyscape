import { z } from 'zod';

// The only thing server/ and web/ share. See world-arch.md §4.
// Changes here need the other person's review.

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3Schema>;

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #rrggbb');

export const BiomeSchema = z.enum(['grassland', 'forest', 'desert', 'snow', 'swamp', 'beach']);
export const TimeOfDaySchema = z.enum(['dawn', 'day', 'dusk', 'night']);
export const WeatherSchema = z.enum(['clear', 'cloudy', 'rain', 'snow', 'fog']);
export const PlatformSchema = z.enum(['cloud', 'rock']);
export const AssetStatusSchema = z.enum(['pending', 'ready', 'failed']);

export const TerrainSchema = z.object({
  biome: BiomeSchema,
  heightVariation: z.number().min(0).max(1),
  seed: z.number().int(),
  water: z.object({ level: z.number() }).optional(),
});
export type Terrain = z.infer<typeof TerrainSchema>;

export const SkyboxSchema = z.object({
  status: AssetStatusSchema,
  url: z.string().optional(),
});

export const EnvironmentSchema = z.object({
  timeOfDay: TimeOfDaySchema,
  weather: WeatherSchema,
  fogDensity: z.number().min(0).max(1),
  palette: z.array(HexColorSchema).optional(),
  skybox: SkyboxSchema.optional(),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export const ZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  center: z.tuple([z.number(), z.number()]),
  radius: z.number().positive(),
  elevation: z.number().min(0),
  platform: PlatformSchema.optional(),
  storyNote: z.string().optional(),
});
export type Zone = z.infer<typeof ZoneSchema>;

export const SceneObjectSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  zoneId: z.string().optional(),
  position: Vec3Schema,
  snapToGround: z.boolean(),
  rotationY: z.number(),
  size: z.number().positive(),
  label: z.string().optional(),
  storyNote: z.string().optional(),
});
export type SceneObject = z.infer<typeof SceneObjectSchema>;

export const ScatterSchema = z.object({
  id: z.string(),
  assetIds: z.array(z.string()).min(1),
  zoneId: z.string(),
  count: z.number().int().positive(),
  seed: z.number().int(),
  sizeRange: z.tuple([z.number().positive(), z.number().positive()]),
});
export type Scatter = z.infer<typeof ScatterSchema>;

export const LibraryAssetRefSchema = z.object({
  id: z.string(),
  source: z.literal('library'),
});

export const GeneratedAssetRefSchema = z.object({
  id: z.string(),
  source: z.literal('generated'),
  prompt: z.string(),
  status: AssetStatusSchema,
  url: z.string().optional(),
  fallbackAssetId: z.string(),
});
export type GeneratedAssetRef = z.infer<typeof GeneratedAssetRefSchema>;

export const AssetRefSchema = z.discriminatedUnion('source', [
  LibraryAssetRefSchema,
  GeneratedAssetRefSchema,
]);
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const SceneSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  title: z.string(),
  bounds: z.object({ size: z.number().positive(), skyHeight: z.number().positive() }),
  terrain: TerrainSchema,
  environment: EnvironmentSchema,
  zones: z.array(ZoneSchema),
  objects: z.array(SceneObjectSchema),
  scatters: z.array(ScatterSchema),
  assets: z.record(z.string(), AssetRefSchema),
  // The child's drawing this world was built from, for B to show beside it.
  sourceImageUrl: z.string().optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

// web/public/assets/library/library.json — written by B, read by A.
export const LibraryEntrySchema = z.object({
  id: z.string(),
  file: z.string(),
  tags: z.array(z.string()),
  defaultSize: z.number().positive(),
  description: z.string(),
});
export type LibraryEntry = z.infer<typeof LibraryEntrySchema>;

export const LibrarySchema = z.array(LibraryEntrySchema);
export type Library = z.infer<typeof LibrarySchema>;

export const StageSchema = z.enum(['read', 'brief', 'build', 'assets', 'done']);
export type Stage = z.infer<typeof StageSchema>;

export const WorldEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stage'), stage: StageSchema }),
  z.object({ type: z.literal('scene'), scene: SceneSchema }),
  z.object({ type: z.literal('log'), text: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type WorldEvent = z.infer<typeof WorldEventSchema>;

// POST /api/worlds is multipart/form-data with one file field, so there is no
// request body schema — these are the limits B's upload UI should enforce too.
export const DRAWING_FIELD = 'drawing';
export const DRAWING_MAX_BYTES = 20 * 1024 * 1024;
export const DRAWING_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export const CreateWorldResponseSchema = z.object({ worldId: z.string() });
export type CreateWorldResponse = z.infer<typeof CreateWorldResponseSchema>;

// Lives here rather than in its own module: a relative import inside the shared
// package has to satisfy both the server's NodeNext resolution (wants the .js
// extension) and Next's bundler (can't resolve it). One file sidesteps that.
// Rules the zod types can't express. Returns every problem found (empty = valid)
// so A can throw with the full list and B can log it.
export function validateSceneRefs(scene: Scene): string[] {
  const problems: string[] = [];
  const zoneIds = new Set(scene.zones.map((z) => z.id));

  const seen = new Set<string>();
  for (const { id } of [...scene.zones, ...scene.objects, ...scene.scatters]) {
    if (seen.has(id)) problems.push(`duplicate id "${id}"`);
    seen.add(id);
  }

  for (const zone of scene.zones) {
    if (zone.elevation > 0 && !zone.platform) {
      problems.push(`zone "${zone.id}" has elevation ${zone.elevation} but no platform`);
    }
  }

  for (const obj of scene.objects) {
    if (!(obj.assetId in scene.assets)) {
      problems.push(`object "${obj.id}" uses unknown asset "${obj.assetId}"`);
    }
    if (obj.zoneId !== undefined && !zoneIds.has(obj.zoneId)) {
      problems.push(`object "${obj.id}" is in unknown zone "${obj.zoneId}"`);
    }
  }

  for (const scatter of scene.scatters) {
    for (const assetId of scatter.assetIds) {
      if (!(assetId in scene.assets)) {
        problems.push(`scatter "${scatter.id}" uses unknown asset "${assetId}"`);
      }
    }
    if (!zoneIds.has(scatter.zoneId)) {
      problems.push(`scatter "${scatter.id}" is in unknown zone "${scatter.zoneId}"`);
    }
    if (scatter.sizeRange[0] > scatter.sizeRange[1]) {
      problems.push(`scatter "${scatter.id}" has sizeRange min > max`);
    }
  }

  for (const [key, asset] of Object.entries(scene.assets)) {
    if (asset.id !== key) problems.push(`asset key "${key}" does not match its id "${asset.id}"`);
    if (asset.source !== 'generated') continue;
    if (asset.status === 'ready' && !asset.url) {
      problems.push(`asset "${key}" is ready but has no url`);
    }
    if (scene.assets[asset.fallbackAssetId]?.source !== 'library') {
      problems.push(`asset "${key}" fallback "${asset.fallbackAssetId}" is not a library asset in scene.assets`);
    }
  }

  const skybox = scene.environment.skybox;
  if (skybox?.status === 'ready' && !skybox.url) problems.push('skybox is ready but has no url');

  return problems;
}
