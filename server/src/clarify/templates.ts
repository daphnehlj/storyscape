import { z } from 'zod';
import {
  COLOR_HEX,
  ColorTokenSchema,
  EnvironmentPresetSchema,
  LifeTypeSchema,
  PlatformSchema,
  TimeOfDaySchema,
  WeatherSchema,
  type ColorToken,
  type LibraryEntry,
  type QuestionOption,
} from '@app/shared';
import { byTags } from '../assets/library.js';
import { FeelSchema, MaterialSchema, SizeRungSchema, type SlotKey } from './slots.js';
import type { Decision, Gap } from './types.js';

// The fixed question template set. A question is always a template with its
// slots filled, and every option label and id comes from code — the only
// model-sourced string a child reads is a name out of their own story.

export type TemplateId =
  | 'hero_color'
  | 'hero_material'
  | 'hero_size'
  | 'hero_feel'
  | 'world_setting'
  | 'world_time'
  | 'world_weather'
  | 'world_flowers'
  | 'world_critters'
  | 'zone_platform'
  | 'zone_trees'
  | 'zone_home'
  | 'conflict_pick';

export interface GapContext {
  gap: Gap;
  library: LibraryEntry[];
  // The name to drop into the prompt, already checked by the safety guard.
  displayName?: string;
}

export interface Template {
  id: TemplateId;
  // 'any': conflict_pick stands in for whichever slot the story contradicts.
  slot: SlotKey | 'any';
  kind: 'choice' | 'color';
  prompt: string;
  // Divergence: how different the options look from each other. This is what
  // keeps a slot like wall height out — nobody would see the difference.
  D: number;
  // Child appeal: how fun and answerable it is for a seven-year-old. Kept in
  // 0.6–1.0 so it breaks ties without overriding visual impact.
  C: number;
  // Answering this changes a hero's generation prompt, so it's asked first:
  // downstream can start that slow job as soon as the answer lands.
  affectsHeroPrompt: boolean;
  // null when this template can't be asked here — usually no library models to
  // show. The gap is then dropped and the next best one promoted.
  buildOptions(ctx: GapContext): QuestionOption[] | null;
}

// ── Labels ────────────────────────────────────────────────────────────────

const TIME_LABELS = { dawn: 'Early morning', day: 'Daytime', dusk: 'Sunset', night: 'Night-time' } as const;
const WEATHER_LABELS = { clear: 'Sunny', cloudy: 'Cloudy', rain: 'Rainy', snow: 'Snowy', fog: 'Foggy' } as const;
const PRESET_LABELS = {
  meadow: 'Sunny meadow',
  deep_forest: 'Deep forest',
  cloud_kingdom: 'Up in the clouds',
  cave: 'Deep in a cave',
  seaside: 'By the sea',
  village: 'A little village',
} as const;
const MATERIAL_LABELS = {
  stone: 'Stone',
  wood: 'Wood',
  brick: 'Bricks',
  straw: 'Straw',
  sand: 'Sand',
  ice: 'Ice',
  candy: 'Candy',
} as const;
const SIZE_LABELS = {
  mouse: 'As small as a mouse',
  dog: 'As big as a dog',
  horse: 'As big as a horse',
  house: 'As big as a house',
  mountain: 'As big as a mountain',
} as const;
const FEEL_LABELS = { friendly: 'Friendly', grumpy: 'Grumpy', spooky: 'Spooky', silly: 'Silly' } as const;
const PLATFORM_LABELS = { cloud: 'Fluffy clouds', rock: 'Floating rock' } as const;
const CRITTER_LABELS = { fireflies: 'Glowing fireflies', butterflies: 'Butterflies', none: 'None' } as const;
const COLOR_LABELS: Record<ColorToken, string> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
  brown: 'Brown',
  grey: 'Grey',
  white: 'White',
  black: 'Black',
  gold: 'Gold',
};

// Labels for whatever a slot's values are, so conflict_pick can phrase the
// child's own two readings without knowing which slot it stood in for.
const SLOT_LABELS: Record<string, Record<string, string>> = {
  'world.setting': PRESET_LABELS,
  'world.timeOfDay': TIME_LABELS,
  'world.weather': WEATHER_LABELS,
  'world.flowers': { ...COLOR_LABELS, none: 'No flowers' },
  'world.critters': CRITTER_LABELS,
  'zone.platform': PLATFORM_LABELS,
  'hero.color': COLOR_LABELS,
  'hero.material': MATERIAL_LABELS,
  'hero.size': SIZE_LABELS,
  'hero.feel': FEEL_LABELS,
};

export function labelFor(slot: SlotKey, value: string): string {
  return SLOT_LABELS[slot]?.[value] ?? value;
}

// ── Option helpers ────────────────────────────────────────────────────────

const MAX_OPTIONS = 4;
const MIN_OPTIONS = 2;

// The child's own readings come first, then our guess, then the rest of the
// vocabulary — so whatever the story hinted at is always on screen, and the
// option that inference would have picked is always offered.
function preferred<T extends string>(gap: Gap, rest: readonly T[]): T[] {
  const ordered: T[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && (rest as readonly string[]).includes(v) && !ordered.includes(v as T)) ordered.push(v as T);
  };
  for (const c of gap.reading.candidates ?? []) push(c);
  push(gap.reading.guess);
  for (const v of rest) push(v);
  // Preference decides which four are shown; vocabulary order decides how they
  // read on the card, so times of day never appear as sunset-then-morning.
  return ordered.slice(0, MAX_OPTIONS).sort((a, b) => rest.indexOf(a) - rest.indexOf(b));
}

function plain<T extends string>(values: T[], labels: Record<string, string>): QuestionOption[] {
  return values.map((v) => ({ id: v, label: labels[v] ?? v }));
}

function swatches(values: ColorToken[]): QuestionOption[] {
  return values.map((v) => ({ id: v, label: COLOR_LABELS[v], swatch: COLOR_HEX[v] }));
}

function libraryOptions(library: LibraryEntry[], tags: string[], gap: Gap): QuestionOption[] | null {
  const matches = byTags(library, tags);
  if (matches.length < MIN_OPTIONS) return null; // nothing to show: skip this question
  const guess = typeof gap.reading.guess === 'string' ? gap.reading.guess : undefined;
  const ordered = [...matches].sort((a, b) => Number(b.id === guess) - Number(a.id === guess));
  return ordered.slice(0, MAX_OPTIONS).map((e) => ({
    id: e.id,
    label: e.description.charAt(0).toUpperCase() + e.description.slice(1),
    previewAssetId: e.id,
  }));
}

// Four rungs of the ladder around the guess, so the choice is always relative to
// something the child can picture.
function sizeWindow(gap: Gap): QuestionOption[] {
  const rungs = SizeRungSchema.options;
  const at = rungs.indexOf(gap.reading.guess as (typeof rungs)[number]);
  const start = Math.min(Math.max(at === -1 ? 1 : at - 2, 0), rungs.length - MAX_OPTIONS);
  return plain([...rungs.slice(start, start + MAX_OPTIONS)], SIZE_LABELS);
}

const PRESET_PREVIEW_TAGS: Record<string, string[]> = {
  meadow: ['tree', 'farm'],
  deep_forest: ['tree', 'forest'],
  cloud_kingdom: ['cloud'],
  cave: ['rock'],
  seaside: ['boat', 'beach'],
  village: ['house', 'village'],
};

// Presets get a thumbnail when the library has something representative, and
// read as plain labels when it doesn't.
function presetOptions(ctx: GapContext): QuestionOption[] {
  const used = new Set<string>();
  return preferred(ctx.gap, EnvironmentPresetSchema.options).map((p) => {
    const matches = byTags(ctx.library, PRESET_PREVIEW_TAGS[p] ?? []);
    const preview = matches.find((e) => !used.has(e.id)) ?? matches[0];
    if (preview) used.add(preview.id);
    return { id: p, label: PRESET_LABELS[p], ...(preview && { previewAssetId: preview.id }) };
  });
}

// ── Templates ─────────────────────────────────────────────────────────────

// Spread across the wheel rather than four neighbouring hues, so the four
// swatches on the card look like four different choices.
const COLOR_ORDER = ['red', 'blue', 'yellow', 'green', 'purple', 'pink', 'orange', 'white', 'brown', 'gold', 'grey', 'black'] as const satisfies readonly ColorToken[];

export const TEMPLATES: Record<TemplateId, Template> = {
  hero_color: {
    id: 'hero_color',
    slot: 'hero.color',
    kind: 'color',
    prompt: 'What colour is {thing}?',
    D: 1.0,
    C: 1.0,
    affectsHeroPrompt: true,
    buildOptions: (ctx) => swatches(preferred(ctx.gap, COLOR_ORDER)),
  },
  hero_material: {
    id: 'hero_material',
    slot: 'hero.material',
    kind: 'choice',
    prompt: 'What is {thing} made of?',
    D: 0.8,
    C: 0.9,
    affectsHeroPrompt: true,
    buildOptions: (ctx) => plain(preferred(ctx.gap, MaterialSchema.options), MATERIAL_LABELS),
  },
  hero_size: {
    id: 'hero_size',
    slot: 'hero.size',
    kind: 'choice',
    prompt: 'How big is {thing}?',
    D: 0.6,
    C: 0.8,
    affectsHeroPrompt: false,
    buildOptions: (ctx) => sizeWindow(ctx.gap),
  },
  hero_feel: {
    id: 'hero_feel',
    slot: 'hero.feel',
    kind: 'choice',
    prompt: 'Is {thing} friendly or scary?',
    D: 0.5,
    C: 0.7,
    affectsHeroPrompt: true,
    buildOptions: (ctx) => plain(preferred(ctx.gap, FeelSchema.options), FEEL_LABELS),
  },
  world_setting: {
    id: 'world_setting',
    slot: 'world.setting',
    kind: 'choice',
    prompt: 'Where does the story happen?',
    D: 1.0,
    C: 0.6,
    affectsHeroPrompt: false,
    buildOptions: presetOptions,
  },
  world_time: {
    id: 'world_time',
    slot: 'world.timeOfDay',
    kind: 'choice',
    prompt: 'When does the story happen?',
    D: 1.0,
    C: 0.8,
    affectsHeroPrompt: false,
    buildOptions: (ctx) => plain(preferred(ctx.gap, TimeOfDaySchema.options), TIME_LABELS),
  },
  world_weather: {
    id: 'world_weather',
    slot: 'world.weather',
    kind: 'choice',
    prompt: "What's the weather like?",
    D: 0.7,
    C: 0.7,
    affectsHeroPrompt: false,
    buildOptions: (ctx) => plain(preferred(ctx.gap, WeatherSchema.options), WEATHER_LABELS),
  },
  world_flowers: {
    id: 'world_flowers',
    slot: 'world.flowers',
    kind: 'color',
    prompt: 'What colour are the flowers?',
    D: 0.5,
    C: 0.7,
    affectsHeroPrompt: false,
    buildOptions: (ctx) => {
      const colors = preferred(ctx.gap, COLOR_ORDER).slice(0, 3);
      return [...swatches(colors), { id: 'none', label: 'No flowers' }];
    },
  },
  world_critters: {
    id: 'world_critters',
    slot: 'world.critters',
    kind: 'choice',
    prompt: 'What little creatures live here?',
    D: 0.4,
    C: 0.9,
    affectsHeroPrompt: false,
    buildOptions: (ctx) => plain(preferred(ctx.gap, [...LifeTypeSchema.options, 'none' as const]), CRITTER_LABELS),
  },
  zone_platform: {
    id: 'zone_platform',
    slot: 'zone.platform',
    kind: 'choice',
    prompt: 'What is {place} floating on?',
    D: 0.6,
    C: 0.8,
    affectsHeroPrompt: false,
    buildOptions: (ctx) => plain(preferred(ctx.gap, PlatformSchema.options), PLATFORM_LABELS),
  },
  zone_trees: {
    id: 'zone_trees',
    slot: 'zone.trees',
    kind: 'choice',
    prompt: 'What trees grow near {place}?',
    D: 0.6,
    C: 0.7,
    affectsHeroPrompt: false,
    buildOptions: (ctx) => libraryOptions(ctx.library, ['tree'], ctx.gap),
  },
  zone_home: {
    id: 'zone_home',
    slot: 'zone.home',
    kind: 'choice',
    prompt: 'What does {place} look like?',
    D: 0.6,
    C: 0.8,
    affectsHeroPrompt: false,
    buildOptions: (ctx) => libraryOptions(ctx.library, ['house', 'castle', 'tower'], ctx.gap),
  },
  // The story contradicts itself, so the options are the child's own two
  // versions: maximum divergence, and the most authorship-positive question we ask.
  conflict_pick: {
    id: 'conflict_pick',
    slot: 'any',
    kind: 'choice',
    prompt: 'In your story, was it {a} or {b}?',
    D: 1.0,
    C: 0.9,
    affectsHeroPrompt: false,
    buildOptions: (ctx) => {
      const candidates = (ctx.gap.reading.candidates ?? []).filter((c): c is string => typeof c === 'string');
      if (candidates.length < MIN_OPTIONS) return null;
      return candidates.slice(0, MAX_OPTIONS).map((v) => ({
        id: v,
        label: labelFor(ctx.gap.slot, v),
        ...(ctx.gap.slot === 'hero.color' && { swatch: COLOR_HEX[v as ColorToken] }),
      }));
    },
  },
};

const TEMPLATE_FOR_SLOT: Record<SlotKey, TemplateId> = {
  'world.setting': 'world_setting',
  'world.timeOfDay': 'world_time',
  'world.weather': 'world_weather',
  'world.flowers': 'world_flowers',
  'world.critters': 'world_critters',
  'zone.platform': 'zone_platform',
  'zone.trees': 'zone_trees',
  'zone.home': 'zone_home',
  'hero.color': 'hero_color',
  'hero.material': 'hero_material',
  'hero.size': 'hero_size',
  'hero.feel': 'hero_feel',
};

// A contradiction is asked about with conflict_pick whatever the slot: the
// child's own two readings are better options than our vocabulary.
export function templateFor(slot: SlotKey, isConflict: boolean): TemplateId {
  return isConflict ? 'conflict_pick' : TEMPLATE_FOR_SLOT[slot];
}

// A value becomes a typed decision. Used for answers, for what the story stated
// outright, and for inferred guesses — same shapes whatever the source, so
// nothing downstream can tell them apart by accident.
export function toDecision(slot: SlotKey, entityId: string | undefined, value: string): Decision | null {
  const inVocab = <T>(schema: z.ZodType<T>): T | null => {
    const r = schema.safeParse(value);
    return r.success ? r.data : null;
  };
  const zoneId = entityId ?? '';
  const heroId = entityId ?? '';

  switch (slot) {
    case 'world.setting': {
      const preset = inVocab(EnvironmentPresetSchema);
      return preset && { slot: 'world.setting', preset };
    }
    case 'world.timeOfDay': {
      const v = inVocab(TimeOfDaySchema);
      return v && { slot: 'world.timeOfDay', value: v };
    }
    case 'world.weather': {
      const v = inVocab(WeatherSchema);
      return v && { slot: 'world.weather', value: v };
    }
    case 'world.flowers': {
      if (value === 'none') return { slot: 'world.flowers', color: 'none' };
      const c = inVocab(ColorTokenSchema);
      return c && { slot: 'world.flowers', color: c };
    }
    case 'world.critters': {
      if (value === 'none') return { slot: 'world.critters', value: 'none' };
      const v = inVocab(LifeTypeSchema);
      return v && { slot: 'world.critters', value: v };
    }
    case 'zone.platform': {
      const v = inVocab(PlatformSchema);
      return v && { slot: 'zone.platform', zoneId, value: v };
    }
    case 'zone.trees':
      return { slot: 'zone.trees', zoneId, assetId: value };
    case 'zone.home':
      return { slot: 'zone.home', zoneId, assetId: value };
    case 'hero.color': {
      const c = inVocab(ColorTokenSchema);
      return c && { slot: 'hero.color', heroId, color: c };
    }
    case 'hero.material': {
      const v = inVocab(MaterialSchema);
      return v && { slot: 'hero.material', heroId, value: v };
    }
    case 'hero.size': {
      const v = inVocab(SizeRungSchema);
      return v && { slot: 'hero.size', heroId, rung: v };
    }
    case 'hero.feel': {
      const v = inVocab(FeelSchema);
      return v && { slot: 'hero.feel', heroId, value: v };
    }
  }
}
