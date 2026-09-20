import { getStroke } from 'perfect-freehand';
import { createGrainPattern, createGrainTile } from './crayon';
import { floodFill } from './floodFill';
import { BOARD, CRAYON, ERASER, FREEHAND, RENDER, SHAPE } from './presets';
import type { Bounds, Mark, ShapeMark, StrokePoint, Vec2 } from './types';

/**
 * Three canvases:
 *  - `committed` holds every finished mark and is opaque (so fill has pixels to
 *    test and the eraser can simply paint the background colour over things).
 *  - `live` is a transparent overlay holding only the in-progress mark.
 *  - `layer` is one reusable offscreen scratch canvas where a single mark is
 *    composited with its grain before being stamped down. It has to be a
 *    separate surface: `destination-out` applied to the board itself would eat
 *    the artwork underneath instead of just this stroke.
 */
export type Renderer = {
  committed: CanvasRenderingContext2D;
  live: CanvasRenderingContext2D;
  layer: CanvasRenderingContext2D;
  layerCanvas: HTMLCanvasElement;
  grain: HTMLCanvasElement;
  width: number;
  height: number;
  scale: number;
};

export type Target = 'committed' | 'live';

function sizeCanvas(canvas: HTMLCanvasElement, width: number, height: number, scale: number): void {
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  // Draw in CSS pixels; the backing store carries the device ratio.
  ctx?.setTransform(scale, 0, 0, scale, 0, 0);
}

export function createRenderer(
  committedCanvas: HTMLCanvasElement,
  liveCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  scale: number,
): Renderer | null {
  const layerCanvas = document.createElement('canvas');
  for (const canvas of [committedCanvas, liveCanvas, layerCanvas]) {
    sizeCanvas(canvas, width, height, scale);
  }
  const committed = committedCanvas.getContext('2d');
  const live = liveCanvas.getContext('2d');
  const layer = layerCanvas.getContext('2d');
  if (!committed || !live || !layer) return null;

  const renderer: Renderer = {
    committed,
    live,
    layer,
    layerCanvas,
    grain: createGrainTile(),
    width,
    height,
    scale,
  };
  resetBoard(renderer);
  return renderer;
}

export function resizeRenderer(
  renderer: Renderer,
  committedCanvas: HTMLCanvasElement,
  liveCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  scale: number,
): void {
  for (const canvas of [committedCanvas, liveCanvas, renderer.layerCanvas]) {
    sizeCanvas(canvas, width, height, scale);
  }
  renderer.width = width;
  renderer.height = height;
  renderer.scale = scale;
}

export function disposeRenderer(renderer: Renderer): void {
  renderer.layerCanvas.width = 0;
  renderer.layerCanvas.height = 0;
  renderer.grain.width = 0;
  renderer.grain.height = 0;
}

export function resetBoard(renderer: Renderer): void {
  const { committed, width, height } = renderer;
  committed.save();
  committed.globalCompositeOperation = 'source-over';
  committed.fillStyle = BOARD.background;
  committed.fillRect(0, 0, width, height);
  committed.restore();
}

export function clearLive(renderer: Renderer): void {
  renderer.live.clearRect(0, 0, renderer.width, renderer.height);
}

// --- paths ------------------------------------------------------------------

/** perfect-freehand hands back an outline polygon; round its corners into a path. */
function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D();
  if (outline.length === 0) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  path.closePath();
  return path;
}

export function strokePath(
  points: readonly StrokePoint[],
  size: number,
  simulatePressure: boolean,
  thinning: number,
  streamline: number,
): Path2D {
  const outline = getStroke(
    points.map((p) => [p.x, p.y, p.p]),
    {
      size,
      thinning,
      streamline,
      smoothing: FREEHAND.smoothing,
      simulatePressure,
      start: { cap: FREEHAND.cap, taper: FREEHAND.taper },
      end: { cap: FREEHAND.cap, taper: FREEHAND.taper },
      last: true,
    },
  );
  return outlineToPath(outline);
}

const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

const sampleLine = (a: Vec2, b: Vec2, steps: number, out: StrokePoint[]): void => {
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: SHAPE.pressure });
  }
};

/**
 * Shapes are sampled into a point path and then run through the same stroke
 * builder as the pen, so they pick up the identical crayon outline and grain.
 */
function shapePoints(mark: ShapeMark): StrokePoint[] {
  const { from, to, shape } = mark;
  const points: StrokePoint[] = [];

  if (shape === 'line') {
    sampleLine(from, to, SHAPE.samplesPerEdge, points);
    return points;
  }

  if (shape === 'rect') {
    const corners: Vec2[] = [
      { x: from.x, y: from.y },
      { x: to.x, y: from.y },
      { x: to.x, y: to.y },
      { x: from.x, y: to.y },
    ];
    for (let i = 0; i < corners.length; i += 1) {
      sampleLine(corners[i], corners[(i + 1) % corners.length], SHAPE.samplesPerEdge, points);
    }
    sampleLine(
      corners[0],
      lerpVec(corners[0], corners[1], SHAPE.closeOverlap),
      Math.ceil(SHAPE.samplesPerEdge * SHAPE.closeOverlap),
      points,
    );
    return points;
  }

  const cx = (from.x + to.x) / 2;
  const cy = (from.y + to.y) / 2;
  const rx = Math.abs(to.x - from.x) / 2;
  const ry = Math.abs(to.y - from.y) / 2;
  const turns = Math.ceil(SHAPE.ellipseSamples * (1 + SHAPE.closeOverlap));
  for (let i = 0; i <= turns; i += 1) {
    const angle = (i / SHAPE.ellipseSamples) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
      p: SHAPE.pressure,
    });
  }
  return points;
}

// --- bounds -----------------------------------------------------------------

export function markBounds(mark: Mark, width: number, height: number): Bounds {
  if (mark.kind === 'fill') return { x: 0, y: 0, w: width, h: height };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  if (mark.kind === 'shape') {
    include(mark.from.x, mark.from.y);
    include(mark.to.x, mark.to.y);
  } else {
    for (const p of mark.points) include(p.x, p.y);
  }

  const pad = mark.size / 2 + RENDER.boundsPadding;
  const x = Math.max(0, Math.floor(minX - pad));
  const y = Math.max(0, Math.floor(minY - pad));
  return {
    x,
    y,
    w: Math.min(width, Math.ceil(maxX + pad)) - x,
    h: Math.min(height, Math.ceil(maxY + pad)) - y,
  };
}

// --- drawing ----------------------------------------------------------------

/** Colour the path on the scratch layer, eat grain out of it, stamp it down. */
function drawTextured(
  renderer: Renderer,
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  color: string,
  seed: number,
  bounds: Bounds,
): void {
  if (bounds.w <= 0 || bounds.h <= 0) return;
  const { layer, layerCanvas, scale } = renderer;

  layer.save();
  layer.clearRect(bounds.x, bounds.y, bounds.w, bounds.h);
  layer.globalAlpha = CRAYON.baseAlpha;
  layer.fillStyle = color;
  layer.fill(path);

  const pattern = createGrainPattern(layer, renderer.grain, seed);
  if (pattern) {
    layer.globalAlpha = 1;
    layer.globalCompositeOperation = 'destination-out';
    layer.fillStyle = pattern;
    layer.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  }
  layer.restore();

  ctx.drawImage(
    layerCanvas,
    bounds.x * scale,
    bounds.y * scale,
    bounds.w * scale,
    bounds.h * scale,
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h,
  );
}

export function drawMark(renderer: Renderer, mark: Mark, target: Target): void {
  const ctx = target === 'live' ? renderer.live : renderer.committed;
  const bounds = markBounds(mark, renderer.width, renderer.height);

  switch (mark.kind) {
    case 'stroke': {
      const path = strokePath(
        mark.points,
        mark.size,
        mark.simulatePressure,
        FREEHAND.thinning,
        FREEHAND.streamline,
      );
      drawTextured(renderer, ctx, path, mark.color, mark.seed, bounds);
      return;
    }
    case 'erase': {
      // The board is opaque, so erasing is just painting the background back on.
      // On the transparent live overlay that reads as an erase preview too.
      const path = strokePath(mark.points, mark.size, false, ERASER.thinning, ERASER.streamline);
      ctx.save();
      ctx.fillStyle = BOARD.background;
      ctx.fill(path);
      ctx.restore();
      return;
    }
    case 'shape': {
      const path = strokePath(shapePoints(mark), mark.size, false, 0, FREEHAND.streamline);
      drawTextured(renderer, ctx, path, mark.color, mark.seed, bounds);
      return;
    }
    case 'fill': {
      if (target !== 'committed') return;
      floodFill(
        ctx,
        { w: renderer.width, h: renderer.height },
        renderer.scale,
        mark.at,
        mark.color,
        mark.tolerance,
      );
    }
  }
}

export function replay(renderer: Renderer, marks: readonly Mark[]): void {
  resetBoard(renderer);
  for (const mark of marks) drawMark(renderer, mark, 'committed');
}
