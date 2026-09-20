import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { FIXTURES_DIR } from '../config.js';
import { runWorld } from '../runWorld.js';
import { saveDrawingBytes } from '../uploads.js';
import { createWorld, subscribe, updateScene } from '../world/store.js';

// Runs the whole pipeline on a drawing with no HTTP, and saves the scene so B can
// load it in the renderer. Usage: npm run build-drawing -- fixtures/drawings/house.png
const input = process.argv[2];
if (!input) {
  console.error('usage: npm run build-drawing -- <path to a drawing image>');
  process.exit(1);
}

const path = resolve(input);
const name = basename(path, extname(path));
const world = createWorld();
subscribe(world, (event) => {
  if (event.type === 'log') console.log(`  ${event.text}`);
  if (event.type === 'stage') console.log(`[${event.stage}]`);
  if (event.type === 'error') console.error(`ERROR: ${event.message}`);
});

const startedAt = Date.now();
const drawing = await saveDrawingBytes(await readFile(path), world.id);
updateScene(world, (scene) => ({ ...scene, sourceImageUrl: drawing.url }));
await runWorld(world, drawing);

const outPath = `${FIXTURES_DIR}/generated/${name}.scene.json`;
await mkdir(`${FIXTURES_DIR}/generated`, { recursive: true });
await writeFile(outPath, `${JSON.stringify(world.scene, null, 2)}\n`);
console.log(
  `\nWrote ${outPath} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — ` +
    `${world.scene.zones.length} zones, ${world.scene.objects.length} objects, ${world.scene.scatters.length} scatters.`,
);
process.exit(0);
