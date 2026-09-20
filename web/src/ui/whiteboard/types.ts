/**
 * The board is a display list: `Mark[]` is the whole truth, and rendering is
 * replaying it in order. Fill depends on what is already painted, so order is
 * load-bearing — which is also what makes the exported JSON faithful.
 *
 * These are plain TS, not zod in shared/: nothing parses them and nothing crosses
 * the wire yet. They move to shared/contract.ts when the upload endpoint lands.
 */

export type ToolId = 'pen' | 'eraser' | 'fill' | 'line' | 'rect' | 'ellipse';

export type ShapeKind = Extract<ToolId, 'line' | 'rect' | 'ellipse'>;

/** Board-space CSS pixels. `p` is pointer pressure in [0, 1]. */
export type StrokePoint = { x: number; y: number; p: number };

export type Vec2 = { x: number; y: number };

type MarkBase = {
  id: string;
  /**
   * Per-mark grain offset seed. Stored rather than rolled at draw time so undo →
   * replay reproduces the identical picture instead of re-scattering the wax.
   */
  seed: number;
};

export type StrokeMark = MarkBase & {
  kind: 'stroke';
  color: string;
  size: number;
  simulatePressure: boolean;
  points: StrokePoint[];
};

export type EraseMark = MarkBase & {
  kind: 'erase';
  size: number;
  points: StrokePoint[];
};

export type ShapeMark = MarkBase & {
  kind: 'shape';
  shape: ShapeKind;
  color: string;
  size: number;
  from: Vec2;
  to: Vec2;
};

export type FillMark = MarkBase & {
  kind: 'fill';
  color: string;
  at: Vec2;
  tolerance: number;
};

export type Mark = StrokeMark | EraseMark | ShapeMark | FillMark;

export type BoardJson = {
  version: number;
  width: number;
  height: number;
  background: string;
  marks: Mark[];
};

export type BoardExport = {
  png: Blob;
  json: BoardJson;
  width: number;
  height: number;
};

export type Bounds = { x: number; y: number; w: number; h: number };

let markCounter = 0;

/** IDs are never reused within a board (CLAUDE.md non-negotiable #4). */
export function nextMarkId(): string {
  markCounter += 1;
  return `m${markCounter}`;
}
