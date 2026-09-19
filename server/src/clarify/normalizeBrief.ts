import type { RawBrief, RawBriefHero, RawBriefZone } from '../pipeline/briefSchema.js';
import { normalizeReadings, type Readings } from './readings.js';
import { slotsForScope, type SlotKey } from './slots.js';

type WorldSlot = Extract<SlotKey, `world.${string}`>;
type ZoneSlot = Extract<SlotKey, `zone.${string}`>;
type HeroSlot = Extract<SlotKey, `hero.${string}`>;

export type BriefZone = Omit<RawBriefZone, 'readings'> & { readings: Readings<ZoneSlot> };
export type BriefHero = Omit<RawBriefHero, 'readings'> & { readings: Readings<HeroSlot> };

// A brief whose every applicable slot has a well-formed reading. Everything
// downstream of Stage 2 (gap detection, questions, resolution) takes this.
export interface Brief {
  title: string;
  mood: string;
  world: Readings<WorldSlot>;
  zones: BriefZone[];
  heroObjects: BriefHero[];
  ambientObjects: string[];
  // Every repair made while normalizing, for the debug overlay and logs.
  issues: string[];
}

const WORLD_SLOTS = slotsForScope('world') as WorldSlot[]; // slotsForScope('world') only returns world.* keys

// Which slots make sense for a zone. A sky zone has a platform but no trees; a
// home is only asked about when someone lives there and the home isn't already
// a hero object (the giant's castle is the giant's home).
function zoneSlots(zone: RawBriefZone, heroes: RawBriefHero[]): ZoneSlot[] {
  const slots: ZoneSlot[] = [];
  if (zone.elevation === 'sky') slots.push('zone.platform');
  if (zone.elevation === 'ground') slots.push('zone.trees');
  const homeIsHero = heroes.some((h) => h.zone === zone.id && h.kind === 'building');
  if (zone.owner && !homeIsHero) slots.push('zone.home');
  return slots;
}

// Only generated heroes get appearance slots: library models can't be
// recoloured, so asking about them would change nothing on screen.
function heroSlots(hero: RawBriefHero): HeroSlot[] {
  const slots: HeroSlot[] = ['hero.color', 'hero.size', 'hero.feel'];
  if (hero.kind === 'building') slots.push('hero.material');
  return slots;
}

function uniqueAliases(name: string, aliases: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of [name, ...aliases]) {
    const key = a.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(a.trim());
    }
  }
  return out;
}

// IDs key questions, gaps and decisions, so a duplicate would silently merge two
// entities. Repair rather than reject: a suffixed id is harmless.
function dedupeIds<T extends { id: string }>(items: T[], taken: Set<string>, issues: string[]): T[] {
  return items.map((item) => {
    if (!taken.has(item.id)) {
      taken.add(item.id);
      return item;
    }
    let n = 2;
    while (taken.has(`${item.id}_${n}`)) n++;
    const id = `${item.id}_${n}`;
    taken.add(id);
    issues.push(`duplicate id ${item.id} renamed to ${id}`);
    return { ...item, id };
  });
}

export function normalizeBrief(raw: RawBrief): Brief {
  const issues: string[] = [];
  const taken = new Set<string>();
  const rawZones = dedupeIds(raw.zones, taken, issues);
  const zoneIds = new Set(rawZones.map((z) => z.id));

  const rawHeroes = dedupeIds(raw.heroObjects, taken, issues).map((h) => {
    if (h.zone === undefined || zoneIds.has(h.zone)) return h;
    issues.push(`hero ${h.id}: zone ${h.zone} does not exist, cleared`);
    const { zone: _dropped, ...rest } = h;
    return rest;
  });

  const zones: BriefZone[] = rawZones.map((z) => ({
    ...z,
    aliases: uniqueAliases(z.name, z.aliases),
    readings: normalizeReadings(zoneSlots(z, rawHeroes), z.readings, issues, `zone ${z.id}`),
  }));

  const heroObjects: BriefHero[] = rawHeroes.map((h) => ({
    ...h,
    aliases: uniqueAliases(h.name, h.aliases),
    readings: normalizeReadings(heroSlots(h), h.readings, issues, `hero ${h.id}`),
  }));

  return {
    title: raw.title,
    mood: raw.mood,
    world: normalizeReadings(WORLD_SLOTS, raw.world, issues, 'world'),
    zones,
    heroObjects,
    ambientObjects: raw.ambientObjects,
    issues,
  };
}
