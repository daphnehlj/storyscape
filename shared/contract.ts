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
  seed: z.number(),
  water: z.object({ level: z.number() }).optional(),
});
export type Terrain = z.infer<typeof TerrainSchema>;

export const SkyboxSchema = z.object({
  status: AssetStatusSchema,
  url: z.string().optional(), // required when status === 'ready' (checked in validateSceneRefs)
});

// Exactly three colours, in this order. The renderer derives sky, fog, light and
// terrain tint from them and never invents a colour of its own.
export const PaletteSchema = z.tuple([
  HexColorSchema, // sky / horizon
  HexColorSchema, // ground
  HexColorSchema, // accent / zenith
]);
export type Palette = z.infer<typeof PaletteSchema>;

export const EnvironmentSchema = z.object({
  timeOfDay: TimeOfDaySchema,
  weather: WeatherSchema,
  fogDensity: z.number().min(0).max(1),
  palette: PaletteSchema,
  skybox: SkyboxSchema.optional(),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export const ZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  center: z.tuple([z.number(), z.number()]), // x, z
  radius: z.number().positive(),
  elevation: z.number().min(0),
  platform: PlatformSchema.optional(), // required when elevation > 0 (checked in validateSceneRefs)
  storyNote: z.string().optional(),
});
export type Zone = z.infer<typeof ZoneSchema>;

export const SceneObjectSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  zoneId: z.string().optional(),
  position: Vec3Schema,
  snapToGround: z.boolean(),
  rotationY: z.number(), // degrees
  size: z.number().positive(), // target height in meters
  label: z.string().optional(),
  storyNote: z.string().optional(),
});
export type SceneObject = z.infer<typeof SceneObjectSchema>;

export const ScatterSchema = z.object({
  id: z.string(),
  assetIds: z.array(z.string()).min(1),
  zoneId: z.string(),
  count: z.number().int().min(1),
  seed: z.number(),
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
  url: z.string().optional(), // required when status === 'ready'
  fallbackAssetId: z.string(), // a library asset id
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
  // The drawing this world was built from, for the web app to show beside it.
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
  z.object({ type: z.literal('scene'), scene: SceneSchema }), // always the FULL scene
  z.object({ type: z.literal('log'), text: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type WorldEvent = z.infer<typeof WorldEventSchema>;

// POST /api/worlds is multipart/form-data with one file field, so there is no
// request body schema — these are the limits the upload UI should enforce too.
export const DRAWING_FIELD = 'drawing';
export const DRAWING_MAX_BYTES = 20 * 1024 * 1024;
export const DRAWING_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export const CreateWorldResponseSchema = z.object({ worldId: z.string() });
export type CreateWorldResponse = z.infer<typeof CreateWorldResponseSchema>;

/**
 * Rules the types can't express. Returns [] when valid.
 * Pass `libraryIds` to also check library assets exist in library.json.
 *
 * Lives here rather than in its own module: a relative import inside the shared
 * package has to satisfy both the server's NodeNext resolution (wants a .js
 * extension) and Next's bundler (can't resolve it). One file sidesteps that.
 */
export function validateSceneRefs(scene: Scene, libraryIds?: Set<string>): string[] {
  const errs: string[] = [];
  const zoneIds = new Set(scene.zones.map((z) => z.id));

  const ids = [...scene.zones, ...scene.objects, ...scene.scatters].map((x) => x.id);
  if (new Set(ids).size !== ids.length) errs.push('duplicate ids across zones/objects/scatters');

  for (const z of scene.zones) {
    if (z.elevation > 0 && !z.platform) errs.push(`zone ${z.id}: elevation > 0 requires platform`);
  }

  for (const o of scene.objects) {
    if (!scene.assets[o.assetId]) errs.push(`object ${o.id}: unknown asset ${o.assetId}`);
    if (o.zoneId && !zoneIds.has(o.zoneId)) errs.push(`object ${o.id}: unknown zone ${o.zoneId}`);
  }

  for (const s of scene.scatters) {
    if (!zoneIds.has(s.zoneId)) errs.push(`scatter ${s.id}: unknown zone ${s.zoneId}`);
    for (const a of s.assetIds) if (!scene.assets[a]) errs.push(`scatter ${s.id}: unknown asset ${a}`);
    if (s.sizeRange[0] > s.sizeRange[1]) errs.push(`scatter ${s.id}: sizeRange min > max`);
  }

  for (const [key, a] of Object.entries(scene.assets)) {
    if (a.id !== key) errs.push(`asset ${key}: key does not match its id ${a.id}`);
    if (a.source === 'library') {
      if (libraryIds && !libraryIds.has(a.id)) errs.push(`asset ${a.id}: not in library.json`);
    } else {
      if (a.status === 'ready' && !a.url) errs.push(`asset ${a.id}: ready without url`);
      const fb = scene.assets[a.fallbackAssetId];
      if (!fb || fb.source !== 'library') errs.push(`asset ${a.id}: fallbackAssetId must be a library asset`);
    }
  }

  const skybox = scene.environment.skybox;
  if (skybox?.status === 'ready' && !skybox.url) errs.push('skybox: ready without url');

  return errs;
}
