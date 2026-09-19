import { readFileSync } from 'node:fs';
import { LibrarySchema, type LibraryEntry } from '@app/shared';

// The model catalogue is written by the web side and read here. It may not exist
// yet, and it grows during the build: a missing or broken library must degrade
// (questions that need thumbnails are skipped) rather than fail the run.

const REAL_PATH = new URL('../../../web/public/assets/library/library.json', import.meta.url).pathname;
// Stand-in until the real library lands, so question building can be exercised.
const SAMPLE_PATH = new URL('../../../fixtures/library.sample.json', import.meta.url).pathname;

let cached: LibraryEntry[] | undefined;

function read(path: string): LibraryEntry[] | undefined {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    console.warn(`library: ${path} is not valid JSON, ignoring`);
    return undefined;
  }
  const parsed = LibrarySchema.safeParse(json);
  if (!parsed.success) {
    console.warn(`library: ${path} does not match the contract, ignoring`);
    return undefined;
  }
  return parsed.data;
}

export function loadLibrary(): LibraryEntry[] {
  if (cached) return cached;
  // An explicit path wins outright, including when it's unreadable: that's how
  // the no-library path gets exercised.
  const override = process.env.LIBRARY_PATH;
  const library = override ? read(override) ?? [] : read(REAL_PATH) ?? read(SAMPLE_PATH) ?? [];
  if (library.length === 0) console.warn('library: no entries found, thumbnail questions will be skipped');
  cached = library;
  return library;
}

export function clearLibraryCache(): void {
  cached = undefined;
}

// Entries carrying any of these tags, in catalogue order.
export function byTags(library: LibraryEntry[], tags: string[]): LibraryEntry[] {
  return library.filter((e) => e.tags.some((t) => tags.includes(t)));
}
