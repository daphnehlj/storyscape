import { registerSkybox, runSkyboxJob } from './assets/jobs.js';
import { runAgent } from './agent/loop.js';
import { loadLibrary } from './library.js';
import { buildBrief, keyObjects } from './pipeline/brief.js';
import { describeReading, readDrawing } from './pipeline/readDrawing.js';
import { checkDrawing } from './safety/checkDrawing.js';
import type { Drawing } from './uploads.js';
import { emitError, logEvent, setStage, updateScene, type World } from './world/store.js';

// Wires the pure pipeline stages together and emits the events. Every stage is
// testable on its own; this is the only place that knows the order.
export async function runWorld(world: World, drawing: Drawing): Promise<void> {
  try {
    const library = await loadLibrary();
    if (library.length === 0) {
      throw new Error('No models in web/public/assets/library/library.json — add models before building a world.');
    }

    setStage(world, 'read');
    await checkDrawing(drawing);
    const reading = await readDrawing(drawing);
    for (const line of describeReading(reading)) logEvent(world, line);

    setStage(world, 'brief');
    const brief = await buildBrief(reading, library);
    logEvent(world, `Building "${brief.title}" — ${brief.mood}.`);
    updateScene(world, (scene) => ({ ...scene, title: brief.title }));

    const objects = keyObjects(brief);
    for (const object of objects) logEvent(world, `Using "${object.assetId}" for ${object.description}.`);

    // The sky takes a while, so it runs underneath the agent.
    registerSkybox(world);
    const skybox = runSkyboxJob(world, brief);

    setStage(world, 'build');
    await runAgent({ world, brief, reading, library, keyObjects: objects });

    setStage(world, 'assets');
    await skybox;

    setStage(world, 'done');
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    emitError(world, text);
    // The last valid scene stays on screen; the world just stops growing.
    setStage(world, 'done');
  }
}
