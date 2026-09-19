'use client';

import { useState } from 'react';
import { FREE_TEXT_MAX_LENGTH, type Answer, type Question } from '@app/shared';

// One question at a time, with a way back. Deliberately plain: layout, big tap
// targets, thumbnails and read-aloud belong to the real question-card work.

interface Props {
  questions: Question[];
  answers: Map<string, Answer>;
  onAnswer(answer: Answer): void;
  onSkipRest(): void;
  // Set when the server refused the free text on this question.
  rejectedFor?: string;
}

const button: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 16,
  borderRadius: 8,
  border: '1px solid #bbb',
  background: '#fff',
  cursor: 'pointer',
};

export function ClarifyStepper({ questions, answers, onAnswer, onSkipRest, rejectedFor }: Props) {
  // Start on the first unanswered question, so a refresh resumes in place.
  const [index, setIndex] = useState(() => {
    const at = questions.findIndex((q) => !answers.has(q.id));
    return at === -1 ? questions.length - 1 : at;
  });
  const [draft, setDraft] = useState('');

  const question = questions[index];
  if (!question) return null;
  const chosen = answers.get(question.id);
  const isLast = index === questions.length - 1;

  const advance = () => setIndex((i) => Math.min(i + 1, questions.length - 1));

  const pick = (optionId: string) => {
    onAnswer({ questionId: question.id, optionId });
    setDraft('');
    if (!isLast) advance();
  };

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    onAnswer({ questionId: question.id, text });
  };

  return (
    <section style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
      <div style={{ color: '#666', fontSize: 14 }}>
        Question {index + 1} of {questions.length}
      </div>

      <h2 style={{ fontSize: 26, margin: 0 }}>{question.prompt}</h2>

      <div style={{ display: 'grid', gap: 8 }}>
        {question.options.map((option) => {
          const selected = chosen?.optionId === option.id;
          return (
            <button
              key={option.id}
              onClick={() => pick(option.id)}
              style={{
                ...button,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                textAlign: 'left',
                borderColor: selected ? '#333' : '#bbb',
                borderWidth: selected ? 2 : 1,
                fontWeight: selected ? 600 : 400,
              }}
            >
              {option.swatch && (
                <span
                  aria-hidden
                  style={{ width: 24, height: 24, borderRadius: 6, background: option.swatch, border: '1px solid #0002' }}
                />
              )}
              <span>{option.label}</span>
              {/* Thumbnails come later; the asset id is enough to prove the plumbing. */}
              {option.previewAssetId && <code style={{ color: '#888', fontSize: 12 }}>{option.previewAssetId}</code>}
            </button>
          );
        })}
      </div>

      {question.allowFreeText && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={draft}
            maxLength={FREE_TEXT_MAX_LENGTH}
            placeholder="Something else…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitDraft()}
            style={{ ...button, flex: 1, cursor: 'text' }}
          />
          <button onClick={submitDraft} style={button}>
            Use this
          </button>
        </div>
      )}

      {chosen?.text && !rejectedFor && <div style={{ color: '#333' }}>You typed: “{chosen.text}”</div>}
      {rejectedFor === question.id && (
        <div style={{ color: '#a33' }}>Hmm, let&apos;s pick one of these instead!</div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setIndex((i) => Math.max(i - 1, 0))} disabled={index === 0} style={button}>
          ← Back
        </button>
        <button onClick={advance} disabled={isLast} style={button}>
          {chosen ? 'Next →' : 'Surprise me →'}
        </button>
        <button onClick={onSkipRest} style={{ ...button, marginLeft: 'auto' }}>
          Just build it!
        </button>
      </div>
    </section>
  );
}
