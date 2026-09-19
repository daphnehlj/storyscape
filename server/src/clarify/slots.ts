import { z } from 'zod';
import {
  ColorTokenSchema,
  EnvironmentPresetSchema,
  LifeTypeSchema,
  PlatformSchema,
  TimeOfDaySchema,
  WeatherSchema,
} from '@app/shared';

// The slot catalogue: every attribute of a world that something downstream can
// actually act on. A thing the story leaves unsaid is only a gap if it maps to
// a slot here — "how tall is the wall" isn't missing, it's irrelevant.

export const MaterialSchema = z.enum(['stone', 'wood', 'brick', 'straw', 'ice', 'candy']);
export type Material = z.infer<typeof MaterialSchema>;

// Rungs, not meters: the size ladder that turns a rung into a height lives
// downstream, next to the other numbers.
export const SizeRungSchema = z.enum(['mouse', 'dog', 'horse', 'house', 'mountain']);
export type SizeRung = z.infer<typeof SizeRungSchema>;

export const FeelSchema = z.enum(['friendly', 'grumpy', 'spooky', 'silly']);
export type Feel = z.infer<typeof FeelSchema>;

export const HeroKindSchema = z.enum(['creature', 'building', 'plant', 'object']);
export type HeroKind = z.infer<typeof HeroKindSchema>;

// Library IDs are only checked for shape here; checking them against
// library.json happens when options are built, since the library can grow.
const LibraryIdSchema = z.string().regex(/^[a-z0-9_]+$/);

export type SlotScope = 'world' | 'zone' | 'hero';

interface SlotDef<S extends z.ZodType> {
  scope: SlotScope;
  vocab: S;
  // Used when the model gave no usable guess. Omitted for slots where "no
  // preference" is a fine answer, e.g. letting the agent pick trees.
  fallback?: z.infer<S>;
  // Visual footprint: how much of what the child will see this slot changes.
  footprint: number;
  // At most one slot per group is asked about per entity.
  exclusionGroup?: string;
}

function slot<S extends z.ZodType>(def: SlotDef<S>): SlotDef<S> {
  return def;
}

export const SLOTS = {
  'world.setting': slot({ scope: 'world', vocab: EnvironmentPresetSchema, fallback: 'meadow', footprint: 1.0 }),
  // Dusk is the renderer's showcase state, so it's the default when nothing is said.
  'world.timeOfDay': slot({ scope: 'world', vocab: TimeOfDaySchema, fallback: 'dusk', footprint: 1.0 }),
  'world.weather': slot({ scope: 'world', vocab: WeatherSchema, fallback: 'clear', footprint: 0.7 }),
  'world.flowers': slot({
    scope: 'world',
    vocab: z.union([ColorTokenSchema, z.literal('none')]),
    fallback: 'none',
    footprint: 0.4,
  }),
  'world.critters': slot({
    scope: 'world',
    vocab: z.union([LifeTypeSchema, z.literal('none')]),
    fallback: 'none',
    footprint: 0.3,
  }),
  'zone.platform': slot({ scope: 'zone', vocab: PlatformSchema, fallback: 'cloud', footprint: 0.5 }),
  'zone.trees': slot({ scope: 'zone', vocab: LibraryIdSchema, footprint: 0.6 }),
  'zone.home': slot({ scope: 'zone', vocab: LibraryIdSchema, footprint: 0.6 }),
  'hero.color': slot({ scope: 'hero', vocab: ColorTokenSchema, footprint: 0.9, exclusionGroup: 'appearance' }),
  'hero.material': slot({ scope: 'hero', vocab: MaterialSchema, footprint: 0.7, exclusionGroup: 'appearance' }),
  'hero.size': slot({ scope: 'hero', vocab: SizeRungSchema, footprint: 0.6 }),
  'hero.feel': slot({ scope: 'hero', vocab: FeelSchema, footprint: 0.5 }),
} as const;

export type SlotKey = keyof typeof SLOTS;
export type SlotValue<K extends SlotKey> = z.infer<(typeof SLOTS)[K]['vocab']>;

export const SLOT_KEYS = Object.keys(SLOTS) as SlotKey[]; // Object.keys widens to string[]

export function slotsForScope(scope: SlotScope): SlotKey[] {
  return SLOT_KEYS.filter((k) => SLOTS[k].scope === scope);
}
