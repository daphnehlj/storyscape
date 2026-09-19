import { isSafeSlotValue, sharesWordWithStory } from '../safety/filter.js';
import type { HeroKind } from './slots.js';

// Filling a template's slots is the one place model text reaches a child, so the
// name has to earn it: short, wordlike, and actually present in the story the
// child wrote. Anything else falls back to a generic noun.

const GENERIC_BY_KIND: Record<HeroKind, string> = {
  creature: 'this creature',
  building: 'this building',
  plant: 'this plant',
  object: 'this thing',
};

const DETERMINER = /^(?:the|a|an|my|his|her|their|our|its)\b/i;

// "beanstalk" → "the beanstalk"; "Sparkel" and "my cat" are left alone.
function withArticle(name: string): string {
  if (DETERMINER.test(name)) return name;
  if (/^[\p{Lu}]/u.test(name)) return name; // a proper name doesn't take an article
  return `the ${name}`;
}

export function displayName(
  name: string | undefined,
  story: string,
  fallback: { kind?: HeroKind; scope: 'zone' | 'hero' },
): string {
  if (name && isSafeSlotValue(name, story)) return withArticle(name);
  // The brief says "the dragon" where the story said "a dragon", so check the
  // bare noun too and put our own article on it.
  const bare = name?.replace(DETERMINER, '').trim();
  if (bare && isSafeSlotValue(bare, story)) return withArticle(bare);
  // "Jack's farm" is the model's phrasing of the child's own words.
  if (name && sharesWordWithStory(name, story)) return withArticle(name);
  if (fallback.scope === 'zone') return 'this place';
  return GENERIC_BY_KIND[fallback.kind ?? 'object'];
}

// Returns null when a slot was left unfilled — better no question than a
// question with a hole in it.
export function fillPrompt(template: string, values: Record<string, string>): string | null {
  const filled = template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
  return /\{\w+\}/.test(filled) ? null : filled;
}
