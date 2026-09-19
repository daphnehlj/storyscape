import { z } from 'zod';
import { EvidenceSchema, type Evidence } from '@app/shared';
import { SLOTS, type SlotKey, type SlotValue } from './slots.js';

// What the story says about one slot. Guaranteed after normalizeReading:
//   explicit → value is set
//   conflict → at least two candidates
//   every value/candidate/guess is inside the slot's vocabulary
// `guess` is absent only for slots with no fallback, meaning "no preference".
export interface SlotReading<V> {
  evidence: Evidence;
  value?: V;
  candidates?: V[];
  // Values that would suit this thing, whatever the story says — a cat is
  // orange or black long before it's blue. Used to order the options offered.
  plausible?: V[];
  quote?: string;
  guess?: V;
  guessConfidence: 'high' | 'low';
}

export type Readings<K extends SlotKey> = { [P in K]?: SlotReading<SlotValue<P>> };

const MAX_CANDIDATES = 3;
const MAX_PLAUSIBLE = 6;
const MAX_QUOTE_LENGTH = 200;

const RawReadingSchema = z
  .object({
    evidence: z.unknown(),
    value: z.unknown(),
    candidates: z.unknown(),
    plausible: z.unknown(),
    quote: z.unknown(),
    guess: z.unknown(),
    guessConfidence: z.unknown(),
  })
  .partial();

function parseIn<V>(vocab: z.ZodType<V>, raw: unknown): V | undefined {
  const r = vocab.safeParse(raw);
  return r.success ? r.data : undefined;
}

// Never throws. Anything unusable degrades toward "absent, low confidence",
// which is the most honest thing to say about a reading we couldn't read.
export function normalizeReading<K extends SlotKey>(
  key: K,
  raw: unknown,
  issues: string[],
  where: string,
): SlotReading<SlotValue<K>> {
  type V = SlotValue<K>;
  // The catalogue's per-key schema is exactly the one SlotValue<K> is inferred
  // from; TS can't correlate the indexed access with K.
  const vocab = SLOTS[key].vocab as unknown as z.ZodType<V>;
  const fallback = SLOTS[key].fallback as V | undefined;
  const note = (msg: string) => issues.push(`${where} ${key}: ${msg}`);

  const shape = RawReadingSchema.safeParse(raw);
  if (raw === undefined || !shape.success) {
    if (raw !== undefined) note('reading is not an object, treated as absent');
    return { evidence: 'absent', guess: fallback, guessConfidence: 'low' };
  }
  const r = shape.data;

  let evidence: Evidence = parseIn(EvidenceSchema, r.evidence) ?? 'absent';
  if (r.evidence !== undefined && evidence !== r.evidence) note(`unknown evidence ${JSON.stringify(r.evidence)}`);

  const value = parseIn(vocab, r.value);
  if (r.value !== undefined && value === undefined) note(`value ${JSON.stringify(r.value)} outside vocabulary`);

  const rawCandidates = Array.isArray(r.candidates) ? r.candidates : [];
  const candidates: V[] = [];
  for (const c of rawCandidates) {
    const v = parseIn(vocab, c);
    if (v === undefined) note(`candidate ${JSON.stringify(c)} outside vocabulary`);
    else if (!candidates.includes(v)) candidates.push(v);
  }
  candidates.splice(MAX_CANDIDATES);

  if (evidence === 'explicit' && value === undefined) {
    note('explicit without a valid value, downgraded');
    evidence = candidates.length >= 2 ? 'vague' : 'absent';
  }
  if (evidence === 'conflict' && candidates.length < 2) {
    note('conflict needs two candidates, downgraded to vague');
    evidence = 'vague';
  }

  let guess = parseIn(vocab, r.guess);
  let guessConfidence = parseIn(z.enum(['high', 'low']), r.guessConfidence) ?? 'low';
  if (guess === undefined) {
    if (r.guess !== undefined) note(`guess ${JSON.stringify(r.guess)} outside vocabulary`);
    guess = value ?? candidates[0] ?? fallback;
    // A guess we had to invent ourselves is never high confidence.
    if (value === undefined) guessConfidence = 'low';
  }

  const plausible: V[] = [];
  for (const p of Array.isArray(r.plausible) ? r.plausible : []) {
    const v = parseIn(vocab, p);
    if (v !== undefined && !plausible.includes(v)) plausible.push(v);
  }
  plausible.splice(MAX_PLAUSIBLE);

  const quote = typeof r.quote === 'string' && r.quote.trim() ? r.quote.trim().slice(0, MAX_QUOTE_LENGTH) : undefined;

  return {
    evidence,
    ...(evidence === 'explicit' && { value }),
    ...(candidates.length > 0 && evidence !== 'explicit' && { candidates }),
    ...(plausible.length > 0 && { plausible }),
    ...(quote !== undefined && { quote }),
    guess,
    guessConfidence,
  };
}

// Fills every applicable slot with a normalized reading and drops readings for
// slots that don't apply. Missing readings become "absent", which is exactly
// what a missing reading means.
export function normalizeReadings<K extends SlotKey>(
  applicable: readonly K[],
  raw: Record<string, unknown>,
  issues: string[],
  where: string,
): Readings<K> {
  const out: Readings<K> = {};
  for (const key of applicable) out[key] = normalizeReading(key, raw[key], issues, where);
  for (const key of Object.keys(raw)) {
    if (!(applicable as readonly string[]).includes(key)) issues.push(`${where} ${key}: not applicable here, dropped`);
  }
  return out;
}
