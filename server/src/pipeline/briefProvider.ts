import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeBrief, type Brief } from '../clarify/normalizeBrief.js';
import { RawBriefSchema } from './briefSchema.js';

// PLACEHOLDER for Stage 2. Matches an incoming story against the fixture briefs
// so the clarify loop can be run end to end before the model call exists. Swap
// the body of getBrief for the real Stage 2 call — the signature is the contract.

const FIXTURES = new URL('../../../fixtures/', import.meta.url).pathname;

function fingerprint(story: string): string {
  return story.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
}

export class NoBriefError extends Error {}

export async function getBrief(story: string): Promise<Brief> {
  const wanted = fingerprint(story);
  const names = readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.brief.json'))
    .map((f) => f.replace('.brief.json', ''));

  for (const name of names) {
    let fixtureStory: string;
    try {
      fixtureStory = readFileSync(join(FIXTURES, 'stories', `${name}.txt`), 'utf8');
    } catch {
      continue;
    }
    if (fingerprint(fixtureStory) !== wanted) continue;
    const raw = RawBriefSchema.parse(JSON.parse(readFileSync(join(FIXTURES, `${name}.brief.json`), 'utf8')));
    return normalizeBrief(raw);
  }

  throw new NoBriefError(
    `no fixture brief matches this story (Stage 2 isn't built yet). Try one of: ${names.join(', ')}`,
  );
}
