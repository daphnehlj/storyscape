// Calibration harness: brief → detectGaps → selectGaps for every story fixture,
// printed as a table so the scoring constants can be tuned against real stories.
//
//   npm run gaps -w server            all stories
//   npm run gaps -w server jack       one story
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { detectGaps } from '../src/clarify/gaps.js';
import { normalizeBrief } from '../src/clarify/normalizeBrief.js';
import { selectGaps } from '../src/clarify/rank.js';
import { formatGapTable } from '../src/clarify/report.js';
import { RawBriefSchema } from '../src/pipeline/briefSchema.js';

const FIXTURES = new URL('../../fixtures/', import.meta.url).pathname;

const filter = process.argv[2];
const names = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.brief.json'))
  .map((f) => f.replace('.brief.json', ''))
  .filter((n) => !filter || n.includes(filter))
  .sort();

if (names.length === 0) {
  console.error(`no brief fixtures matched ${filter ?? ''}`);
  process.exit(1);
}

for (const name of names) {
  const story = readFileSync(join(FIXTURES, 'stories', `${name}.txt`), 'utf8');
  const brief = normalizeBrief(RawBriefSchema.parse(JSON.parse(readFileSync(join(FIXTURES, `${name}.brief.json`), 'utf8'))));
  const ranked = selectGaps(detectGaps(brief), brief, story);
  const asked = ranked.filter((g) => g.selected);

  console.log(`\n═══ ${name} — ${brief.title} — ${asked.length} of ${ranked.length} gaps asked`);
  if (brief.issues.length > 0) console.log(`    repairs: ${brief.issues.join('; ')}`);
  console.log(formatGapTable(ranked));
  console.log('    questions in order:');
  for (const g of asked) console.log(`      ${g.templateId} (${g.entityName ?? 'world'})`);
}
