import { z } from 'zod';
import { HeroKindSchema } from '../clarify/slots.js';

// The World Brief as Stage 2 returns it. Internal to the server — not part of
// the shared contract.
//
// Structure is strict: a brief with no usable zones or heroes is a failed
// Stage 2 call and should be retried. Readings are deliberately left as
// `unknown` here; normalizeBrief checks each one against its slot's vocabulary
// and falls back per slot, so one bad reading never sinks the whole brief.

const EntityIdSchema = z.string().regex(/^[a-z0-9_]+$/);
const RawReadingsSchema = z.record(z.string(), z.unknown()).default({});

export const RawBriefZoneSchema = z.object({
  id: EntityIdSchema,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  elevation: z.enum(['ground', 'sky']),
  owner: z.string().optional(),
  description: z.string(),
  readings: RawReadingsSchema,
});

export const RawBriefHeroSchema = z.object({
  id: EntityIdSchema,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  kind: HeroKindSchema,
  zone: EntityIdSchema.optional(),
  description: z.string(),
  readings: RawReadingsSchema,
});

export const RawBriefSchema = z.object({
  title: z.string(),
  mood: z.string(),
  world: RawReadingsSchema,
  zones: z.array(RawBriefZoneSchema).min(1),
  heroObjects: z.array(RawBriefHeroSchema).max(4),
  ambientObjects: z.array(z.string()).default([]),
});

export type RawBrief = z.infer<typeof RawBriefSchema>;
export type RawBriefZone = z.infer<typeof RawBriefZoneSchema>;
export type RawBriefHero = z.infer<typeof RawBriefHeroSchema>;
