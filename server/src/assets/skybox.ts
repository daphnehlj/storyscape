import { generateImage } from '../llm/index.js';
import { cacheEntry, saveGenerated } from './cache.js';

// B needs a 2:1 equirectangular image. The first size is the one we want; the
// fallback is the nearest supported 2:1 if the API rejects a custom size.
const SIZES = ['2048x1024', '1536x768'];

export async function generateSkybox(prompt: string): Promise<string> {
  const entry = cacheEntry(prompt, 'jpg');
  if (entry.exists) return entry.url;

  let lastError: unknown;
  for (const size of SIZES) {
    try {
      return await saveGenerated(entry, await generateImage(prompt, size));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('skybox generation failed');
}
