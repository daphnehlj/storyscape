import { DRAWING_FIELD, WorldEventSchema, type Scene, type Stage } from '@app/shared';

// The web half's only contact with the server. Everything is typed from
// @app/shared — scene shapes are never redeclared here.

export async function createWorld(png: Blob): Promise<string> {
  const body = new FormData();
  body.append(DRAWING_FIELD, png, 'drawing.png');

  const response = await fetch('/api/worlds', { method: 'POST', body });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // The server writes messages meant for a child; show them as-is.
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'The world could not be started. Is the server running?';
    throw new Error(message);
  }

  const worldId =
    payload && typeof payload === 'object' && 'worldId' in payload && typeof payload.worldId === 'string'
      ? payload.worldId
      : undefined;
  if (!worldId) throw new Error('The server did not return a world id.');
  return worldId;
}

export interface WorldHandlers {
  onStage?: (stage: Stage) => void;
  onScene?: (scene: Scene) => void;
  onLog?: (text: string) => void;
  onError?: (message: string) => void;
}

// The server names every event (`event: stage`, `scene`, `log`, `error`), and
// EventSource.onmessage only fires for unnamed ones — so each name is listened
// for explicitly. The stream is replayed from the start on connect, so a refresh
// mid-build repopulates.
export function subscribeToWorld(worldId: string, handlers: WorldHandlers): () => void {
  const source = new EventSource(`/api/worlds/${worldId}/events`);

  const handle = (raw: unknown) => {
    // EventSource fires its own built-in 'error' event, which shares a name with
    // ours and carries no data — that one is a connection problem, not a payload.
    if (typeof raw !== 'string') return;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      console.warn('ignoring unparseable world event', raw);
      return;
    }
    const parsed = WorldEventSchema.safeParse(json);
    if (!parsed.success) {
      // Tolerate after the wire: a newer server may send events this build
      // doesn't know. Keep the last good scene.
      console.warn('ignoring unreadable world event', parsed.error.issues);
      return;
    }
    const event = parsed.data;
    switch (event.type) {
      case 'stage':
        handlers.onStage?.(event.stage);
        if (event.stage === 'done') source.close();
        break;
      case 'scene':
        handlers.onScene?.(event.scene);
        break;
      case 'log':
        handlers.onLog?.(event.text);
        break;
      case 'error':
        handlers.onError?.(event.message);
        break;
    }
  };

  for (const name of ['stage', 'scene', 'log', 'error']) {
    source.addEventListener(name, (event) => handle((event as MessageEvent<unknown>).data));
  }
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) handlers.onError?.('Lost the connection to the server.');
  };

  return () => source.close();
}
