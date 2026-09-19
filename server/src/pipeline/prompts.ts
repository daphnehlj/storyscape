import { z } from 'zod';
import { SLOTS, SLOT_KEYS, type SlotKey } from '../clarify/slots.js';

// Every prompt the pipeline sends lives here, as a template literal with named
// slots, so prompts can be iterated on without hunting through stage code.

// Allowed values for a slot, read straight off its zod vocabulary so the prompt
// can never offer a value the validator would reject. null = library id.
function vocabValues(key: SlotKey): string[] | null {
  const js = z.toJSONSchema(SLOTS[key].vocab) as { enum?: string[]; const?: string; anyOf?: { enum?: string[]; const?: string }[] }; // toJSONSchema returns a loose JSON object
  const parts = js.anyOf ?? [js];
  const values = parts.flatMap((p) => p.enum ?? (p.const !== undefined ? [p.const] : []));
  return values.length > 0 ? values : null;
}

const SLOT_HINTS: Record<SlotKey, string> = {
  'world.setting': 'the overall look of the world',
  'world.timeOfDay': 'when the story happens',
  'world.weather': 'the weather',
  'world.flowers': 'colour of wild flowers on the ground, or none',
  'world.critters': 'small ambient creatures, or none',
  'zone.platform': 'SKY zones only: what the floating land is made of',
  'zone.trees': 'GROUND zones only: the main kind of tree, as a library id from TREES',
  'zone.home': "zones with an owner only: the owner's home, as a library id from HOMES",
  'hero.color': 'main colour of the hero object',
  'hero.material': 'BUILDING heroes only: what it is built from',
  'hero.size': 'how big it is, compared to familiar things',
  'hero.feel': 'how it comes across to a child',
};

function renderSlotList(): string {
  return SLOT_KEYS.map((key) => {
    const values = vocabValues(key);
    const allowed = values ? values.join(' | ') : 'library id';
    return `- "${key}" — ${SLOT_HINTS[key]}. Allowed: ${allowed}`;
  }).join('\n');
}

export interface BriefReadingsPromptSlots {
  treeIds: string[];
  homeIds: string[];
}

// Appended to the Stage 2 brief prompt. It asks the model to extract and
// classify only — never to rank gaps or write questions; code does both.
export function briefReadingsPrompt({ treeIds, homeIds }: BriefReadingsPromptSlots): string {
  return `For every zone, hero object and the world as a whole, add a "readings" object
describing what the story says about each attribute below. Use the world-level
attributes under "world", zone attributes under each zone's "readings", and hero
attributes under each hero's "readings".

ATTRIBUTES
${renderSlotList()}

TREES: ${treeIds.join(', ') || '(none)'}
HOMES: ${homeIds.join(', ') || '(none)'}

Each reading is:
{
  "evidence": "explicit" | "vague" | "absent" | "conflict",
  "value": <allowed value>,          // only when explicit
  "candidates": [<allowed value>, …], // vague: 2–3 plausible readings; conflict: the values the story contradicts itself between
  "quote": "<the exact words from the story that justify this>",
  "guess": <allowed value>,          // always: your best choice if nobody tells us
  "guessConfidence": "high" | "low"
}

EVIDENCE
- explicit: the story settles it ("a red dragon" → hero.color explicit red).
- vague: the story hints but doesn't settle it ("a dark forest" could be night, or just dense trees).
- absent: the story never mentions it. Set guessConfidence "high" only when the story still strongly implies it (a kingdom in the clouds implies cloud_kingdom).
- conflict: the story says two incompatible things ("in the middle of the night the sun was shining"). Children's stories do this often; report it, don't smooth it over.

GUESSES
- Guess what would look best in this story's world, not just what is most literal.
- When the story allows it, prefer dawn or dusk; they are the most beautiful times.
- Only use allowed values, spelled exactly as listed. Never invent a colour, material or id.`;
}
