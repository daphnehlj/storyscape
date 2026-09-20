import { readFile } from 'node:fs/promises';
import { LibrarySchema, type Library } from '@app/shared';
import { LIBRARY_PATH } from './config.js';

// Re-read per world so models B adds show up without a server restart.
export async function loadLibrary(): Promise<Library> {
  return LibrarySchema.parse(JSON.parse(await readFile(LIBRARY_PATH, 'utf8')));
}
