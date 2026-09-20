'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import { toBoardJson, toPng } from './exportBoard';
import {
  BOARD,
  BRUSH_SIZES,
  DEFAULTS,
  ERASER,
  FILL,
  FREEHAND,
  INPUT,
  PALETTE,
  UI,
} from './presets';
import {
  clearLive,
  createRenderer,
  disposeRenderer,
  drawMark,
  replay,
  resizeRenderer,
  type Renderer,
} from './render';
import Toolbar from './Toolbar';
import type {
  BoardExport,
  EraseMark,
  Mark,
  ShapeKind,
  ShapeMark,
  StrokeMark,
  StrokePoint,
  ToolId,
} from './types';
import { nextMarkId } from './types';
import { useBoard } from './useBoard';
import styles from './whiteboard.module.css';

type Size = { w: number; h: number };
type DragMark = StrokeMark | EraseMark | ShapeMark;
type Draft = { pointerId: number; mark: DragMark };

const newSeed = (): number => Math.floor(Math.random() * 0x7fffffff);

const pixelRatio = (): number =>
  Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, BOARD.maxPixelRatio);

export type WhiteboardProps = {
  onSubmit?: (result: BoardExport) => void;
};

export default function Whiteboard({ onSubmit }: WhiteboardProps): ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const renderedRevRef = useRef(-1);

  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [tool, setTool] = useState<ToolId>(DEFAULTS.toolId);
  const [colorId, setColorId] = useState<string>(DEFAULTS.colorId);
  const [sizeId, setSizeId] = useState<string>(DEFAULTS.sizeId);
  const [toolsCollapsed, setToolsCollapsed] = useState(false);

  const board = useBoard();
  const { state, addMark, undo, redo, clear } = board;

  // The render effects need the current marks without re-running per mark.
  const marksRef = useRef<Mark[]>(state.marks);
  marksRef.current = state.marks;

  const color = PALETTE.find((c) => c.id === colorId) ?? PALETTE[0];
  const brush = BRUSH_SIZES.find((b) => b.id === sizeId) ?? BRUSH_SIZES[0];

  // --- canvas lifecycle -----------------------------------------------------

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize({ w: Math.round(box.width), h: Math.round(box.height) });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const committed = committedRef.current;
    const live = liveRef.current;
    if (!committed || !live) return;
    if (size.w < UI.minBoardPx || size.h < UI.minBoardPx) return;

    const scale = pixelRatio();
    if (rendererRef.current) {
      resizeRenderer(rendererRef.current, committed, live, size.w, size.h, scale);
    } else {
      rendererRef.current = createRenderer(committed, live, size.w, size.h, scale);
    }

    const renderer = rendererRef.current;
    if (!renderer) return;
    // Resizing blows away the backing store, so everything gets repainted.
    replay(renderer, marksRef.current);
    renderedRevRef.current = state.rev;
    // state.rev is read, not depended on: a size change always resyncs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  useEffect(
    () => () => {
      const renderer = rendererRef.current;
      if (renderer) disposeRenderer(renderer);
      rendererRef.current = null;
    },
    [],
  );

  // --- committed rendering --------------------------------------------------

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    // Idempotent: StrictMode runs effects twice in dev, and a crayon mark drawn
    // twice comes out darker than one drawn once.
    if (renderedRevRef.current === state.rev) return;

    if (state.lastOp === 'add' && state.marks.length > 0) {
      drawMark(renderer, state.marks[state.marks.length - 1], 'committed');
    } else {
      replay(renderer, state.marks);
    }
    // Clearing here rather than on pointerup keeps the handoff from the live
    // overlay to the committed canvas flicker-free.
    clearLive(renderer);
    renderedRevRef.current = state.rev;
  }, [state]);

  // --- pointer input --------------------------------------------------------

  const readPoint = useCallback((event: ReactPointerEvent<HTMLDivElement>): StrokePoint => {
    const rect = rectRef.current;
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
      p: event.pressure > 0 ? event.pressure : INPUT.defaultPressure,
    };
  }, []);

  const paintLive = useCallback(() => {
    const renderer = rendererRef.current;
    const draft = draftRef.current;
    if (!renderer || !draft) return;
    clearLive(renderer);
    drawMark(renderer, draft.mark, 'live');
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const stage = stageRef.current;
      if (!stage || !rendererRef.current || draftRef.current) return;
      rectRef.current = stage.getBoundingClientRect();
      const point = readPoint(event);

      if (tool === 'fill') {
        addMark({
          kind: 'fill',
          id: nextMarkId(),
          seed: newSeed(),
          color: color.hex,
          at: { x: point.x, y: point.y },
          tolerance: FILL.tolerance,
        });
        return;
      }

      stage.setPointerCapture(event.pointerId);

      if (tool === 'pen') {
        draftRef.current = {
          pointerId: event.pointerId,
          mark: {
            kind: 'stroke',
            id: nextMarkId(),
            seed: newSeed(),
            color: color.hex,
            size: brush.size,
            simulatePressure: event.pointerType === 'mouse' && FREEHAND.simulatePressureForMouse,
            points: [point],
          },
        };
      } else if (tool === 'eraser') {
        draftRef.current = {
          pointerId: event.pointerId,
          mark: {
            kind: 'erase',
            id: nextMarkId(),
            seed: newSeed(),
            size: brush.size * ERASER.sizeScale,
            points: [point],
          },
        };
      } else {
        draftRef.current = {
          pointerId: event.pointerId,
          mark: {
            kind: 'shape',
            id: nextMarkId(),
            seed: newSeed(),
            shape: tool as ShapeKind,
            color: color.hex,
            size: brush.size,
            from: { x: point.x, y: point.y },
            to: { x: point.x, y: point.y },
          },
        };
      }

      paintLive();
    },
    [addMark, brush.size, color.hex, paintLive, readPoint, tool],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const draft = draftRef.current;
      if (!draft || draft.pointerId !== event.pointerId) return;

      if (draft.mark.kind === 'shape') {
        const point = readPoint(event);
        draft.mark.to = { x: point.x, y: point.y };
      } else {
        // Fast strokes deliver several positions per frame; take them all or
        // the line goes polygonal.
        const native = event.nativeEvent;
        const coalesced =
          typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
        if (coalesced.length > 0) {
          const rect = rectRef.current;
          for (const raw of coalesced) {
            draft.mark.points.push({
              x: raw.clientX - (rect?.left ?? 0),
              y: raw.clientY - (rect?.top ?? 0),
              p: raw.pressure > 0 ? raw.pressure : INPUT.defaultPressure,
            });
          }
        } else {
          draft.mark.points.push(readPoint(event));
        }
      }

      paintLive();
    },
    [paintLive, readPoint],
  );

  const endDraft = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
      const draft = draftRef.current;
      if (!draft || draft.pointerId !== event.pointerId) return;
      draftRef.current = null;
      stageRef.current?.releasePointerCapture(event.pointerId);

      const renderer = rendererRef.current;
      const mark = draft.mark;

      const isTap =
        mark.kind === 'shape' &&
        Math.hypot(mark.to.x - mark.from.x, mark.to.y - mark.from.y) < INPUT.shapeMinDragPx;

      if (!commit || isTap) {
        if (renderer) clearLive(renderer);
        return;
      }
      addMark(mark);
    },
    [addMark],
  );

  // --- actions --------------------------------------------------------------

  const handleClear = useCallback(() => {
    if (state.marks.length === 0) return;
    if (window.confirm('Start over? This wipes the whole drawing.')) clear();
  }, [clear, state.marks.length]);

  const handleDone = useCallback(async () => {
    const canvas = committedRef.current;
    if (!canvas || !onSubmit) return;
    const png = await toPng(canvas);
    onSubmit({
      png,
      json: toBoardJson(state.marks, size.w, size.h),
      width: size.w,
      height: size.h,
    });
  }, [onSubmit, size.h, size.w, state.marks]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo]);

  return (
    <div className={styles.root}>
      <div
        ref={stageRef}
        className={styles.stage}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => endDraft(e, true)}
        onPointerCancel={(e) => endDraft(e, false)}
      >
        <canvas ref={committedRef} className={styles.canvas} />
        <canvas ref={liveRef} className={styles.canvas} />
      </div>

      <Toolbar
        tool={tool}
        colorId={colorId}
        sizeId={sizeId}
        canUndo={board.canUndo}
        canRedo={board.canRedo}
        canExport={board.canUndo && Boolean(onSubmit)}
        onToolChange={setTool}
        onColorChange={setColorId}
        onSizeChange={setSizeId}
        collapsed={toolsCollapsed}
        onToggleCollapsed={() => setToolsCollapsed((open) => !open)}
        onUndo={undo}
        onRedo={redo}
        onClear={handleClear}
        onDone={handleDone}
      />
    </div>
  );
}
