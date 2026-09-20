'use client';

import { useCallback, useMemo, useReducer } from 'react';
import type { Mark } from './types';

/**
 * `lastOp` tells the renderer whether it can draw just the newest mark or has to
 * replay everything. `rev` makes the render effect idempotent — StrictMode runs
 * effects twice in dev and a crayon mark drawn twice comes out darker.
 */
export type BoardState = {
  marks: Mark[];
  redo: Mark[];
  rev: number;
  lastOp: 'add' | 'replay';
};

type BoardAction =
  | { type: 'add'; mark: Mark }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' };

const initialState: BoardState = { marks: [], redo: [], rev: 0, lastOp: 'replay' };

function reducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'add':
      // A new mark invalidates the redo branch, same as any editor.
      return { marks: [...state.marks, action.mark], redo: [], rev: state.rev + 1, lastOp: 'add' };
    case 'undo': {
      if (state.marks.length === 0) return state;
      const marks = state.marks.slice(0, -1);
      const undone = state.marks[state.marks.length - 1];
      return { marks, redo: [...state.redo, undone], rev: state.rev + 1, lastOp: 'replay' };
    }
    case 'redo': {
      if (state.redo.length === 0) return state;
      const restored = state.redo[state.redo.length - 1];
      return {
        marks: [...state.marks, restored],
        redo: state.redo.slice(0, -1),
        rev: state.rev + 1,
        lastOp: 'add',
      };
    }
    case 'clear':
      if (state.marks.length === 0) return state;
      return { marks: [], redo: [], rev: state.rev + 1, lastOp: 'replay' };
  }
}

export function useBoard() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const addMark = useCallback((mark: Mark) => dispatch({ type: 'add', mark }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  return useMemo(
    () => ({
      state,
      addMark,
      undo,
      redo,
      clear,
      canUndo: state.marks.length > 0,
      canRedo: state.redo.length > 0,
    }),
    [state, addMark, undo, redo, clear],
  );
}
