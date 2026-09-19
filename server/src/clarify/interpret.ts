import type { Question } from '@app/shared';
import { SLOTS, type SlotKey } from './slots.js';
import type { Gap } from './types.js';

// What a child typed into "something else", turned into something actionable.
//
// Deterministic on purpose: option labels, then the slot's full vocabulary, then
// a synonym table of the words children actually use. Everything else becomes
// flavour (kept only where a hero's generation prompt can use it) or nothing at
// all, which leaves the gap to inference.
//
// A cheap-tier model call belongs at the end of this chain for the fuzzy cases
// ("like a stormy sky"). It goes behind this same signature, after the
// deterministic passes, and its output is constrained to the same vocabulary —
// so an injected instruction can at worst pick a legal value.

export type Interpretation =
  | { kind: 'option'; optionId: string }
  | { kind: 'value'; value: string } // in vocabulary, but not one of the shown options
  | { kind: 'flavor'; flavor: string } // descriptive, usable in a hero prompt
  | { kind: 'none' };

// Words children use for values our vocabulary spells differently.
const SYNONYMS: Record<string, Record<string, string>> = {
  'world.setting': {
    forest: 'deep_forest',
    woods: 'deep_forest',
    jungle: 'deep_forest',
    beach: 'seaside',
    sea: 'seaside',
    ocean: 'seaside',
    town: 'village',
    city: 'village',
    field: 'meadow',
    grass: 'meadow',
    sky: 'cloud_kingdom',
    clouds: 'cloud_kingdom',
    underground: 'cave',
  },
  'world.timeOfDay': {
    morning: 'dawn',
    sunrise: 'dawn',
    noon: 'day',
    afternoon: 'day',
    daytime: 'day',
    sunset: 'dusk',
    evening: 'dusk',
    midnight: 'night',
    dark: 'night',
  },
  'world.weather': {
    sunny: 'clear',
    sun: 'clear',
    nice: 'clear',
    raining: 'rain',
    rainy: 'rain',
    stormy: 'rain',
    snowing: 'snow',
    snowy: 'snow',
    foggy: 'fog',
    misty: 'fog',
    windy: 'cloudy',
  },
  'world.critters': { bugs: 'fireflies', fairies: 'fireflies', moths: 'butterflies', nothing: 'none' },
  'zone.platform': { clouds: 'cloud', fluffy: 'cloud', stone: 'rock', island: 'rock' },
  'hero.material': {
    rock: 'stone',
    stones: 'stone',
    bricks: 'brick',
    logs: 'wood',
    sticks: 'wood',
    hay: 'straw',
    sweets: 'candy',
    chocolate: 'candy',
    snow: 'ice',
  },
  'hero.size': {
    tiny: 'mouse',
    small: 'mouse',
    little: 'mouse',
    big: 'house',
    huge: 'mountain',
    giant: 'mountain',
    enormous: 'mountain',
    massive: 'mountain',
  },
  'hero.feel': {
    nice: 'friendly',
    kind: 'friendly',
    happy: 'friendly',
    scary: 'spooky',
    creepy: 'spooky',
    spooky: 'spooky',
    angry: 'grumpy',
    cross: 'grumpy',
    funny: 'silly',
    goofy: 'silly',
  },
  'hero.color': { gray: 'grey', golden: 'gold', silver: 'grey', turquoise: 'blue', violet: 'purple' },
  'world.flowers': { gray: 'grey', golden: 'gold', nothing: 'none', nope: 'none' },
};

const FLAVOR_MAX_LENGTH = 40;

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}

function inVocabulary(slot: SlotKey, value: string): boolean {
  return SLOTS[slot].vocab.safeParse(value).success;
}

// `text` must already have passed the safety filter.
export function interpretFreeText(text: string, question: Question, gap: Gap): Interpretation {
  const lower = text.toLowerCase().trim();
  const tokens = words(text);

  // An option the child described in their own words.
  for (const option of question.options) {
    if (lower === option.id || lower === option.label.toLowerCase()) return { kind: 'option', optionId: option.id };
  }
  for (const option of question.options) {
    if (tokens.includes(option.id) || option.label.toLowerCase().includes(lower)) {
      return { kind: 'option', optionId: option.id };
    }
  }

  // In the slot's vocabulary, just not among the four we showed.
  for (const token of tokens) {
    if (inVocabulary(gap.slot, token)) return { kind: 'value', value: token };
    const synonym = SYNONYMS[gap.slot]?.[token];
    if (synonym && inVocabulary(gap.slot, synonym)) return { kind: 'value', value: synonym };
  }

  // Not a value we can act on — but for a generated hero, the words themselves
  // are useful: "sparkly rainbow" makes a sparkly rainbow dragon.
  if (gap.scope === 'hero') return { kind: 'flavor', flavor: text.slice(0, FLAVOR_MAX_LENGTH) };
  return { kind: 'none' };
}
