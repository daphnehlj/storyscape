'use client';

import type { ReactElement } from 'react';
import {
  ChevronIcon,
  EllipseIcon,
  EraserIcon,
  FillIcon,
  LineIcon,
  PenIcon,
  RectIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
} from './icons';
import { BRUSH_SIZES, PALETTE, UI } from './presets';
import type { ToolId } from './types';
import styles from './whiteboard.module.css';

const TOOLS: readonly { id: ToolId; name: string; Icon: () => ReactElement }[] = [
  { id: 'pen', name: 'Crayon', Icon: PenIcon },
  { id: 'eraser', name: 'Eraser', Icon: EraserIcon },
  { id: 'fill', name: 'Fill', Icon: FillIcon },
  { id: 'line', name: 'Line', Icon: LineIcon },
  { id: 'rect', name: 'Box', Icon: RectIcon },
  { id: 'ellipse', name: 'Circle', Icon: EllipseIcon },
];

const largestBrush = BRUSH_SIZES[BRUSH_SIZES.length - 1].size;

/** Preview dot scaled into the UI band so "chunky" reads as chunky at a glance. */
function dotPx(size: number): number {
  const t = size / largestBrush;
  return UI.sizeDotMinPx + (UI.sizeDotMaxPx - UI.sizeDotMinPx) * t;
}

const cx = (...names: (string | false)[]) => names.filter(Boolean).join(' ');

export type ToolbarProps = {
  tool: ToolId;
  colorId: string;
  sizeId: string;
  canUndo: boolean;
  canRedo: boolean;
  canExport: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onToolChange: (tool: ToolId) => void;
  onColorChange: (colorId: string) => void;
  onSizeChange: (sizeId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDone: () => void;
};

export default function Toolbar(props: ToolbarProps): ReactElement {
  const activeColor = PALETTE.find((c) => c.id === props.colorId) ?? PALETTE[0];
  const handleLabel = props.collapsed ? 'Show the crayons' : 'Hide the crayons';

  return (
    <>
      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.button}
          onClick={props.onUndo}
          disabled={!props.canUndo}
          aria-label="Undo"
          title="Undo"
        >
          <span>
            <UndoIcon />
          </span>
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={props.onRedo}
          disabled={!props.canRedo}
          aria-label="Redo"
          title="Redo"
        >
          <span>
            <RedoIcon />
          </span>
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={props.onClear}
          disabled={!props.canUndo}
          aria-label="Start over"
          title="Start over"
        >
          <span>
            <TrashIcon />
          </span>
        </button>
        <button
          type="button"
          className={styles.done}
          onClick={props.onDone}
          disabled={!props.canExport}
        >
          Done
        </button>
      </div>

      <div className={cx(styles.bottomBar, props.collapsed && styles.collapsed)}>
        <button
          type="button"
          className={styles.handle}
          onClick={props.onToggleCollapsed}
          aria-expanded={!props.collapsed}
          aria-label={handleLabel}
          title={handleLabel}
        >
          <span className={styles.handleIcon}>
            <ChevronIcon />
          </span>
        </button>

        {/* inert so the tucked-away controls drop out of tab order */}
        <div className={styles.barBody} inert={props.collapsed}>
          <div className={styles.group}>
            {TOOLS.map(({ id, name, Icon }) => (
              <button
                key={id}
                type="button"
                className={cx(styles.button, props.tool === id && styles.active)}
                onClick={() => props.onToolChange(id)}
                aria-label={name}
                aria-pressed={props.tool === id}
                title={name}
              >
                <span>
                  <Icon />
                </span>
              </button>
            ))}
          </div>

          <div className={styles.divider} />

          <div className={styles.group}>
            {PALETTE.map((color) => (
              <button
                key={color.id}
                type="button"
                className={cx(styles.swatch, props.colorId === color.id && styles.active)}
                style={{ background: color.hex }}
                onClick={() => props.onColorChange(color.id)}
                aria-label={color.name}
                aria-pressed={props.colorId === color.id}
                title={color.name}
              />
            ))}
          </div>

          <div className={styles.divider} />

          <div className={styles.group}>
            {BRUSH_SIZES.map((brush) => (
              <button
                key={brush.id}
                type="button"
                className={cx(styles.sizeButton, props.sizeId === brush.id && styles.active)}
                onClick={() => props.onSizeChange(brush.id)}
                aria-label={brush.name}
                aria-pressed={props.sizeId === brush.id}
                title={brush.name}
                style={{ color: activeColor.hex }}
              >
                <span
                  className={styles.sizeDot}
                  style={{ width: dotPx(brush.size), height: dotPx(brush.size) }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
