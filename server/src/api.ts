import { mkdirSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { DRAWING_FIELD, type WorldEvent } from '@app/shared';
import { GENERATED_DIR, UPLOADS_DIR } from './config.js';
import { runWorld } from './runWorld.js';
import { BadDrawingError, saveDrawing } from './uploads.js';
import { createWorld, getWorld, subscribe, updateScene } from './world/store.js';

// serveStatic checks its root when the route is registered, before anything has written.
mkdirSync(GENERATED_DIR, { recursive: true });
mkdirSync(UPLOADS_DIR, { recursive: true });

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true }));

// Surfaces the reason (a missing API key, most likely) instead of a bare 500.
app.onError((error, c) => {
  console.error(error);
  return c.json({ error: error.message }, 500);
});

app.post('/api/worlds', async (c) => {
  const body = await c.req.parseBody().catch(() => null);
  const file = body?.[DRAWING_FIELD];
  if (!(file instanceof File)) {
    return c.json({ error: `Send the drawing as multipart/form-data in a "${DRAWING_FIELD}" field.` }, 400);
  }

  const world = createWorld();
  try {
    const drawing = await saveDrawing(file, world.id);
    // B shows the child their own drawing beside the world it became.
    updateScene(world, (scene) => ({ ...scene, sourceImageUrl: drawing.url }));
    // Not awaited: the client follows the work on the event stream.
    void runWorld(world, drawing);
    return c.json({ worldId: world.id });
  } catch (error) {
    if (error instanceof BadDrawingError) return c.json({ error: error.message }, 400);
    throw error;
  }
});

app.get('/api/worlds/:id', (c) => {
  const world = getWorld(c.req.param('id'));
  if (!world) return c.json({ error: 'No such world.' }, 404);
  return c.json(world.scene);
});

app.get('/api/worlds/:id/events', (c) => {
  const world = getWorld(c.req.param('id'));
  if (!world) return c.json({ error: 'No such world.' }, 404);

  return streamSSE(c, async (stream) => {
    const queue: WorldEvent[] = [];
    let wake: (() => void) | undefined;
    const push = (event: WorldEvent) => {
      queue.push(event);
      wake?.();
    };

    // A reconnecting client gets the current state before anything live.
    push({ type: 'stage', stage: world.stage });
    push({ type: 'scene', scene: world.scene });
    const unsubscribe = subscribe(world, push);

    stream.onAbort(() => {
      unsubscribe();
      wake?.();
    });

    try {
      while (!stream.aborted) {
        const event = queue.shift();
        if (!event) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          wake = undefined;
          continue;
        }
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      }
    } finally {
      unsubscribe();
    }
  });
});

app.use('/generated/*', serveStatic({ root: GENERATED_DIR, rewriteRequestPath: (path) => path.replace('/generated', '') }));
app.use('/uploads/*', serveStatic({ root: UPLOADS_DIR, rewriteRequestPath: (path) => path.replace('/uploads', '') }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`server listening on :${port}`));
