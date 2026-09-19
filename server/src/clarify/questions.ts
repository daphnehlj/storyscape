import { QuestionSchema, type LibraryEntry, type Question } from '@app/shared';
import type { Brief } from './normalizeBrief.js';
import { selectGaps } from './rank.js';
import { displayName, fillPrompt } from './slotFill.js';
import { TEMPLATES } from './templates.js';
import type { Gap, RankedGap } from './types.js';

// Ranked gaps → the questions a child actually sees. Anything that can't be
// turned into a well-formed question is dropped here, before selection, so a
// missing thumbnail costs us a better question rather than a blank card.

export interface BuiltQuestions {
  questions: Question[];
  // Every gap with its score and fate, for the `gaps` event and the overlay.
  ranked: RankedGap[];
}

// Free text is offered where the vocabulary genuinely can't cover a child's
// idea — a sparkly rainbow dragon. It isn't offered where the options are
// exhaustive (times of day) or where they're the child's own words already.
function allowsFreeText(templateId: string): boolean {
  return templateId === 'hero_color' || templateId === 'hero_material' || templateId === 'hero_feel';
}

function buildQuestion(gap: Gap, brief: Brief, story: string, library: LibraryEntry[], index: number): Question | null {
  const template = TEMPLATES[gap.templateId];
  const hero = brief.heroObjects.find((h) => h.id === gap.entityId);
  const options = template.buildOptions({ gap, library });
  if (!options || options.length < 2) return null;

  const name = displayName(gap.entityName, story, {
    scope: gap.scope === 'hero' ? 'hero' : 'zone',
    ...(hero && { kind: hero.kind }),
  });
  const prompt = fillPrompt(template.prompt, {
    thing: name,
    place: name,
    character: name,
    a: options[0]!.label.toLowerCase(),
    b: options[1]!.label.toLowerCase(),
  });
  if (!prompt) return null;

  const question: Question = {
    id: `q${index + 1}`,
    gapId: gap.id,
    templateId: gap.templateId,
    prompt,
    kind: template.kind,
    options,
    allowFreeText: allowsFreeText(gap.templateId),
  };
  // Validate before the wire: a malformed question is a dropped gap, not a
  // broken card in front of a child.
  const parsed = QuestionSchema.safeParse(question);
  if (!parsed.success) {
    console.warn(`questions: ${gap.id} failed validation, dropped`, parsed.error.issues[0]?.message);
    return null;
  }
  return parsed.data;
}

export function buildQuestions(gaps: Gap[], brief: Brief, story: string, library: LibraryEntry[]): BuiltQuestions {
  // Built once per gap: selection asks whether a gap is askable, then the
  // chosen ones are read back out in order.
  const attempts = new Map<string, Question | null>();
  const attempt = (gap: Gap): Question | null => {
    if (!attempts.has(gap.id)) attempts.set(gap.id, buildQuestion(gap, brief, story, library, 0));
    return attempts.get(gap.id) ?? null;
  };

  const ranked = selectGaps(gaps, brief, story, (gap) => attempt(gap) !== null);

  const questions = ranked
    .filter((g) => g.selected)
    .map((g, i) => {
      const built = attempt(g);
      // Non-null by construction: selection only picks gaps attempt() accepted.
      return { ...built!, id: `q${i + 1}` };
    });

  return { questions, ranked };
}
