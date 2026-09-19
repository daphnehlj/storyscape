import { MAX_QUESTIONS } from '@app/shared';
import type { Brief } from './normalizeBrief.js';
import { SLOTS } from './slots.js';
import { TEMPLATES } from './templates.js';
import type { Gap, RankedGap, ScoreFactors } from './types.js';

// How much a gap is worth asking about:
//
//   score = V × P × U × D × C
//
// V  visual footprint of the slot           (slots.ts)
// P  how central the entity is to the story (computed from the story text)
// U  how much we'd be guessing              (evidence + guess confidence)
// D  how different the options look         (templates.ts)
// C  how answerable it is for a child       (templates.ts)
//
// A formula rather than a model call: it's deterministic, it calibrates in one
// table, and every score can be shown with its factors in the debug overlay.

export const TARGET_QUESTIONS = 3;
export const MIN_QUESTIONS = 2;
const ASK_THRESHOLD = 0.15; // below this, guessing is better than spending a question
const EXTRA_THRESHOLD = 0.5; // a 4th or 5th question has to earn its place
const SAME_ENTITY_PENALTY = 0.5; // two questions about one thing starts to feel like a form
const SAME_TEMPLATE_PENALTY = 0.35; // a second "what colour is…" reads as a form, whatever it scores

function uncertainty(gap: Gap): number {
  switch (gap.evidence) {
    case 'conflict':
      return 1.0; // the child's own story disagrees with itself
    case 'vague':
      return 0.7;
    case 'absent':
      // A confident guess from a strongly implied detail is nearly as good as
      // being told, and a question spent on it is a question wasted.
      return gap.reading.guessConfidence === 'high' ? 0.35 : 1.0;
    case 'explicit':
      return 0; // not a gap at all
  }
}

function countMentions(story: string, aliases: string[]): number {
  const haystack = story.toLowerCase();
  let total = 0;
  for (const alias of aliases) {
    const needle = alias.toLowerCase().trim();
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      total++;
      from = at + needle.length;
    }
  }
  return total;
}

// How central this entity is to this story. Hero objects are what the camera
// flies to; a name in the title or repeated throughout matters more than one
// mentioned once in passing.
export function prominence(
  story: string,
  title: string,
  entity: { aliases: string[]; isHero: boolean; isSkyZone: boolean },
): number {
  const mentions = countMentions(story, entity.aliases);
  const inTitle = countMentions(title, entity.aliases) > 0;
  const raw =
    0.3 +
    0.15 * Math.log2(1 + mentions) +
    (entity.isHero ? 0.3 : 0) +
    (inTitle ? 0.15 : 0) +
    (entity.isSkyZone ? 0.1 : 0);
  return Math.min(1, Math.max(0, raw));
}

function prominenceFor(gap: Gap, brief: Brief, story: string): number {
  if (gap.scope === 'world') return 1;
  const hero = brief.heroObjects.find((h) => h.id === gap.entityId);
  const zone = brief.zones.find((z) => z.id === gap.entityId);
  const entity = hero ?? zone;
  if (!entity) return 0.5; // unreachable via detectGaps; a mid value beats a crash
  return prominence(story, brief.title, {
    aliases: entity.aliases,
    isHero: hero !== undefined,
    isSkyZone: zone?.elevation === 'sky',
  });
}

export function scoreGap(gap: Gap, brief: Brief, story: string): { factors: ScoreFactors; score: number } {
  const template = TEMPLATES[gap.templateId];
  const factors: ScoreFactors = {
    V: SLOTS[gap.slot].footprint,
    P: prominenceFor(gap, brief, story),
    U: uncertainty(gap),
    D: template.D,
    C: template.C,
  };
  return { factors, score: factors.V * factors.P * factors.U * factors.D * factors.C };
}

function exclusionKey(gap: Gap): string | undefined {
  const group = SLOTS[gap.slot].exclusionGroup;
  return group && `${gap.entityId ?? 'world'}:${group}`;
}

// Greedy with diminishing returns: the best gap wins, then anything about the
// same thing or asking the same way is worth less, and a slot in the same
// exclusion group is out entirely (one appearance question per hero).
export function selectGaps(gaps: Gap[], brief: Brief, story: string): RankedGap[] {
  const ranked: RankedGap[] = gaps.map((gap) => {
    const { factors, score } = scoreGap(gap, brief, story);
    return { ...gap, factors, score, effective: score, selected: false, reason: '' };
  });

  const pool = ranked.filter((g) => {
    if (g.score >= ASK_THRESHOLD) return true;
    g.reason = `cut: score ${g.score.toFixed(2)} below ${ASK_THRESHOLD}`;
    return false;
  });

  const chosen: RankedGap[] = [];
  while (chosen.length < MAX_QUESTIONS) {
    const next = pool
      .filter((g) => !g.selected && g.effective > 0)
      .sort((a, b) => b.effective - a.effective)[0];
    if (!next) break;

    // Always ask a couple: the point of the loop is the child authoring their
    // world, so a well-specified story still gets its authorship moment.
    const beyondTarget = chosen.length >= TARGET_QUESTIONS;
    if (beyondTarget && next.effective < EXTRA_THRESHOLD) {
      next.reason = `cut: question ${chosen.length + 1} needs ${EXTRA_THRESHOLD}, had ${next.effective.toFixed(2)}`;
      next.effective = 0;
      continue;
    }

    next.selected = true;
    next.reason = `selected #${chosen.length + 1}, score ${next.score.toFixed(2)}`;
    chosen.push(next);

    for (const g of pool) {
      if (g.selected) continue;
      if (exclusionKey(g) && exclusionKey(g) === exclusionKey(next)) {
        g.effective = 0;
        g.reason = `cut: already asking about ${next.entityName ?? 'the world'} (${next.slot})`;
      } else {
        if (g.entityId !== undefined && g.entityId === next.entityId) {
          g.effective *= SAME_ENTITY_PENALTY;
          g.reason = `cut: ${next.entityName ?? 'same thing'} already asked about`;
        }
        if (g.templateId === next.templateId) {
          g.effective *= SAME_TEMPLATE_PENALTY;
          g.reason = `cut: ${next.templateId} already used`;
        }
      }
    }
  }

  // Floor: the authorship moment is the product, so if thresholds left us with
  // almost nothing, ask the best of what's left anyway — as long as there's a
  // real choice to make (U > 0) and it isn't excluded by something we did ask.
  while (chosen.length < MIN_QUESTIONS) {
    const next = ranked
      .filter((g) => !g.selected && g.factors.U > 0 && !chosen.some((c) => exclusionKey(c) && exclusionKey(c) === exclusionKey(g)))
      .sort((a, b) => b.score - a.score)[0];
    if (!next) break;
    next.selected = true;
    next.reason = `selected #${chosen.length + 1}, score ${next.score.toFixed(2)} (floor of ${MIN_QUESTIONS})`;
    chosen.push(next);
  }

  for (const g of pool) {
    if (!g.selected && !g.reason) g.reason = `cut: ranked below the ${chosen.length} asked`;
  }

  // Hero questions first: answering one lets a slow hero generation job start.
  const order = (g: RankedGap) => (TEMPLATES[g.templateId].affectsHeroPrompt ? 0 : 1);
  const selected = chosen.sort((a, b) => order(a) - order(b) || b.score - a.score);

  return [...selected, ...ranked.filter((g) => !g.selected).sort((a, b) => b.score - a.score)];
}
