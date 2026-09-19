'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Answer, GapReport, Question, Stage } from '@app/shared';
import { createWorld, fetchAnswers, fetchResolved, postAnswer, skipRest, subscribe } from '@/api/clarify';
import { ClarifyStepper } from '@/ui/clarify/ClarifyStepper';

// Skeletal harness for the interaction layer: paste a story, answer the
// questions, inspect what the server resolved. The 3D world replaces most of
// this later; the question loop underneath it is the part that stays.

const STORY_KEY = 'storyscape:story';

export default function Home() {
  const [worldId, setWorldId] = useState<string>();
  const [story, setStory] = useState('');
  const [stage, setStage] = useState<Stage>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState(new Map<string, Answer>());
  const [gaps, setGaps] = useState<GapReport[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [rejectedFor, setRejectedFor] = useState<string>();
  const [resolved, setResolved] = useState<unknown>();
  const [error, setError] = useState<string>();

  // The world id lives in the URL, so a refresh mid-question reconnects instead
  // of losing the world.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('world');
    if (fromUrl) setWorldId(fromUrl);
    setStory(sessionStorage.getItem(STORY_KEY) ?? '');
  }, []);

  useEffect(() => {
    if (!worldId) return;
    void fetchAnswers(worldId).then((given) => setAnswers(new Map(given.map((a) => [a.questionId, a]))));
    return subscribe(worldId, (event) => {
      switch (event.type) {
        case 'stage':
          setStage(event.stage);
          break;
        case 'questions':
          setQuestions(event.questions);
          break;
        case 'gaps':
          setGaps(event.gaps);
          break;
        case 'log':
          setLogs((l) => [...l, event.text]);
          break;
        case 'error':
          setError(event.message);
          break;
        default:
          break; // scene: not this layer's job
      }
    });
  }, [worldId]);

  // Once the loop closes, show what the answers actually became.
  useEffect(() => {
    if (!worldId || !stage || stage === 'brief' || stage === 'clarify') return;
    void fetchResolved(worldId).then(setResolved);
  }, [worldId, stage]);

  const start = async () => {
    setError(undefined);
    try {
      sessionStorage.setItem(STORY_KEY, story);
      const id = await createWorld(story);
      window.history.replaceState(null, '', `?world=${id}`);
      setWorldId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not start');
    }
  };

  const onAnswer = useCallback(
    async (answer: Answer) => {
      if (!worldId) return;
      setRejectedFor(undefined);
      try {
        const { rejected } = await postAnswer(worldId, answer);
        if (rejected) {
          setRejectedFor(answer.questionId);
          return;
        }
        setAnswers((prev) => new Map(prev).set(answer.questionId, answer));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'answer failed');
      }
    },
    [worldId],
  );

  const inClarify = stage === 'clarify' && questions.length > 0;

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, display: 'grid', gap: 20 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Story → World · interaction layer</h1>

      {!worldId && (
        <div style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
          <textarea
            value={story}
            onChange={(e) => setStory(e.target.value)}
            rows={8}
            placeholder="Paste a story…"
            style={{ fontSize: 15, padding: 10, borderRadius: 8, border: '1px solid #bbb' }}
          />
          <button onClick={start} disabled={!story.trim()} style={{ padding: '10px 16px', fontSize: 16, borderRadius: 8 }}>
            Build my world
          </button>
        </div>
      )}

      {worldId && <div style={{ color: '#666', fontSize: 13 }}>world {worldId} · stage {stage ?? '…'}</div>}
      {error && <div style={{ color: '#a33' }}>{error}</div>}

      {inClarify && (
        <ClarifyStepper
          questions={questions}
          answers={answers}
          onAnswer={(a) => void onAnswer(a)}
          onSkipRest={() => worldId && void skipRest(worldId)}
          rejectedFor={rejectedFor}
        />
      )}

      {stage && !inClarify && worldId && stage !== 'brief' && (
        <div>Building your world… (Stage 3 isn&apos;t wired up yet)</div>
      )}

      {/* Everything below is the debug view: what the machine decided, and why. */}
      {gaps.length > 0 && (
        <details open={!inClarify}>
          <summary>gaps ({gaps.filter((g) => g.selected).length} asked of {gaps.length})</summary>
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {gaps.map((g) => (
                <tr key={g.id} style={{ opacity: g.selected ? 1 : 0.6 }}>
                  <td style={{ padding: '2px 8px' }}>{g.selected ? 'ASK' : ''}</td>
                  <td style={{ padding: '2px 8px' }}>{g.slot}</td>
                  <td style={{ padding: '2px 8px' }}>{g.entity ?? '—'}</td>
                  <td style={{ padding: '2px 8px' }}>{g.evidence}</td>
                  <td style={{ padding: '2px 8px' }}>{g.score.toFixed(2)}</td>
                  <td style={{ padding: '2px 8px', color: '#666' }}>{g.reason}</td>
                  <td style={{ padding: '2px 8px', color: '#666' }}>→ {g.inferred}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {logs.length > 0 && (
        <details>
          <summary>log ({logs.length})</summary>
          <pre style={{ fontSize: 12 }}>{logs.join('\n')}</pre>
        </details>
      )}

      {resolved !== undefined && (
        <details open>
          <summary>resolved brief</summary>
          <pre style={{ fontSize: 12, overflow: 'auto' }}>{JSON.stringify(resolved, null, 2)}</pre>
        </details>
      )}
    </main>
  );
}
