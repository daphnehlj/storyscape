import { z } from 'zod';

// The only thing server/ and web/ share. Types are inferred from the schemas —
// never hand-write a parallel interface. See story-arch.md §4.

// ── Primitives ────────────────────────────────────────────────────────────

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3Schema>;

export const SourceSchema = z.enum(['stated', 'asked', 'inferred']);
export type Source = z.infer<typeof SourceSchema>;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// Adding a value here is a breaking change in practice: B must ship the preset first.
export const EnvironmentPresetSchema = z.enum([
  'meadow',
  'deep_forest',
  'cloud_kingdom',
  'cave',
  'seaside',
  'village',
]);
export type EnvironmentPreset = z.infer<typeof EnvironmentPresetSchema>;

export const BiomeSchema = z.enum(['grassland', 'forest', 'desert', 'snow', 'swamp', 'beach']);
export type Biome = z.infer<typeof BiomeSchema>;

export const TimeOfDaySchema = z.enum(['dawn', 'day', 'dusk', 'night']);
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

export const WeatherSchema = z.enum(['clear', 'cloudy', 'rain', 'snow', 'fog']);
export type Weather = z.infer<typeof WeatherSchema>;

export const PlatformSchema = z.enum(['cloud', 'rock']);
export type Platform = z.infer<typeof PlatformSchema>;

export const GroundCoverTypeSchema = z.enum(['grass', 'flower', 'reed', 'mushroom', 'pebble']);
export type GroundCoverType = z.infer<typeof GroundCoverTypeSchema>;

export const LifeTypeSchema = z.enum(['fireflies', 'butterflies']);
export type LifeType = z.infer<typeof LifeTypeSchema>;

// ── Scene (§4.2) ──────────────────────────────────────────────────────────

export const ZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  center: z.tuple([z.number(), z.number()]),
  radius: z.number().positive(),
  elevation: z.number(),
  platform: PlatformSchema.optional(),
  storyNote: z.string().optional(),
  source: SourceSchema.optional(),
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
  source: SourceSchema.optional(),
});
export type SceneObject = z.infer<typeof SceneObjectSchema>;

export const ScatterSchema = z.object({
  id: z.string(),
  assetIds: z.array(z.string()).min(1),
  zoneId: z.string(),
  count: z.number().int().nonnegative(),
  seed: z.number(),
  sizeRange: z.tuple([z.number(), z.number()]),
});
export type Scatter = z.infer<typeof ScatterSchema>;

export const GroundCoverLayerSchema = z.object({
  id: z.string(),
  type: GroundCoverTypeSchema,
  color: HexColorSchema,
  density: z.number().min(0).max(1),
  clusterScale: z.number().optional(),
  zoneIds: z.array(z.string()).optional(),
});
export type GroundCoverLayer = z.infer<typeof GroundCoverLayerSchema>;

export const LifeSpawnSchema = z.object({
  id: z.string(),
  type: LifeTypeSchema,
  zoneId: z.string(),
  count: z.number().int().nonnegative(),
});
export type LifeSpawn = z.infer<typeof LifeSpawnSchema>;

export const AssetRefSchema = z.discriminatedUnion('source', [
  z.object({ id: z.string(), source: z.literal('library') }),
  z.object({
    id: z.string(),
    source: z.literal('generated'),
    prompt: z.string(),
    status: z.enum(['pending', 'ready', 'failed']),
    url: z.string().optional(),
    fallbackAssetId: z.string(),
  }),
]);
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const SceneSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  title: z.string(),
  bounds: z.object({ size: z.number().positive(), skyHeight: z.number().positive() }),
  terrain: z.object({
    biome: BiomeSchema,
    heightVariation: z.number().min(0).max(1),
    seed: z.number(),
    water: z.object({ level: z.number() }).optional(),
  }),
  environment: z.object({
    preset: EnvironmentPresetSchema,
    timeOfDay: TimeOfDaySchema,
    weather: WeatherSchema,
    fogDensity: z.number().min(0).max(1).optional(),
    skybox: z
      .object({ status: z.enum(['pending', 'ready', 'failed']), url: z.string().optional() })
      .optional(),
  }),
  zones: z.array(ZoneSchema),
  objects: z.array(SceneObjectSchema),
  scatters: z.array(ScatterSchema),
  groundCover: z.array(GroundCoverLayerSchema),
  life: z.array(LifeSpawnSchema),
  assets: z.record(z.string(), AssetRefSchema),
});
export type Scene = z.infer<typeof SceneSchema>;

// ── Colour tokens ─────────────────────────────────────────────────────────

// The model only ever sees these names, never hex. The hex lives here rather
// than in web presets because the server must fill Question swatches with it.
export const ColorTokenSchema = z.enum([
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'brown',
  'grey',
  'white',
  'black',
  'gold',
]);
export type ColorToken = z.infer<typeof ColorTokenSchema>;

export const COLOR_HEX: Record<ColorToken, string> = {
  red: '#e0443c',
  orange: '#f28c28',
  yellow: '#f5d33b',
  green: '#4caf50',
  blue: '#3b82e0',
  purple: '#8e5bd6',
  pink: '#f27eb4',
  brown: '#8b5a2b',
  grey: '#8f98a0',
  white: '#f4f4f0',
  black: '#26262b',
  gold: '#d4a73c',
};

// ── Questions and answers (§4.3) ──────────────────────────────────────────

export const MAX_QUESTIONS = 5;

export const QuestionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  swatch: HexColorSchema.optional(),
  previewAssetId: z.string().optional(),
});
export type QuestionOption = z.infer<typeof QuestionOptionSchema>;

export const QuestionSchema = z.object({
  id: z.string(),
  gapId: z.string(),
  templateId: z.string(),
  prompt: z.string(),
  kind: z.enum(['choice', 'color']),
  options: z.array(QuestionOptionSchema).min(2).max(4),
  allowFreeText: z.boolean(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const FREE_TEXT_MAX_LENGTH = 60;

// Skipping a single question means not posting an answer for it, so an answer
// always carries either a chosen option or free text.
export const AnswerSchema = z
  .object({
    questionId: z.string(),
    optionId: z.string().optional(),
    text: z.string().trim().min(1).max(FREE_TEXT_MAX_LENGTH).optional(),
  })
  .refine((a) => a.optionId !== undefined || a.text !== undefined, {
    message: 'answer needs optionId or text',
  });
export type Answer = z.infer<typeof AnswerSchema>;

// ── Gap report (debug overlay) ────────────────────────────────────────────

export const EvidenceSchema = z.enum(['explicit', 'vague', 'absent', 'conflict']);
export type Evidence = z.infer<typeof EvidenceSchema>;

// Slot and template ids stay plain strings here: the catalogue is server-internal
// and grows without needing a contract change.
export const GapReportSchema = z.object({
  id: z.string(),
  slot: z.string(),
  entity: z.string().optional(),
  evidence: EvidenceSchema,
  templateId: z.string().optional(),
  factors: z.object({ V: z.number(), P: z.number(), U: z.number(), D: z.number(), C: z.number() }),
  score: z.number(),
  selected: z.boolean(),
  reason: z.string(),
  inferred: z.string(),
});
export type GapReport = z.infer<typeof GapReportSchema>;

// ── HTTP API (§4.5) ───────────────────────────────────────────────────────

export const STORY_MAX_LENGTH = 100_000;

export const CreateWorldRequestSchema = z.object({
  story: z.string().trim().min(1).max(STORY_MAX_LENGTH),
});
export type CreateWorldRequest = z.infer<typeof CreateWorldRequestSchema>;

export const CreateWorldResponseSchema = z.object({ worldId: z.string() });
export type CreateWorldResponse = z.infer<typeof CreateWorldResponseSchema>;

// Posts accumulate: each answer can be sent as it's given, and re-posting a
// questionId overwrites it. An empty array means "skip the rest".
export const AnswersRequestSchema = z.object({
  answers: z.array(AnswerSchema).max(MAX_QUESTIONS),
});
export type AnswersRequest = z.infer<typeof AnswersRequestSchema>;

// `rejected` lists questionIds whose free text the safety filter refused;
// those questions stay unanswered.
export const AnswersResponseSchema = z.object({
  ok: z.literal(true),
  rejected: z.array(z.string()).optional(),
});
export type AnswersResponse = z.infer<typeof AnswersResponseSchema>;

export const GetAnswersResponseSchema = z.object({ answers: z.array(AnswerSchema) });
export type GetAnswersResponse = z.infer<typeof GetAnswersResponseSchema>;

// ── Events (§4.6) ─────────────────────────────────────────────────────────

export const StageSchema = z.enum(['compress', 'brief', 'clarify', 'build', 'assets', 'done']);
export type Stage = z.infer<typeof StageSchema>;

export const WorldEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stage'), stage: StageSchema }),
  z.object({ type: z.literal('questions'), questions: z.array(QuestionSchema).max(MAX_QUESTIONS) }),
  z.object({ type: z.literal('gaps'), gaps: z.array(GapReportSchema) }),
  z.object({ type: z.literal('scene'), scene: SceneSchema }),
  z.object({
    type: z.literal('log'),
    text: z.string(),
    tool: z.string().optional(),
    rationale: z.string().optional(),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type WorldEvent = z.infer<typeof WorldEventSchema>;

// ── Asset library (§4.4) ──────────────────────────────────────────────────

export const LibraryEntrySchema = z.object({
  id: z.string(),
  file: z.string(),
  tags: z.array(z.string()),
  defaultSize: z.number().positive(),
  description: z.string(),
});
export type LibraryEntry = z.infer<typeof LibraryEntrySchema>;

export const LibrarySchema = z.array(LibraryEntrySchema);
