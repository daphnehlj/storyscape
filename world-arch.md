# Drawing → 3D World: Architecture & Team Plan

This doc explains how the project is built, how we split the work, and how the two halves come back together. If you change the **contract** (section 4), update this doc in the same PR.

---

## 1. What we're building

A child uploads a photo of a drawing they made — a scribble, a house with a sun in the corner — and gets a 3D world built from it, rendered in the browser. The world builds up live on screen as an AI agent places things in it, laid out the way the child laid out the page.

**Pipeline in one line:** drawing → reading (what's in the picture) → world brief → agent builds a scene description → browser renders it.

The thing that makes this a product rather than a prompt is the middle: reading an ambiguous drawing into structured elements with positions and confidences, then designing a world that is richer than the drawing but still recognisably the child's.

## 2. Architecture

```
┌────────────────┐
│ Drawing (image)│  (uploaded in the web UI)
└──────┬─────────┘
       │ POST /api/worlds  (multipart/form-data)
       ▼
┌───────────────────────── SERVER (Person A) ─────────────────────────┐
│                                                                     │
│  Stage 1: vision LLM reads the drawing                              │
│     – moderation on the image first                                 │
│     – elements with page position, colour, size, confidence         │
│                          │                                          │
│                          ▼                                          │
│  Stage 2: mid-tier LLM → World Brief (light JSON)                   │
│     – zones, hero objects, ambient objects, mood, palette           │
│     – palette starts from the drawing's own colours                 │
│                          │                                          │
│            ┌─────────────┴──────────────┐                           │
│            ▼                            ▼                           │
│  Stage 3: Agent loop           Skybox job (parallel)                │
│   (tool calls edit Scene)       – all models come from the library  │
│            │                    – skybox generation                 │
│            │                    – cached by prompt                  │
│            └─────────────┬──────────────┘                           │
│                          ▼                                          │
│                 Scene (validated with shared zod schema)            │
│                          │                                          │
└──────────────────────────┼──────────────────────────────────────────┘
                           │  server-sent events: full Scene on every change
                           ▼
┌───────────────────────── WEB (Person B) ────────────────────────────┐
│  React Three Fiber renderer                                         │
│   – terrain, water, zones/platforms, lighting, fog, sky, post-fx    │
│   – library models + generated models (normalized, snapped)         │
│   – placeholders for pending assets                                 │
│   – camera fly-through, story-note popups, progress/log panel       │
└─────────────────────────────────────────────────────────────────────┘
```

### Key design decisions (and why)

1. **The agent never writes Three.js code.** It calls tools like `place_object` or `create_zone`, and each call edits a JSON `Scene`. The renderer only knows how to draw a `Scene`. This keeps the output valid, keeps the visuals consistent, and lets the world stream in live.
2. **The brief is light JSON with free-text descriptions.** It isn't a rigid schema. Its main job is to let us start the slow 3D generation jobs *before* the agent runs.
3. **Every model comes from a pre-made library; nothing is generated.** Text-to-3D takes 30s–2min per model and lands in a different art style, so the closest library model always wins. Worlds build in seconds, cost nothing per object and stay visually consistent.
4. **The server sends the full Scene every time, not partial updates.** Scenes are a few KB. Resending everything rules out bugs where updates arrive out of order or get applied to stale state.
5. **Same art style everywhere: low-poly geometry, lighting does the work** (think *Sky: Children of the Light*). Library models are low-poly, every generation prompt asks for that style, and B's renderer sells it with atmosphere and post-processing. Because all atmospheric color derives from `environment.palette`, the palette is the main lever A has over how a world *feels*.
6. **TypeScript on both sides**, with shared zod schemas in `shared/`. A contract change breaks both builds right away instead of failing quietly at demo time.

## 3. The split

**Person A = "Brain" (server):** drawing → `Scene`.
**Person B = "World" (web):** `Scene` → pixels.

> Fill in: **Person A:** ______ **Person B:** ______

| Area | Person A: Brain | Person B: World |
|---|---|---|
| Core job | Drawing → reading → brief → agent → valid `Scene` | Render any valid `Scene` well |
| LLM work | Stage 1 & 2 prompts, agent loop, tool definitions and error handling | — |
| External APIs | Skybox generation, caching, serving generated images | — |
| 3D / visuals | — | Terrain, water, platforms, lighting, fog, sky, post-processing, scatter, loading and normalizing models, camera |
| Asset library | Reads `library.json` and gives the list to the agent | Picks and curates ~40–60 low-poly models, **writes `library.json`** |
| Server | HTTP API, event stream, storing worlds, image upload | — |
| UI | — | **Drawing upload** (file picker / camera), stage progress, agent log panel, story-note popups |
| Shared | `shared/contract.ts`, `fixtures/` (both own; changes need the other's review) | same |

### Person A: detailed scope

- **Stage 1: reading the drawing.** Mid-tier vision model, JSON output (`server/src/pipeline/readDrawing.ts`). The uploaded image is moderated first, then read into `elements`: for each thing on the page a name, description, kind, page coordinates (`x`/`y` as 0–1 fractions, 0,0 = top-left), `relativeSize`, colours and a `confidence`. Plus `summary`, `setting`, `mood` and `dominantColors`. Take the drawing at face value, never tidy it into something more ordinary, and keep anything unidentifiable as `kind: 'unclear'` with a low confidence rather than dropping it. The reading is also what the agent log shows the child ("I can see a house, a sun, a purple creature…").
- **Stage 2: World Brief.** Mid-tier model, JSON output, built from the reading. Internal to A, not part of the contract. Suggested shape:
  ```json
  {
    "title": "Jack and the Beanstalk",
    "mood": "whimsical, slightly ominous",
    "palette": ["#7a9a4a", "#d4a73c", "#c9d6e8"],
    "timeOfDay": "day",
    "weather": "clear",
    "zones": [
      { "name": "Jack's farm", "elevation": "ground", "description": "poor cottage, dry field, broken fence" },
      { "name": "Cloud kingdom", "elevation": "sky", "description": "giant's castle on a bank of clouds" }
    ],
    "heroObjects": [
      { "name": "beanstalk", "description": "enormous twisting green vine with huge leaves", "size": 80 },
      { "name": "giant's castle", "description": "huge grey stone castle", "size": 40 }
    ],
    "ambientObjects": ["hay bales", "cow", "wooden fence", "cloud puffs"]
  }
  ```
  `palette` is load-bearing and required: B derives sky, fog, light and terrain colour from it and never invents a colour. It is exactly 3 hex colours in a fixed order — **[sky/horizon, ground, accent/zenith]** — taken from the drawing's own `dominantColors`, so a child who drew in orange and purple gets an orange and purple world. Prefer `dawn`/`dusk` for `timeOfDay` when the drawing allows, since they're the best-looking states.
- **Layout comes from the page.** The agent maps page coordinates onto the ground: x 0→1 across the world's -100→100, and the page's bottom edge is the near foreground (z +100) while the top is the distance (z -100). Things floating in the top strip are sky zones; the sun and plain clouds are weather, not objects. This is why the child recognises the world as theirs.
- **Every model comes from the library. There is no text-to-3D.** For each `heroObject` the brief names the closest `library.json` entry, and that is what gets placed — even for something invented, where the closest match plus a good label is the answer. A hallucinated id is corrected against a word/tag scorer (`resolveLibraryMatches`), so an object always resolves to a real model. This makes worlds fast, free and visually consistent; the cost is that a six-legged purple monster arrives as whatever the library has nearest to it, which is why the library's coverage and its `description`/`tags` quality are the main lever on output quality.
- **Asset jobs.** The skybox is the only generated asset. It starts before the agent runs and settles to `ready` + `url` or `failed`, cached by prompt hash; on failure B's gradient sky stands in.
- **Agent loop.** A tool-calling model builds the scene with the tools below. After every tool call: apply it to the Scene, validate against the zod schema, and send a `scene` event. An invalid call goes back to the agent as a tool error so it can fix it.

  | Tool | Effect on `Scene` |
  |---|---|
  | `set_terrain(biome, heightVariation, water?)` | sets `terrain` |
  | `set_environment(timeOfDay, weather, fogDensity, palette)` | sets `environment`; `palette` is required — the brief's [sky, ground, accent] |
  | `create_zone(name, description, center, radius, elevation, platform?, storyNote?)` | appends to `zones` |
  | `place_object(assetId, zoneId?, position, size, rotationY, snapToGround, label?, storyNote?)` | appends to `objects` |
  | `scatter(assetIds, zoneId, count, sizeRange)` | appends to `scatters` |
  | `remove(id)` | removes a zone, object or scatter |
  | `describe_scene()` | returns a text summary so the agent can check its own work |
  | `finish()` | ends the loop, sends `stage: done` |

  The agent's system prompt includes: the brief, the library list (IDs, tags, descriptions, default sizes), the IDs of pending hero assets, and the world conventions from §4.1. It should think in **zones and relative placement**. Code handles exact placement (e.g. `snapToGround`).
- **Budget:** cap the agent at ~40 tool calls. Aim for world done in under 90s, excluding hero asset generation.

### Person B: detailed scope

- **Visual direction: low-poly geometry, lighting does the work.** Think *Sky: Children of the Light*: soft bloom, filmic tone mapping, thick colored haze, low warm sun, big soft clouds, floating light motes. Every atmospheric color (sky, fog, light tint) derives from `environment.palette`, so a palette change alone makes a world feel different.
- **Renderer** for every field in `Scene`, with each piece a component: `<Terrain>`, `<Water>`, `<Environment>`, `<ZonePlatform>`, `<SceneObject>`, `<Scatter>`, plus `<Effects>` (post-processing) wrapping the canvas.
- **Terrain:** noise heightmap from `seed` and `heightVariation`, colored by biome and tinted by `palette`. Zones should read clearly: flatten the terrain a bit near zone centers so buildings sit well.
- **Environment:** one directional sun (angle and warmth from `timeOfDay`; dawn/dusk are the showcase states) with soft shadows, a hemisphere fill and drei's `Environment` for IBL so models pick up sky color (alias the import; it shares a name with your component). `fogExp2` colored to the sky horizon, density from `fogDensity`. `weather` adds drei `<Cloud>` cover and rain/snow particles. drei `<Sparkles>` for light motes. Sky is a 2-stop gradient from `palette` until `skybox.status === 'ready'`, then the equirectangular `skybox.url` as background + IBL.
- **Effects:** `@react-three/postprocessing` with `<Bloom>` (high luminance threshold: sun, sky and emissive bits glow, not the whole scene), ACES `<ToneMapping>`, light `<Vignette>`. Composer at half resolution. Turn it on early with tame settings so the fixture is judged under the real look; tune at H22.
- **Zone platforms:** `'cloud'` → drei `<Cloud>` volume at `elevation`; `'rock'` → flat low-poly disc. Both are the snap target for objects in that zone.
- **Model normalization (B owns this, A never deals with it):** after loading a `.glb`, compute its bounding box, scale it so its **height = `size`**, and move its origin to bottom-center. If `snapToGround`, raycast down to the terrain (or to the zone platform when the zone's `elevation > 0`).
- **Scatter:** deterministic random placement inside the zone circle using `seed`, avoiding objects and zone centers. Use instanced meshes.
- **Pending assets:** render `fallbackAssetId` (or a pulsing placeholder) until `status: 'ready'`, then swap in the real model. On `failed`, keep the fallback.
- **Reconcile by ID:** on each new `scene` event, diff by `id`, keep existing meshes and add or remove only what changed. The world should grow smoothly without flicker.
- **Camera:** orbit controls, plus an automatic fly-through that visits each zone in order, including the sky zones.
- **UI:** drawing upload (file picker, ideally camera capture on mobile) + "Build" button, stage indicator (`read → brief → build → assets → done`), scrolling agent log, click on an object or zone to show its `storyNote`.
- **Asset library:** ~40–60 CC0 low-poly models (Quaternius, Kenney, Poly Pizza). Cover trees, rocks, bushes, grass, houses, cottages, castles, towers, fences, wells, bridges, farm animals, clouds, boats, carts, and a few characters. Write `library.json` (see §4.3).

## 4. The contract

Everything in this section lives in `shared/contract.ts` as zod schemas, with TS types derived from them. **This is the only thing both halves depend on.**

### 4.1 World conventions

- **Y-up. 1 unit = 1 meter.** The world is a square `bounds.size` wide (default 200), centered on the origin.
- Ground zones have `elevation: 0`. Sky zones use `elevation ≥ 60` and must set `platform` (`'cloud'` or `'rock'`), which B renders as a floating platform with radius `zone.radius`.
- `size` = **target height in meters** of the object after normalization.
- `rotationY` is in **degrees**.
- `snapToGround: true` → B ignores `position[1]` and places the object on the terrain, or on the platform of its zone if that zone is elevated.
- Every `assetId` used anywhere must be a key in `Scene.assets`, and every library asset ID must exist in `library.json`.
- IDs are unique across `zones`, `objects` and `scatters`, and **never reused** within a world. B relies on them to update the scene without redrawing it.

### 4.2 Scene

```ts
export type Vec3 = [number, number, number];

export interface Scene {
  version: 1;
  id: string;
  title: string;
  bounds: { size: number; skyHeight: number };
  terrain: {
    biome: 'grassland' | 'forest' | 'desert' | 'snow' | 'swamp' | 'beach';
    heightVariation: number;          // 0–1
    seed: number;
    water?: { level: number };        // y height of water plane
  };
  environment: {
    timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
    weather: 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog';
    fogDensity: number;               // 0–1
    palette: [string, string, string]; // hex: [sky/horizon, ground, accent]; every colour in the world derives from it
    skybox?: { status: 'pending' | 'ready' | 'failed'; url?: string };
  };
  zones: Zone[];
  objects: SceneObject[];
  scatters: Scatter[];
  assets: Record<string, AssetRef>;
  sourceImageUrl?: string;            // the child's drawing, for B to show beside the world
}

export interface Zone {
  id: string;
  name: string;
  description: string;
  center: [number, number];           // x, z
  radius: number;
  elevation: number;
  platform?: 'cloud' | 'rock';        // required when elevation > 0
  storyNote?: string;
}

export interface SceneObject {
  id: string;
  assetId: string;
  zoneId?: string;
  position: Vec3;
  snapToGround: boolean;
  rotationY: number;
  size: number;
  label?: string;
  storyNote?: string;
}

export interface Scatter {
  id: string;
  assetIds: string[];
  zoneId: string;
  count: number;
  seed: number;
  sizeRange: [number, number];
}

export type AssetRef =
  | { id: string; source: 'library' }
  | {
      id: string;
      source: 'generated';
      prompt: string;
      status: 'pending' | 'ready' | 'failed';
      url?: string;                   // required when status === 'ready'
      fallbackAssetId: string;        // a library asset id
    };
```

A world can start with empty arrays and default terrain and environment, so the very first `scene` event is already valid.

### 4.3 Asset library list

`web/public/assets/library/library.json`, written by B and read by A:

```json
[
  {
    "id": "oak_tree",
    "file": "oak_tree.glb",
    "tags": ["tree", "forest", "nature"],
    "defaultSize": 8,
    "description": "large leafy oak tree"
  }
]
```

**Rule:** B may **add** entries at any time but must never rename or remove an `id`. A copies this file into the agent prompt at runtime, so a new model is available to the agent right away.

### 4.4 HTTP API

| Method & path | Request | Response |
|---|---|---|
| `POST /api/worlds` | `multipart/form-data` with a `drawing` image file (PNG/JPEG/WEBP/GIF, ≤20MB) | `{ worldId: string }` |
| `GET /api/worlds/:id` | — | latest `Scene` |
| `GET /api/worlds/:id/events` | — | server-sent event stream of `WorldEvent` |
| `GET /generated/:file` | — | generated `.glb` / skybox image (served by A) |
| `GET /uploads/:file` | — | the child's original drawing (served by A, referenced by `Scene.sourceImageUrl`) |

The web app talks to the server through Next.js rewrites in `next.config.ts` (`/api`, `/generated`, `/uploads` → `API_URL`, default `http://localhost:8787`), so there are no cross-origin (CORS) problems. **B: `/uploads` needs adding to the rewrite list.**

### 4.5 Events

```ts
export type WorldEvent =
  | { type: 'stage'; stage: 'read' | 'brief' | 'build' | 'assets' | 'done' }
  | { type: 'scene'; scene: Scene }   // always the FULL scene
  | { type: 'log'; text: string }     // agent commentary for the log panel
  | { type: 'error'; message: string };
```

- A sends a `scene` event after every successful tool call and every asset status change.
- When the event stream connects, A first sends the current stage and the latest `scene`, so reconnecting or refreshing the page works.
- B treats the **latest** `scene` as the truth and just redraws from it.

### 4.6 Validation

- A validates every Scene with `SceneSchema.parse` **before** sending it. Invalid scenes never reach the wire.
- B checks incoming events with `WorldEventSchema.safeParse`. If one fails, log it and keep showing the last good scene.
- `shared/` includes a `validateSceneRefs(scene)` helper that checks every rule the types can't express: asset IDs exist, zone IDs exist, `platform` is set when elevation > 0, `url` is set when an asset is ready.

## 5. Repo layout

```
shared/
  contract.ts          zod schemas + inferred types + validateSceneRefs
fixtures/
  drawings/            test drawings (the pipeline's input)
  jack.scene.json      hand-written complete Jack & the Beanstalk scene
  mock-server.ts       replays the fixture as an event stream (for B)
server/                Person A
  src/pipeline/        readDrawing.ts, brief.ts
  src/agent/           loop.ts, tools.ts, prompts.ts
  src/assets/          skybox client, cache
  src/api.ts           HTTP + event stream
web/                   Person B
  public/assets/library/   *.glb + library.json
  src/app/             Next.js App Router entry (layout, page)
  src/scene/           Terrain, Environment, Effects, ZonePlatform, SceneObject, Scatter
  src/ui/              StoryInput, StageBar, AgentLog, StoryNote
world-arch.md          this file
```

Stack: **server:** Node + TypeScript + Hono, **web:** Next.js (App Router) + React Three Fiber + drei + @react-three/postprocessing, **shared:** zod. npm workspaces; `server` and `web` both import `@app/shared`.

## 6. Working in parallel

The key is `fixtures/jack.scene.json`. Once it exists, neither of us waits on the other.

**Person B works against the fixture:**
- `mock-server.ts` serves the same API as the real server and sends the fixture **piece by piece**: terrain, then environment, then each zone, then objects and scatters one at a time, about 300ms apart. The hero asset starts `pending` and flips to `ready` after ~5s. This covers smooth incremental updates, placeholders and asset swaps before the real backend exists.
- Switching from mock to real server is a single env var: `API_URL` in `web/.env.local` (mock on `:3001`, real server on `:8787`).

**Person A works against the schema:**
- "Done" for any pipeline change = the output passes `SceneSchema` + `validateSceneRefs`.
- A can save any generated Scene to `fixtures/` and load it in B's renderer to see it, even before the event stream is wired up.
- Keep a few test drawings in `fixtures/drawings/`: a classic house-sun-tree, something with a floating/sky element, and at least one genuine unreadable scribble — that last one is what exercises the reading stage.

## 7. Timeline & merge checkpoints

Times are hackathon hours from kickoff. Adjust as needed.

| When | Person A | Person B | Merge checkpoint |
|---|---|---|---|
| **H0–2** | **Together:** agree on `shared/contract.ts`, hand-write `jack.scene.json`, set up the workspace | | Contract frozen at `version: 1` |
| H2–8 | Stage 2 brief + agent loop with tools; outputs valid Scenes to files | Renderer draws the fixture: terrain, environment, zones, library objects, scatter; post-processing on at tame settings | **CP1 (~H8):** A's output files render correctly in B's renderer |
| H8–14 | HTTP API + event stream; drawing upload; prompt tuning on test drawings | Mock-server streaming, updating by ID, UI (upload, stage bar, log) | **CP2 (~H14):** real end-to-end: upload a drawing → watch world build live |
| H14–22 | Skybox job, caching, fallbacks | Skybox swap, camera fly-through, story notes | **CP3 (~H22):** the generated sky appears live |
| H22–30 | Prompt quality across all test drawings, speed, error handling | Visual polish: tune bloom, lighting, fog, clouds, water, platforms; performance | **CP4:** full run on all test drawings, bugs listed and assigned |
| H30–end | **Together:** fix bugs, warm the asset cache for demo drawings, rehearse demo, record a backup video | | Demo-ready |

**At each checkpoint:** both merge to `main`, run the full flow on at least two drawings, then write down anything that doesn't fit the contract. Fix it by changing the contract (with review), not by working around it in one half.

## 8. Rules for changing the contract

1. Any PR that touches `shared/` or `library.json` IDs needs the other person's review.
2. Adding an optional field is fine anytime. B's renderer must ignore fields it doesn't know yet.
3. Renaming, removing, or making a field required is a **breaking change**: agree in chat first, bump `version`, and update `jack.scene.json` and this doc in the same PR.
4. If you're blocked on the other half, add what you need to the fixture and keep going. Don't wait.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| The library has nothing like what the child drew | The closest model is used with a label and story note naming what it really is; keep the library broad, and keep `tags`/`description` accurate since matching runs on them |
| Library models are wrong size or orientation | B normalizes by bounding box; `size` is always target height |
| Mixed art styles look bad | Low-poly library only, and nothing is generated, so the style can't drift |
| Post-processing and shadows tank the framerate | Half-res effect composer, shadow map ≤ 2048, instanced scatter; check 60fps on a full fixture before H22 |
| LLM places things badly | Agent works in zones + relative positions; `snapToGround`; `describe_scene` for self-checking |
| Agent sends invalid tool calls | zod validation after each call; errors returned as tool results; call cap |
| Agent too slow for a live demo | Tool-call cap; stream progress so the wait is part of the show; cached demo worlds |
| Contract drift between halves | Shared zod types, fixture-driven dev, merge checkpoints |

## 10. Open questions

- [x] **Agent model:** `gpt-6-astra` via the OpenAI Responses API, behind `server/src/llm/` (`complete`, `completeJson`, `callWithTools`). Swapping it is one line in `server/src/config.ts`.
- [x] **Models for stages 1 & 2:** mid = `gpt-5.6-sol` for both reading the drawing (vision) and the world brief. `gpt-5.6-luna` stays configured as the `cheap` tier but nothing uses it since the compression stage is gone. Same config object.
- [x] **Text-to-3D provider:** none. Worlds are built entirely from the curated library; the closest library model always wins. (Tripo was wired up and then removed — speed, cost and art-style consistency all favoured the library.)
- [x] **Skybox provider:** OpenAI `gpt-image-2.5-flare` at 2048x1024 — one vendor and one key instead of two. If the seams show, switch to Blockade Labs; B's gradient sky is the fallback either way.
- [ ] **Demo mode:** a fly-through to watch only, or a walkable world? Walkable adds collision and player controls, which falls to Person B.
- [ ] **Sponsor APIs** we want to target for prizes.
