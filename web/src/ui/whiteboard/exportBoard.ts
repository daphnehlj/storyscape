import { BOARD } from './presets';
import type { BoardJson, Mark } from './types';

export function toBoardJson(marks: readonly Mark[], width: number, height: number): BoardJson {
  return {
    version: BOARD.jsonVersion,
    width,
    height,
    background: BOARD.background,
    marks: [...marks],
  };
}

/**
 * The committed canvas is already opaque and holds the background, so it is the
 * export — no compositing pass needed.
 */
export function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Board could not be encoded as PNG'));
    }, 'image/png');
  });
}
