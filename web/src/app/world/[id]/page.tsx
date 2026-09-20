'use client';

import dynamic from 'next/dynamic';
import { use, useEffect, useRef, useState } from 'react';
import type { Scene, Stage } from '@app/shared';
import { subscribeToWorld } from '@/api/worlds';
import styles from './world.module.css';

// The renderer touches document/WebGL on import, so it never runs on the server.
const World = dynamic(() => import('@/scene/World').then((m) => m.World), { ssr: false });

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
  const [note, setNote] = useState<string | null>(null);
  const [fly, setFly] = useState(false);
  const [logOpen, setLogOpen] = useState(true);
  const logRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // The server replays stage + latest scene on connect, so a refresh mid-build
    // repopulates instead of showing an empty page.
    return subscribeToWorld(id, {
      onStage: (next) => {
        setStage(next);
        // Once nothing more is coming, take the child on a tour of their world.
        if (next === 'done') setFly(true);
      },
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
      {/* Every scene event replaces this whole prop: the renderer diffs by id and
          keeps what hasn't changed, so the world grows instead of restarting. */}
      {scene ? (
        <World
          scene={scene}
          fly={fly}
          onUserOrbit={() => setFly(false)}
          onSelect={(title, storyNote) => setNote(`${title} — ${storyNote}`)}
        />
      ) : (
        <p className={styles.waiting}>Reading your drawing…</p>
      )}

      <div className={styles.overlay}>
        <section className={styles.card}>
          <h1 className={styles.title}>{scene?.title ?? 'Building your world…'}</h1>
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
          {scene ? (
            <p className={styles.counts}>
              {scene.zones.length} places · {scene.objects.length} things · {scene.scatters.length} sprinklings
            </p>
          ) : null}
        </section>

        <section className={`${styles.card} ${styles.logCard}`}>
          <button
            type="button"
            className={styles.heading}
            onClick={() => setLogOpen((open) => !open)}
            aria-expanded={logOpen}
          >
            What the machine is doing
            <span aria-hidden className={logOpen ? styles.chevronOpen : styles.chevron}>
              ⌄
            </span>
          </button>
          {logOpen ? (
            <>
              <ul className={styles.log} ref={logRef}>
                {log.map((line, index) => (
                  // An append-only transcript: a line's position is its identity.
                  <li key={index} className={styles.logLine}>
                    {line}
                  </li>
                ))}
              </ul>
              {scene?.sourceImageUrl ? (
                <img className={styles.drawing} src={scene.sourceImageUrl} alt="The drawing this world was built from" />
              ) : null}
            </>
          ) : null}
        </section>
      </div>

      {note ? (
        <button type="button" className={styles.note} onClick={() => setNote(null)}>
          {note}
        </button>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </main>
  );
}
