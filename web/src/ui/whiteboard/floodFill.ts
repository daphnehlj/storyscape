import type { Vec2 } from './types';

type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const channelDistance = (data: Uint8ClampedArray, i: number, c: Rgb): number =>
  Math.max(Math.abs(data[i] - c.r), Math.abs(data[i + 1] - c.g), Math.abs(data[i + 2] - c.b));

/**
 * Scanline flood fill over the committed canvas.
 *
 * Works on device pixels: `at` is board-space CSS px, `scale` is the backing
 * ratio. The board is opaque, so alpha is never part of the comparison.
 */
export function floodFill(
  ctx: CanvasRenderingContext2D,
  size: { w: number; h: number },
  scale: number,
  at: Vec2,
  hex: string,
  tolerance: number,
): void {
  const w = Math.round(size.w * scale);
  const h = Math.round(size.h * scale);
  const sx = Math.floor(at.x * scale);
  const sy = Math.floor(at.y * scale);
  if (w <= 0 || h <= 0 || sx < 0 || sy < 0 || sx >= w || sy >= h) return;

  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  const fill = parseHex(hex);
  const start = (sy * w + sx) * 4;
  const target: Rgb = { r: data[start], g: data[start + 1], b: data[start + 2] };

  // Without this the fill would keep matching pixels it just painted, forever.
  if (channelDistance(data, start, fill) <= tolerance) return;

  const matches = (x: number, y: number): boolean =>
    channelDistance(data, (y * w + x) * 4, target) <= tolerance;

  const paint = (x: number, y: number): void => {
    const i = (y * w + x) * 4;
    data[i] = fill.r;
    data[i + 1] = fill.g;
    data[i + 2] = fill.b;
    data[i + 3] = 255;
  };

  const stack: number[] = [sx, sy];
  while (stack.length > 0) {
    const y = stack.pop() as number;
    const seedX = stack.pop() as number;

    let x = seedX;
    while (x >= 0 && matches(x, y)) x -= 1;
    x += 1;

    let spanAbove = false;
    let spanBelow = false;
    while (x < w && matches(x, y)) {
      paint(x, y);

      const above = y > 0 && matches(x, y - 1);
      if (!spanAbove && above) {
        stack.push(x, y - 1);
        spanAbove = true;
      } else if (spanAbove && !above) {
        spanAbove = false;
      }

      const below = y < h - 1 && matches(x, y + 1);
      if (!spanBelow && below) {
        stack.push(x, y + 1);
        spanBelow = true;
      } else if (spanBelow && !below) {
        spanBelow = false;
      }

      x += 1;
    }
  }

  ctx.putImageData(image, 0, 0);
}
