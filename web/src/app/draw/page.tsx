'use client';

import Whiteboard from '@/ui/whiteboard/Whiteboard';
import type { BoardExport } from '@/ui/whiteboard/types';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Nothing is wired to the server yet, so "Done" downloads both halves of the
 * handoff — this is the seam the drawing → 3D stage plugs into.
 */
export default function DrawPage() {
  const handleSubmit = ({ png, json }: BoardExport): void => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    download(png, `drawing-${stamp}.png`);
    download(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), `drawing-${stamp}.json`);
  };

  return <Whiteboard onSubmit={handleSubmit} />;
}
