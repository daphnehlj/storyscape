import type { Question, Source } from '@app/shared';
import type { StoredAnswer } from '../world/store.js';
import { interpretFreeText } from './interpret.js';
import type { Brief, BriefHero, BriefZone } from './normalizeBrief.js';
import type { Readings } from './readings.js';
import type { SlotKey } from './slots.js';
import { toDecision } from './templates.js';
import type { ClarifyOutcome } from './session.js';
import type { Decision, Gap } from './types.js';

// The handoff. Every slot the brief found applicable comes out with a decision
// and where it came from: the story said it, the child chose it, or we inferred
// it. Zero answers still produces a complete object — that's what makes the
// question loop skippable.
//
// Decisions carry enums, library ids and colour tokens only. No hex, no meters:
// the preset table owns colour and the size ladder owns numbers.

export interface ResolvedSlot {
  slot: SlotKey;
  source: Source;
  // Absent when we had no usable value at all — downstream is free to choose.
  decision?: Decision;
  gapId?: string;
  // Free text we couldn't map to a value but that can still colour a hero's
  // generation prompt, e.g. "sparkly rainbow".
  flavor?: string;
  // How the story left this slot, for the debug overlay.
  evidence: string;
  note?: string;
}

export interface ResolvedEntity {
  id: string;
  name: string;
  description: string;
  slots: ResolvedSlot[];
}

export interface ResolvedBrief {
  title: string;
  mood: string;
  world: ResolvedSlot[];
  zones: (ResolvedEntity & { elevation: 'ground' | 'sky'; owner?: string })[];
  heroes: (ResolvedEntity & { kind: BriefHero['kind']; zone?: string })[];
  ambientObjects: string[];
  clarify: {
    outcome: ClarifyOutcome;
    asked: number;
    answered: number;
  };
}

export interface ResolveInput {
  brief: Brief;
  gaps: Gap[];
  questions: Question[];
  answers: Map<string, StoredAnswer>;
  outcome: ClarifyOutcome;
}

function resolveSlot(
  slot: SlotKey,
  entityId: string | undefined,
  readings: Readings<SlotKey>,
  input: ResolveInput,
): ResolvedSlot {
  const reading = readings[slot];
  const base = { slot, evidence: reading?.evidence ?? 'absent' };

  // The story settled it.
  if (reading?.evidence === 'explicit' && reading.value !== undefined) {
    const decision = toDecision(slot, entityId, String(reading.value));
    return { ...base, source: 'stated', ...(decision && { decision }) };
  }

  const gap = input.gaps.find((g) => g.slot === slot && g.entityId === entityId);
  const question = gap && input.questions.find((q) => q.gapId === gap.id);
  const answer = question && input.answers.get(question.id);

  if (gap && question && answer) {
    const chosen = answer.optionId ?? undefined;
    if (chosen) {
      const decision = toDecision(gap.slot, entityId, chosen);
      return { ...base, source: 'asked', gapId: gap.id, ...(decision && { decision }) };
    }
    if (answer.text) {
      const read = interpretFreeText(answer.text, question, gap);
      if (read.kind === 'option' || read.kind === 'value') {
        const value = read.kind === 'option' ? read.optionId : read.value;
        const decision = toDecision(gap.slot, entityId, value);
        return {
          ...base,
          source: 'asked',
          gapId: gap.id,
          ...(decision && { decision }),
          note: `from "${answer.text}"`,
        };
      }
      if (read.kind === 'flavor') {
        // Their words are kept even though no value came out of them, and the
        // slot itself still falls back to the guess below.
        const guess = reading?.guess === undefined ? undefined : toDecision(slot, entityId, String(reading.guess));
        return {
          ...base,
          source: 'asked',
          gapId: gap.id,
          ...(guess && { decision: guess }),
          flavor: read.flavor,
          note: `"${answer.text}" kept as flavour`,
        };
      }
      return {
        ...base,
        source: 'inferred',
        gapId: gap.id,
        ...(reading?.guess !== undefined && { decision: toDecision(slot, entityId, String(reading.guess)) ?? undefined }),
        note: `"${answer.text}" could not be used`,
      };
    }
  }

  // Nobody answered: our own best guess, marked as ours.
  const guess = reading?.guess;
  const decision = guess === undefined ? null : toDecision(slot, entityId, String(guess));
  return {
    ...base,
    source: 'inferred',
    ...(gap && { gapId: gap.id }),
    ...(decision && { decision }),
    ...(guess === undefined && { note: 'no preference — downstream chooses' }),
  };
}

function resolveEntity(entity: BriefZone | BriefHero, input: ResolveInput): ResolvedSlot[] {
  return (Object.keys(entity.readings) as SlotKey[]).map((slot) =>
    resolveSlot(slot, entity.id, entity.readings as Readings<SlotKey>, input),
  );
}

export function resolveBrief(input: ResolveInput): ResolvedBrief {
  const { brief } = input;
  return {
    title: brief.title,
    mood: brief.mood,
    world: (Object.keys(brief.world) as SlotKey[]).map((slot) =>
      resolveSlot(slot, undefined, brief.world as Readings<SlotKey>, input),
    ),
    zones: brief.zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      description: zone.description,
      elevation: zone.elevation,
      ...(zone.owner !== undefined && { owner: zone.owner }),
      slots: resolveEntity(zone, input),
    })),
    heroes: brief.heroObjects.map((hero) => ({
      id: hero.id,
      name: hero.name,
      description: hero.description,
      kind: hero.kind,
      ...(hero.zone !== undefined && { zone: hero.zone }),
      slots: resolveEntity(hero, input),
    })),
    ambientObjects: brief.ambientObjects,
    clarify: {
      outcome: input.outcome,
      asked: input.questions.length,
      answered: input.answers.size,
    },
  };
}

// Handy for logs and the overlay: "3 stated, 2 asked, 9 inferred".
export function provenanceSummary(resolved: ResolvedBrief): Record<Source, number> {
  const counts: Record<Source, number> = { stated: 0, asked: 0, inferred: 0 };
  const all = [resolved.world, ...resolved.zones.map((z) => z.slots), ...resolved.heroes.map((h) => h.slots)].flat();
  for (const slot of all) counts[slot.source]++;
  return counts;
}
