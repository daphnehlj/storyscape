import { z } from 'zod';
import { HexColorSchema, PaletteSchema, TimeOfDaySchema, WeatherSchema, type Library, type Palette } from '@app/shared';
import { MAX_HERO_OBJECTS } from '../config.js';
import { completeJson } from '../llm/index.js';
import { briefPrompt, type KeyObject } from '../prompts.js';
import type { DrawingReading } from './readDrawing.js';

// Internal to the server — not part of the contract. Every field is required
// (nullable where optional) because OpenAI strict structured output demands it.
export const BriefSchema = z.object({
  title: z.string(),
  mood: z.string(),
  // A 3-item array rather than the contract's tuple: OpenAI strict Structured
  // Outputs cannot represent tuple-form `items`. Converted to the tuple below.
  palette: z.array(HexColorSchema).length(3),
  timeOfDay: TimeOfDaySchema,
  weather: WeatherSchema,
  zones: z
    .array(
      z.object({
        name: z.string(),
        elevation: z.enum(['ground', 'sky']),
        description: z.string(),
      }),
    )
    .min(1)
    .max(6),
  heroObjects: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        size: z.number(),
        // The closest library model. Everything is built from the library, so
        // this is the model the child's object will actually become.
        libraryAssetId: z.string(),
      }),
    )
    .max(MAX_HERO_OBJECTS),
  ambientObjects: z.array(z.string()),
});
export type Brief = z.infer<typeof BriefSchema>;
export type HeroObject = Brief['heroObjects'][number];

export async function buildBrief(reading: DrawingReading, library: Library): Promise<Brief> {
  const brief = await completeJson('mid', BriefSchema, briefPrompt(reading, library));
  return resolveLibraryMatches(brief, library);
}

// The contract's palette is a fixed-length tuple; the brief's is a validated array.
export function toPalette(brief: Brief): Palette {
  return PaletteSchema.parse(brief.palette);
}

// The model sometimes names a library id that doesn't exist. Replace it with the
// entry whose tags/description best overlap the object, so every hero always
// resolves to a real model.
export function resolveLibraryMatches(brief: Brief, library: Library): Brief {
  const ids = new Set(library.map((e) => e.id));
  const heroObjects = brief.heroObjects.map((hero) =>
    ids.has(hero.libraryAssetId) ? hero : { ...hero, libraryAssetId: closestLibraryId(hero, library) },
  );
  return { ...brief, heroObjects };
}

// What the agent is told to place first: the drawing's important things, each as
// the library model it resolved to.
export function keyObjects(brief: Brief): KeyObject[] {
  return brief.heroObjects.map((hero) => ({
    assetId: hero.libraryAssetId,
    size: hero.size,
    description: hero.description,
  }));
}

function closestLibraryId(hero: HeroObject, library: Library): string {
  const words = new Set(`${hero.name} ${hero.description}`.toLowerCase().split(/\W+/));
  let best = library[0];
  let bestScore = -1;
  for (const entry of library) {
    const terms = [...entry.tags, ...entry.id.split('_'), ...entry.description.toLowerCase().split(/\W+/)];
    const score = terms.filter((t) => words.has(t)).length;
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  if (!best) throw new Error('library.json is empty — hero objects need a fallback model');
  return best.id;
}

