'use client';

import { use, useEffect, useRef, useState } from 'react';
import type { Scene, Stage } from '@app/shared';
import { subscribeToWorld } from '@/api/worlds';
import styles from './world.module.css';

const STAGES: { id: Stage; label: string }[] = [
  { id: 'read', label: 'Looking at your drawing' },
  { id: 'brief', label: 'Imagining the world' },
  { id: 'build', label: 'Building it' },
  { id: 'assets', label: 'Painting the sky' },
  { id: 'done', label: 'Done' },
];

export default function WorldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [stage, setStage] = useState<Stage>('read');
  const [scene, setScene] = useState<Scene | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // The server replays stage + latest scene on connect, so a refresh mid-build
    // repopulates instead of showing an empty page.
    return subscribeToWorld(id, {
      onStage: setStage,
      onScene: setScene,
      onLog: (text) => setLog((lines) => [...lines, text]),
      onError: setError,
    });
  }, [id]);

  useEffect(() => {
    const list = logRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [log]);

  const current = STAGES.findIndex((s) => s.id === stage);

  return (
    <main className={styles.root}>
      <section className={styles.panel}>
        <h1 className={styles.title}>{scene?.title ?? 'Building your world…'}</h1>
        <p className={styles.counts}>
          {scene
            ? `${scene.zones.length} places · ${scene.objects.length} things · ${scene.scatters.length} sprinklings`
            : 'Getting started…'}
        </p>
        <ol className={styles.stages}>
          {STAGES.map((s, index) => (
            <li
              key={s.id}
              className={[
                styles.stage,
                index === current ? styles.stageActive : '',
                index < current ? styles.stageDone : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {s.label}
            </li>
          ))}
        </ol>

        {/* Seam for the renderer: drop <WorldCanvas scene={scene} /> in here. */}
        <div className={styles.viewport}>
          {scene ? `The 3D view lands here — world ${scene.id}` : 'Waiting for the first scene…'}
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
      </section>

      <section className={styles.panel}>
        <p className={styles.heading}>Your drawing</p>
        {scene?.sourceImageUrl ? (
          <img className={styles.drawing} src={scene.sourceImageUrl} alt="The drawing this world was built from" />
        ) : null}
        <p className={styles.heading} style={{ marginTop: 16 }}>
          What the machine is doing
        </p>
        <ul className={styles.log} ref={logRef}>
          {log.map((line, index) => (
            // Log lines are an append-only transcript: index is their identity.
            <li key={index} className={styles.logLine}>
              {line}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
