import type { SlotKey } from './slots.js';

// The fixed question template set. A question is always a template with its
// slots filled — never model-written text. Options come from code too, so the
// only model-sourced string a child ever reads is a name from their own story.
//
// Option building and answer mapping arrive with the question builder; this file
// currently carries each template's identity and its two scoring constants.

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

export interface TemplateScoring {
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
}

function t(s: TemplateScoring): TemplateScoring {
  return s;
}

export const TEMPLATES: Record<TemplateId, TemplateScoring> = {
  hero_color: t({ id: 'hero_color', slot: 'hero.color', kind: 'color', prompt: 'What colour is {thing}?', D: 1.0, C: 1.0, affectsHeroPrompt: true }),
  hero_material: t({ id: 'hero_material', slot: 'hero.material', kind: 'choice', prompt: 'What is {thing} made of?', D: 0.8, C: 0.9, affectsHeroPrompt: true }),
  hero_size: t({ id: 'hero_size', slot: 'hero.size', kind: 'choice', prompt: 'How big is {thing}?', D: 0.6, C: 0.8, affectsHeroPrompt: false }),
  hero_feel: t({ id: 'hero_feel', slot: 'hero.feel', kind: 'choice', prompt: 'Is {thing} friendly or scary?', D: 0.5, C: 0.7, affectsHeroPrompt: true }),
  world_setting: t({ id: 'world_setting', slot: 'world.setting', kind: 'choice', prompt: 'Where does the story happen?', D: 1.0, C: 0.6, affectsHeroPrompt: false }),
  world_time: t({ id: 'world_time', slot: 'world.timeOfDay', kind: 'choice', prompt: 'When does the story happen?', D: 1.0, C: 0.8, affectsHeroPrompt: false }),
  world_weather: t({ id: 'world_weather', slot: 'world.weather', kind: 'choice', prompt: "What's the weather like?", D: 0.7, C: 0.7, affectsHeroPrompt: false }),
  world_flowers: t({ id: 'world_flowers', slot: 'world.flowers', kind: 'color', prompt: 'What colour are the flowers?', D: 0.5, C: 0.7, affectsHeroPrompt: false }),
  world_critters: t({ id: 'world_critters', slot: 'world.critters', kind: 'choice', prompt: 'What little creatures live here?', D: 0.4, C: 0.9, affectsHeroPrompt: false }),
  zone_platform: t({ id: 'zone_platform', slot: 'zone.platform', kind: 'choice', prompt: 'What is {place} floating on?', D: 0.6, C: 0.8, affectsHeroPrompt: false }),
  zone_trees: t({ id: 'zone_trees', slot: 'zone.trees', kind: 'choice', prompt: 'What trees grow near {place}?', D: 0.6, C: 0.7, affectsHeroPrompt: false }),
  zone_home: t({ id: 'zone_home', slot: 'zone.home', kind: 'choice', prompt: "What does {character}'s home look like?", D: 0.6, C: 0.8, affectsHeroPrompt: false }),
  // The story contradicts itself, so the options are the child's own two
  // versions: maximum divergence, and the most authorship-positive question we ask.
  conflict_pick: t({ id: 'conflict_pick', slot: 'any', kind: 'choice', prompt: 'In your story, was it {a} or {b}?', D: 1.0, C: 0.9, affectsHeroPrompt: false }),
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
