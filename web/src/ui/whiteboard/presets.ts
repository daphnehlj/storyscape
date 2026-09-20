/**
 * Every tunable value in the whiteboard lives here (CLAUDE.md non-negotiable #2).
 * A numeric literal inside render.ts / crayon.ts / Whiteboard.tsx is a bug even
 * when it looks right — it makes the tuning pass impossible.
 */

export const BOARD = {
  /** Opaque so flood fill has real pixels to test and the eraser can paint over. */
  background: '#ffffff',
  jsonVersion: 1,
  /** Cap on backing-store scale; retina is 2, but a 3x phone triples fill cost. */
  maxPixelRatio: 2,
} as const;

export type Crayon = { id: string; name: string; hex: string };

/** Crayon colours, not screen primaries — pure #f00 reads as "computer", not "crayon". */
export const PALETTE: readonly Crayon[] = [
  { id: 'black', name: 'Black', hex: '#2f2b2b' },
  { id: 'red', name: 'Red', hex: '#e2403a' },
  { id: 'orange', name: 'Orange', hex: '#f2872f' },
  { id: 'yellow', name: 'Yellow', hex: '#f4c92e' },
  { id: 'green', name: 'Green', hex: '#43a648' },
  { id: 'teal', name: 'Teal', hex: '#2eb0a8' },
  { id: 'blue', name: 'Blue', hex: '#2f6dd0' },
  { id: 'purple', name: 'Purple', hex: '#8d4cc0' },
  { id: 'pink', name: 'Pink', hex: '#ef73ab' },
  { id: 'brown', name: 'Brown', hex: '#8b5a35' },
];

export type BrushSize = { id: string; name: string; size: number };

export const BRUSH_SIZES: readonly BrushSize[] = [
  { id: 'thin', name: 'Thin', size: 8 },
  { id: 'medium', name: 'Medium', size: 18 },
  { id: 'thick', name: 'Thick', size: 34 },
  { id: 'chunky', name: 'Chunky', size: 56 },
];

export const DEFAULTS = {
  colorId: 'black',
  sizeId: 'medium',
  toolId: 'pen',
} as const;

/**
 * perfect-freehand geometry. Crayons are blunt, so: no taper, round caps, and
 * only moderate thinning — a wax stick barely changes width with pressure.
 */
export const FREEHAND = {
  thinning: 0.38,
  smoothing: 0.46,
  streamline: 0.4,
  cap: true,
  taper: 0,
  /** Mice report a flat 0.5 pressure; let the library infer from velocity instead. */
  simulatePressureForMouse: true,
} as const;

/** The eraser is a wider stick than the pen at the same setting — kids expect that. */
export const ERASER = {
  sizeScale: 1.8,
  thinning: 0,
  streamline: 0.3,
} as const;

/**
 * Wax grain. The tile is alpha-only and used with `destination-out`, so these are
 * "how much of the stroke gets eaten", not colours.
 */
export const CRAYON = {
  baseAlpha: 0.93,
  tileSize: 192,
  /** Coarse cell size for the low-frequency octave — the waxy blotches. */
  blotchCell: 12,
  blotchWeight: 0.62,
  /** Fine per-pixel octave — the paper-tooth speckle. */
  speckleWeight: 0.38,
  /** Grain is remapped into this band; 0 keeps every pixel, 1 erases it. */
  minErase: 0.04,
  maxErase: 0.72,
  /** Pushes the grain distribution towards "mostly solid with bare patches". */
  contrast: 1.7,
  seed: 20260919,
} as const;

export const SHAPE = {
  /** Points sampled along each straight edge before the crayon outline is built. */
  samplesPerEdge: 24,
  ellipseSamples: 96,
  /**
   * Closed shapes are drawn as one open stroke, so the start and end caps meet
   * and leave a notch. Carry the path this far past the start to hide the join.
   */
  closeOverlap: 0.3,
  /** Shapes have no pressure data; feed the stroke builder a steady hand. */
  pressure: 0.62,
} as const;

export const FILL = {
  /** Generous, because crayon grain means no filled region is one flat colour. */
  tolerance: 42,
} as const;

/** Padding added around a mark's bounds before clearing / grain-filling the layer. */
export const RENDER = {
  boundsPadding: 4,
} as const;

export const INPUT = {
  /** Mice and some touchscreens report no useful pressure; assume a steady hand. */
  defaultPressure: 0.5,
  /** A shape drag shorter than this was a tap, not a shape - discard it. */
  shapeMinDragPx: 5,
} as const;

export const UI = {
  /**
   * Brush-preview dot diameters. Button and swatch sizing lives in the
   * stylesheet instead, so it can respond to viewport width without the two
   * definitions drifting apart.
   */
  sizeDotMinPx: 7,
  sizeDotMaxPx: 26,
  minBoardPx: 120,
} as const;
