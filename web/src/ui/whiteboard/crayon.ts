import { CRAYON } from './presets';

/**
 * Wax grain, generated once per board.
 *
 * The tile is alpha-only and gets used as a `destination-out` fill on an
 * offscreen layer holding a single mark: wherever the tile is opaque, the
 * stroke is eaten away. Two octaves, because pure per-pixel noise reads as TV
 * static — the coarse octave gives the blotches, the fine one the paper tooth.
 */

/** mulberry32 — small, fast, and deterministic, which is the whole point. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Bilinear value noise that wraps at the tile edges, so the pattern can repeat
 * without a visible seam.
 */
function valueNoise(size: number, cell: number, rng: () => number): Float32Array {
  const g = Math.max(1, Math.round(size / cell));
  const grid = new Float32Array(g * g);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rng();

  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const fy = (y / size) * g;
    const y0 = Math.floor(fy) % g;
    const y1 = (y0 + 1) % g;
    const ty = smoothstep(fy - Math.floor(fy));
    for (let x = 0; x < size; x += 1) {
      const fx = (x / size) * g;
      const x0 = Math.floor(fx) % g;
      const x1 = (x0 + 1) % g;
      const tx = smoothstep(fx - Math.floor(fx));
      const top = lerp(grid[y0 * g + x0], grid[y0 * g + x1], tx);
      const bottom = lerp(grid[y1 * g + x0], grid[y1 * g + x1], tx);
      out[y * size + x] = lerp(top, bottom, ty);
    }
  }
  return out;
}

export function createGrainTile(): HTMLCanvasElement {
  const size = CRAYON.tileSize;
  const rng = createRng(CRAYON.seed);
  const blotch = valueNoise(size, CRAYON.blotchCell, rng);

  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext('2d');
  if (!ctx) return tile;

  const image = ctx.createImageData(size, size);
  const span = CRAYON.maxErase - CRAYON.minErase;
  for (let i = 0; i < blotch.length; i += 1) {
    const mixed = blotch[i] * CRAYON.blotchWeight + rng() * CRAYON.speckleWeight;
    // contrast > 1 biases towards "mostly solid wax with the odd bare patch"
    const erase = CRAYON.minErase + span * Math.pow(mixed, CRAYON.contrast);
    image.data[i * 4 + 3] = Math.round(erase * 255);
  }
  ctx.putImageData(image, 0, 0);
  return tile;
}

/**
 * A repeating grain pattern offset by the mark's seed, so two strokes never
 * share grain alignment. The offset comes from the stored seed rather than
 * Math.random so replaying the board reproduces it exactly.
 */
export function createGrainPattern(
  ctx: CanvasRenderingContext2D,
  tile: HTMLCanvasElement,
  seed: number,
): CanvasPattern | null {
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return null;
  const rng = createRng(seed);
  const size = CRAYON.tileSize;
  pattern.setTransform(new DOMMatrix().translate(rng() * size, rng() * size));
  return pattern;
}
