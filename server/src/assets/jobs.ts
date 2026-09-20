import type { Brief } from '../pipeline/brief.js';
import { skyboxPrompt } from '../prompts.js';
import { logEvent, updateScene, type World } from '../world/store.js';
import { generateSkybox } from './skybox.js';

// The only generated asset. Every model in a world comes from the library.
export function registerSkybox(world: World): void {
  updateScene(world, (scene) => ({
    ...scene,
    environment: { ...scene.environment, skybox: { status: 'pending' } },
  }));
}

export async function runSkyboxJob(world: World, brief: Brief): Promise<void> {
  try {
    const url = await generateSkybox(skyboxPrompt(brief));
    setSkybox(world, 'ready', url);
    logEvent(world, 'Sky ready.');
  } catch (error) {
    setSkybox(world, 'failed');
    const message = error instanceof Error ? error.message : String(error);
    logEvent(world, `Sky generation failed (${message}); using the gradient sky.`);
  }
}

function setSkybox(world: World, status: 'ready' | 'failed', url?: string): void {
  updateScene(world, (scene) => ({
    ...scene,
    environment: { ...scene.environment, skybox: { status, ...(url && { url }) } },
  }));
}
