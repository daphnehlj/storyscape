import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SceneSchema, validateSceneRefs } from '@app/shared';

// Keeps every fixture scene honest against the contract. Run: npm run validate
const root = new URL('.', import.meta.url).pathname;

function findSceneFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return findSceneFiles(path);
    return name.endsWith('.scene.json') ? [path] : [];
  });
}

let failed = 0;
for (const file of findSceneFiles(root)) {
  const parsed = SceneSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  const problems = parsed.success
    ? validateSceneRefs(parsed.data)
    : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  const name = file.slice(root.length);
  if (problems.length === 0) {
    console.log(`ok    ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}\n${problems.map((p) => `      - ${p}`).join('\n')}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
