import { FREE_TEXT_MAX_LENGTH, type Answer, type Question } from '@app/shared';
import { filterUserText } from '../safety/filter.js';
import { emit, log, setStage, type StoredAnswer, type WorldRecord } from '../world/store.js';

// The waiting state. The orchestrator awaits one promise; everything that could
// possibly unblock it resolves that promise exactly once, so a closed tab, a
// slow child or a skipped loop all end the same way: with whatever answers we
// have, and inference for the rest.

export type ClarifyOutcome =
  | 'complete' // every question answered
  | 'skipped' // the child asked us to get on with it
  | 'timeout-idle' // nothing for a while
  | 'timeout-hard' // total cap reached
  | 'abandoned' // nobody is listening any more
  | 'no-questions'; // nothing was worth asking

export const CLARIFY_TIMEOUTS = {
  // Generous: children think slowly, and read slowly.
  idleMs: 60_000,
  hardMs: 180_000,
  // Short: the tab is gone, and a world nobody is watching shouldn't stall.
  abandonMs: 20_000,
};

export interface SubmitResult {
  accepted: string[];
  // Questions whose free text the filter refused; they stay unanswered.
  rejected: string[];
  // 'closed' means the loop already moved on and this post changed nothing.
  status: 'open' | 'closed';
}

export class AnswerValidationError extends Error {}

export class ClarifySession {
  private settle!: (outcome: ClarifyOutcome) => void;
  private idle?: NodeJS.Timeout;
  private hard?: NodeJS.Timeout;
  private abandon?: NodeJS.Timeout;
  private closed = false;
  readonly done: Promise<ClarifyOutcome>;

  constructor(
    private readonly world: WorldRecord,
    private readonly questions: Question[],
    // Fires on every stored answer, including one that replaces an earlier
    // answer. Downstream uses it to start slow work early; this layer doesn't.
    private readonly onAnswer?: (answer: StoredAnswer, question: Question) => void,
  ) {
    this.done = new Promise((resolve) => {
      this.settle = resolve;
    });
    this.hard = setTimeout(() => this.close('timeout-hard'), CLARIFY_TIMEOUTS.hardMs).unref();
    this.resetIdle();
  }

  private resetIdle(): void {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.close('timeout-idle'), CLARIFY_TIMEOUTS.idleMs).unref();
  }

  submit(answers: Answer[]): SubmitResult {
    if (this.closed) return { accepted: [], rejected: [], status: 'closed' };

    // An empty array is the skip: "build it, I'm done choosing".
    if (answers.length === 0) {
      this.close('skipped');
      return { accepted: [], rejected: [], status: 'open' };
    }

    const accepted: string[] = [];
    const rejected: string[] = [];

    for (const answer of answers) {
      const question = this.questions.find((q) => q.id === answer.questionId);
      if (!question) throw new AnswerValidationError(`unknown question ${answer.questionId}`);

      // An option wins over text when both arrive: it's the unambiguous one.
      if (answer.optionId !== undefined) {
        if (!question.options.some((o) => o.id === answer.optionId)) {
          throw new AnswerValidationError(`option ${answer.optionId} is not on question ${question.id}`);
        }
        this.store({ questionId: question.id, optionId: answer.optionId, at: Date.now() }, question);
        accepted.push(question.id);
        continue;
      }

      const text = answer.text ?? '';
      const filtered = filterUserText(text, FREE_TEXT_MAX_LENGTH);
      if (!filtered.ok) {
        // Never scolded, never stored: the question simply stays open and the
        // gap falls through to inference if they don't try again.
        log(this.world, `free text on ${question.id} not used (${filtered.reason})`, { tool: 'clarify' });
        rejected.push(question.id);
        continue;
      }
      this.store({ questionId: question.id, text: filtered.text, at: Date.now() }, question);
      accepted.push(question.id);
    }

    this.resetIdle();
    if (this.questions.every((q) => this.world.answers.has(q.id))) this.close('complete');
    return { accepted, rejected, status: 'open' };
  }

  private store(answer: StoredAnswer, question: Question): void {
    // Keyed by question id, so re-answering just overwrites: that's what "go
    // back and change it" needs, and it makes a retried POST harmless.
    this.world.answers.set(answer.questionId, answer);
    this.onAnswer?.(answer, question);
  }

  // Nobody is watching: the tab was closed or the network dropped. Wait a beat
  // in case it's a refresh, then stop holding the world open.
  onSubscriberChange(count: number): void {
    if (this.closed) return;
    if (count > 0) {
      clearTimeout(this.abandon);
      this.abandon = undefined;
      return;
    }
    this.abandon ??= setTimeout(() => this.close('abandoned'), CLARIFY_TIMEOUTS.abandonMs).unref();
  }

  close(outcome: ClarifyOutcome): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.idle);
    clearTimeout(this.hard);
    clearTimeout(this.abandon);
    this.settle(outcome);
  }

  get isClosed(): boolean {
    return this.closed;
  }
}

// Opens the loop and hands back the promise the orchestrator waits on.
export async function openClarify(
  world: WorldRecord,
  questions: Question[],
  onAnswer?: (answer: StoredAnswer, question: Question) => void,
): Promise<ClarifyOutcome> {
  world.questions = questions;
  setStage(world, 'clarify');

  if (questions.length === 0) {
    log(world, 'nothing worth asking about, inferring everything', { tool: 'clarify' });
    return 'no-questions';
  }

  const session = new ClarifySession(world, questions, onAnswer);
  world.clarify = session;
  emit(world, { type: 'questions', questions });
  // A world created before anyone connected still shouldn't wait the full cap.
  session.onSubscriberChange(world.subscribers.size);

  const outcome = await session.done;
  log(world, `questions ${outcome} (${world.answers.size} of ${questions.length} answered)`, { tool: 'clarify' });
  return outcome;
}
