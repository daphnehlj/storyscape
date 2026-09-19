import {
  AnswersResponseSchema,
  CreateWorldResponseSchema,
  GetAnswersResponseSchema,
  WorldEventSchema,
  type Answer,
  type WorldEvent,
} from '@app/shared';

// Everything the clarify UI needs from the server. Requests go through the
// Next rewrites, so these are all same-origin.

export async function createWorld(story: string): Promise<string> {
  const res = await fetch('/api/worlds', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ story }),
  });
  const json: unknown = await res.json();
  if (!res.ok) throw new Error(errorMessage(json) ?? 'could not start a world');
  return CreateWorldResponseSchema.parse(json).worldId;
}

// One answer at a time: re-posting the same questionId replaces it, which is
// how going back and changing an answer works.
export async function postAnswer(worldId: string, answer: Answer): Promise<{ rejected: boolean }> {
  const res = await fetch(`/api/worlds/${worldId}/answers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answers: [answer] }),
  });
  const json: unknown = await res.json();
  if (!res.ok) throw new Error(errorMessage(json) ?? 'answer was not accepted');
  const parsed = AnswersResponseSchema.parse(json);
  return { rejected: parsed.rejected?.includes(answer.questionId) ?? false };
}

// An empty array means "skip the rest".
export async function skipRest(worldId: string): Promise<void> {
  await fetch(`/api/worlds/${worldId}/answers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answers: [] }),
  });
}

export async function fetchAnswers(worldId: string): Promise<Answer[]> {
  const res = await fetch(`/api/worlds/${worldId}/answers`);
  if (!res.ok) return [];
  return GetAnswersResponseSchema.parse(await res.json()).answers;
}

export async function fetchResolved(worldId: string): Promise<unknown> {
  const res = await fetch(`/api/worlds/${worldId}/resolved`);
  return res.json();
}

// Tolerate after the wire: an event this build doesn't understand is logged and
// skipped, never thrown.
export function subscribe(worldId: string, onEvent: (event: WorldEvent) => void): () => void {
  const source = new EventSource(`/api/worlds/${worldId}/events`);
  source.onmessage = (message) => {
    if (!message.data) return; // heartbeat
    let json: unknown;
    try {
      json = JSON.parse(message.data);
    } catch {
      return;
    }
    const parsed = WorldEventSchema.safeParse(json);
    if (!parsed.success) {
      console.warn('unknown event, ignoring', json);
      return;
    }
    onEvent(parsed.data);
  };
  return () => source.close();
}

function errorMessage(json: unknown): string | undefined {
  return typeof json === 'object' && json !== null && 'error' in json && typeof json.error === 'string'
    ? json.error
    : undefined;
}
