import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  AnswersRequestSchema,
  CreateWorldRequestSchema,
  STORY_MAX_LENGTH,
  type AnswersResponse,
  type WorldEvent,
} from '@app/shared';
import { loadLibrary } from './assets/library.js';
import { detectGaps } from './clarify/gaps.js';
import { buildQuestions } from './clarify/questions.js';
import { toGapReports } from './clarify/report.js';
import { provenanceSummary, resolveBrief } from './clarify/resolve.js';
import { AnswerValidationError, openClarify } from './clarify/session.js';
import { getBrief } from './pipeline/briefProvider.js';
import { filterStory } from './safety/filter.js';
import {
  addSubscriber,
  createWorld,
  emit,
  getWorld,
  log,
  removeSubscriber,
  replayFor,
  setStage,
  type EventSink,
  type WorldRecord,
} from './world/store.js';

const HEARTBEAT_MS = 15_000;

// Story → brief → gaps → questions → answers → (handed to Stage 3, not built yet).
async function runPipeline(world: WorldRecord): Promise<void> {
  try {
    setStage(world, 'brief');
    world.brief = await getBrief(world.story);
    log(world, `brief: ${world.brief.title}`, { tool: 'brief' });
    for (const issue of world.brief.issues) log(world, `brief repair: ${issue}`, { tool: 'brief' });

    const gaps = detectGaps(world.brief);
    const { questions, ranked } = buildQuestions(gaps, world.brief, world.story, loadLibrary());
    world.gaps = gaps;
    world.ranked = ranked;
    world.gapReports = toGapReports(ranked);
    emit(world, { type: 'gaps', gaps: world.gapReports });
    log(world, `${ranked.length} gaps found, asking ${questions.length}`, {
      tool: 'gaps',
      rationale: ranked
        .filter((g) => g.selected)
        .map((g) => `${g.slot} ${g.score.toFixed(2)}`)
        .join(', '),
    });

    const outcome = await openClarify(world, questions);
    world.clarifyOutcome = outcome;

    world.resolved = resolveBrief({
      brief: world.brief,
      gaps,
      questions,
      answers: world.answers,
      outcome,
    });
    const counts = provenanceSummary(world.resolved);
    log(world, `resolved: ${counts.stated} stated, ${counts.asked} asked, ${counts.inferred} inferred`, {
      tool: 'resolve',
    });

    // Stage 3 picks up from here: asset jobs and the agent loop, both of which
    // take world.resolved as their input.
    setStage(world, 'build');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'pipeline failed';
    emit(world, { type: 'error', message });
  }
}

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true }));

app.post('/api/worlds', async (c) => {
  const body = CreateWorldRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'story is required' }, 400);

  const filtered = filterStory(body.data.story, STORY_MAX_LENGTH);
  if (!filtered.ok) return c.json({ error: `story rejected: ${filtered.reason}` }, 400);

  const world = createWorld(filtered.text);
  // Deliberately not awaited: the client needs the id now so it can subscribe
  // and see the questions when they arrive.
  void runPipeline(world);
  return c.json({ worldId: world.id });
});

app.post('/api/worlds/:id/answers', async (c) => {
  const world = getWorld(c.req.param('id'));
  if (!world) return c.json({ error: 'no such world' }, 404);

  const body = AnswersRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'answers must be an array' }, 400);

  // Nothing to answer, or the loop already moved on: harmless either way.
  if (!world.clarify) return c.json({ ok: true } satisfies AnswersResponse);

  try {
    const result = world.clarify.submit(body.data.answers);
    const response: AnswersResponse = { ok: true, ...(result.rejected.length > 0 && { rejected: result.rejected }) };
    return c.json(response);
  } catch (error) {
    if (error instanceof AnswerValidationError) return c.json({ error: error.message }, 400);
    throw error;
  }
});

// Lets a refreshed page restore the answers already given without replaying
// them through the event stream.
app.get('/api/worlds/:id/answers', (c) => {
  const world = getWorld(c.req.param('id'));
  if (!world) return c.json({ error: 'no such world' }, 404);
  const answers = [...world.answers.values()].map(({ questionId, optionId, text }) => ({
    questionId,
    ...(optionId !== undefined && { optionId }),
    ...(text !== undefined && { text }),
  }));
  return c.json({ answers });
});

// Debug view of the handoff object, so the resolved brief can be inspected
// before Stage 3 exists. Not part of the contract.
app.get('/api/worlds/:id/resolved', (c) => {
  if (process.env.NODE_ENV === 'production') return c.json({ error: 'not available' }, 404);
  const world = getWorld(c.req.param('id'));
  if (!world) return c.json({ error: 'no such world' }, 404);
  if (!world.resolved) return c.json({ error: 'not resolved yet', stage: world.stage }, 404);
  return c.json({ resolved: world.resolved, provenance: provenanceSummary(world.resolved), gaps: world.gapReports ?? [] });
});

app.get('/api/worlds/:id', (c) => {
  const world = getWorld(c.req.param('id'));
  if (!world) return c.json({ error: 'no such world' }, 404);
  if (!world.scene) return c.json({ error: 'no scene yet', stage: world.stage }, 404);
  return c.json(world.scene);
});

app.get('/api/worlds/:id/events', (c) => {
  const world = getWorld(c.req.param('id'));
  if (!world) return c.json({ error: 'no such world' }, 404);

  // Next's dev proxy will gzip and buffer this stream unless it's told not to
  // transform it, which silently breaks the event stream in the browser.
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('Content-Encoding', 'identity');

  return streamSSE(c, async (stream) => {
    const queue: WorldEvent[] = [];
    let wake: (() => void) | undefined;
    let open = true;
    const sink: EventSink = {
      push(event) {
        queue.push(event);
        wake?.();
      },
      close() {
        open = false;
        wake?.();
      },
    };

    stream.onAbort(() => {
      open = false;
      wake?.();
    });

    addSubscriber(world, sink);
    for (const event of replayFor(world)) sink.push(event);

    try {
      while (open) {
        while (queue.length > 0) {
          await stream.writeSSE({ data: JSON.stringify(queue.shift()) });
        }
        // Wake on the next event, or send a comment often enough that proxies
        // and the browser keep the connection open.
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, HEARTBEAT_MS).unref();
        });
        wake = undefined;
        if (open && queue.length === 0) await stream.writeSSE({ data: '', event: 'ping' });
      }
    } finally {
      removeSubscriber(world, sink);
    }
  });
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`server listening on :${port}`));

export { app };
