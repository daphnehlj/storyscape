import { z } from 'zod'

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])

export const ZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  center: z.tuple([z.number(), z.number()]), // x, z
  radius: z.number().positive(),
  elevation: z.number().min(0),
  platform: z.enum(['cloud', 'rock']).optional(), // required when elevation > 0 (checked in validateSceneRefs)
  storyNote: z.string().optional(),
})

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
})

export const ScatterSchema = z.object({
  id: z.string(),
  assetIds: z.array(z.string()).min(1),
  zoneId: z.string(),
  count: z.number().int().min(1),
  seed: z.number(),
  sizeRange: z.tuple([z.number().positive(), z.number().positive()]),
})

export const AssetRefSchema = z.discriminatedUnion('source', [
  z.object({ id: z.string(), source: z.literal('library') }),
  z.object({
    id: z.string(),
    source: z.literal('generated'),
    prompt: z.string(),
    status: z.enum(['pending', 'ready', 'failed']),
    url: z.string().optional(), // required when status === 'ready' (checked in validateSceneRefs)
    fallbackAssetId: z.string(), // a library asset id
  }),
])

export const SceneSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  title: z.string(),
  bounds: z.object({ size: z.number().positive(), skyHeight: z.number().positive() }),
  terrain: z.object({
    biome: z.enum(['grassland', 'forest', 'desert', 'snow', 'swamp', 'beach']),
    heightVariation: z.number().min(0).max(1),
    seed: z.number(),
    water: z.object({ level: z.number() }).optional(),
  }),
  environment: z.object({
    timeOfDay: z.enum(['dawn', 'day', 'dusk', 'night']),
    weather: z.enum(['clear', 'cloudy', 'rain', 'snow', 'fog']),
    fogDensity: z.number().min(0).max(1),
    palette: z.tuple([z.string(), z.string(), z.string()]), // hex: [sky/horizon, ground, accent/zenith] — the renderer never invents colours
    skybox: z.object({ status: z.enum(['pending', 'ready', 'failed']), url: z.string().optional() }).optional(),
  }),
  zones: z.array(ZoneSchema),
  objects: z.array(SceneObjectSchema),
  scatters: z.array(ScatterSchema),
  assets: z.record(z.string(), AssetRefSchema),
})

export const WorldEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stage'), stage: z.enum(['compress', 'brief', 'build', 'assets', 'done']) }),
  z.object({ type: z.literal('scene'), scene: SceneSchema }), // always the FULL scene
  z.object({ type: z.literal('log'), text: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
])

export type Vec3 = z.infer<typeof Vec3Schema>
export type Zone = z.infer<typeof ZoneSchema>
export type SceneObject = z.infer<typeof SceneObjectSchema>
export type Scatter = z.infer<typeof ScatterSchema>
export type AssetRef = z.infer<typeof AssetRefSchema>
export type Scene = z.infer<typeof SceneSchema>
export type WorldEvent = z.infer<typeof WorldEventSchema>
export type Stage = Extract<WorldEvent, { type: 'stage' }>['stage']

/** Rules the types can't express. Returns [] when valid. */
export function validateSceneRefs(scene: Scene, libraryIds?: Set<string>): string[] {
  const errs: string[] = []
  const zoneIds = new Set(scene.zones.map((z) => z.id))
  const ids = [...scene.zones, ...scene.objects, ...scene.scatters].map((x) => x.id)
  if (new Set(ids).size !== ids.length) errs.push('duplicate ids across zones/objects/scatters')
  for (const z of scene.zones) {
    if (z.elevation > 0 && !z.platform) errs.push(`zone ${z.id}: elevation > 0 requires platform`)
  }
  for (const o of scene.objects) {
    if (!scene.assets[o.assetId]) errs.push(`object ${o.id}: unknown asset ${o.assetId}`)
    if (o.zoneId && !zoneIds.has(o.zoneId)) errs.push(`object ${o.id}: unknown zone ${o.zoneId}`)
  }
  for (const s of scene.scatters) {
    if (!zoneIds.has(s.zoneId)) errs.push(`scatter ${s.id}: unknown zone ${s.zoneId}`)
    for (const a of s.assetIds) if (!scene.assets[a]) errs.push(`scatter ${s.id}: unknown asset ${a}`)
  }
  for (const a of Object.values(scene.assets)) {
    if (a.source === 'library') {
      if (libraryIds && !libraryIds.has(a.id)) errs.push(`asset ${a.id}: not in library.json`)
    } else {
      if (a.status === 'ready' && !a.url) errs.push(`asset ${a.id}: ready without url`)
      const fb = scene.assets[a.fallbackAssetId]
      if (!fb || fb.source !== 'library') errs.push(`asset ${a.id}: fallbackAssetId must be a library asset`)
    }
  }
  return errs
}
