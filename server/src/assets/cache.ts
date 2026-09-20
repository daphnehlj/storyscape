import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { GENERATED_DIR } from '../config.js';

// Cache by prompt hash: re-running a demo story costs nothing and takes no time.
export interface CachedFile {
  file: string;
  path: string;
  url: string;
  exists: boolean;
}

export function cacheEntry(prompt: string, extension: string): CachedFile {
  const file = `${createHash('sha256').update(prompt).digest('hex').slice(0, 16)}.${extension}`;
  const path = `${GENERATED_DIR}/${file}`;
  return { file, path, url: `/generated/${file}`, exists: existsSync(path) };
}

export async function saveGenerated(entry: CachedFile, data: Buffer): Promise<string> {
  await mkdir(GENERATED_DIR, { recursive: true });
  await writeFile(entry.path, data);
  return entry.url;
}
