import { isFlaggedImage } from '../llm/index.js';
import type { Drawing } from '../uploads.js';

export class UnsafeInputError extends Error {}

// Nothing from a user reaches a prompt unfiltered — the upload is an open input
// on a children's product, so it is moderated before any model sees it.
export async function checkDrawing(drawing: Drawing): Promise<void> {
  if (await isFlaggedImage(drawing.dataUrl)) {
    throw new UnsafeInputError("We can't build a world from that picture. Try another drawing!");
  }
}
