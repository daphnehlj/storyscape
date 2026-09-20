'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Whiteboard from '@/ui/whiteboard/Whiteboard';
import type { BoardExport } from '@/ui/whiteboard/types';
import { createWorld } from '@/api/worlds';
import styles from './draw.module.css';

/**
 * "Done" sends the board's PNG to the server and follows the world it becomes.
 * Only the image crosses the wire — the pipeline reads the picture, so the board
 * JSON stays here.
 */
export default function DrawPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // One drawing must not become two worlds if Done is tapped twice.
  const uploading = useRef(false);

  const handleSubmit = async ({ png }: BoardExport): Promise<void> => {
    if (uploading.current) return;
    uploading.current = true;
    setError(null);
    try {
      const worldId = await createWorld(png);
      router.push(`/world/${worldId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      uploading.current = false;
    }
  };

  return (
    <>
      <Whiteboard onSubmit={handleSubmit} />
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </>
  );
}
