# Story → 3D World: Architecture & Team Plan

This doc explains how the project is built, how we split the work, and how the two halves come back together. If you change the **contract** (section 4), update this doc in the same PR.

---

## 1. What we're building

A child writes or pastes in a story — their own, or a fairytale like *Jack and the Beanstalk*. The system reads it, notices what the story doesn't say, asks a few simple questions to fill those gaps, and then builds a 3D world the story could take place in, rendered live in the browser as an AI agent places things in it.

**Pipeline in one line:** story → (optional) compressed story → world brief + gaps → child answers a few questions → agent builds a scene description → browser renders it.

The thing that makes this a product rather than a prompt is the middle: the layer that breaks a messy, incomplete story into structured world data, decides what's missing, asks about it in a form a seven-year-old can answer, and drives parallel building from the result. No child is doing this in a coding agent.

## 2. Architecture

```
┌──────────────┐
│  Story text  │  (typed or pasted in the web UI)
└──────┬───────┘
       │ POST /api/worlds
       ▼
┌───────────────────────── SERVER (Person A) ─────────────────────────┐
│                                                                     │
│  Stage 1 (optional): cheap LLM compresses the story                 │
│     – only runs when the story is over ~8k tokens                   │
│     – keeps plot skeleton + every detail about places/landscape     │
│                          │                                          │
│                          ▼                                          │
│  Stage 2: mid-tier LLM → World Brief (light JSON) + gaps            │
│     – zones, hero objects, ambient objects, mood, environment       │
│     – gaps: what the story doesn't say, ranked by visual impact     │
│                          │                                          │
│                          ▼                                          │
│  Stage 2.5: CLARIFY — 3–5 questions to the child                    │
│     – template + slot fill, never free-generated                    │
│     – answers merge back into the brief                             │
│     – skippable; unanswered gaps fall through to inference          │
│                          │                                          │
│            ┌─────────────┴──────────────┐                           │
│            ▼                            ▼                           │
│  Stage 3: Agent loop           Asset jobs (parallel)                │
│   (tool calls edit Scene)       – text-to-3D for 2–4 hero objects   │
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
│   – terrain, water, zones/platforms                                 │
│   – AMBIENCE LAYER: preset-driven sky, fog, lights, bloom, tone map │
│   – GROUND COVER: procedural grass + flowers (no models)            │
│   – LIFE: fireflies, butterflies, birds — motion against stillness  │
│   – library models + generated models (normalized, snapped)         │
│   – placeholders for pending assets                                 │
│   – question cards, camera fly-through, story notes, debug overlay  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key design decisions (and why)

1. **The agent never writes Three.js code.** It calls tools like `place_object` or `create_zone`, and each call edits a JSON `Scene`. The renderer only knows how to draw a `Scene`. This keeps the output valid, keeps the visuals consistent, and lets the world stream in live.
2. **The agent never writes visual parameters either.** It picks a named environment preset (`meadow`, `cave`, `cloud_kingdom`) and a time of day. B owns the table that turns those two words into sky colours, fog distances, exposure, bloom and light rig. This is the style bible: two agents building two zones physically cannot drift apart, and we can retune the entire look by editing one file without regenerating anything.
3. **The brief is light JSON with free-text descriptions.** It isn't a rigid schema. Its main job is to let us start the slow 3D generation jobs *before* the agent runs.
4. **Gaps are asked about, not guessed at.** When the story doesn't say what colour the dragon is, the system asks. This turns hallucination into interaction, makes the child a co-author, and gives us an honest answer to "how do you handle incomplete data."
5. **Most models come from a pre-made library; only 2–4 "hero" objects are generated.** Text-to-3D takes 30s–2min per model. Generating everything would make one world take 10+ minutes.
6. **Ground cover and creatures are procedural, not models.** Grass, flowers and fireflies are instanced primitives driven by parameters, not `.glb` files. They're what make a world feel alive, and they cost almost nothing in agent tokens.
7. **The server sends the full Scene every time, not partial updates.** Scenes are a few KB. Resending everything rules out bugs where updates arrive out of order or get applied to stale state.
8. **Same art style everywhere (stylized low-poly).** Library models are low-poly, every generation prompt asks for that style, and the ambience layer is global so everything sits under the same light.
9. **TypeScript on both sides**, with shared zod schemas in `shared/`. A contract change breaks both builds right away instead of failing quietly at demo time.

## 3. The split

**Person A = "Brain" (server):** story → gaps → questions → `Scene`.
**Person B = "World" (web):** `Scene` → pixels, plus the question UI.

> Fill in: **Person A:** ______ **Person B:** ______

| Area | Person A: Brain | Person B: World |
|---|---|---|
| Core job | Story → brief → clarify → agent → valid `Scene` | Render any valid `Scene` well |
| LLM work | Stage 1 & 2 prompts, gap detection and ranking, question slot-fill, agent loop, tool definitions and error handling | — |
| External APIs | Text-to-3D, skybox generation, caching, serving `.glb` files | — |
| 3D / visuals | — | Terrain, water, platforms, **ambience presets**, **ground cover**, **life**, scatter, loading and normalizing models, camera |
| Asset library | Reads `library.json` and gives the list to the agent | Picks and curates ~40–60 low-poly models, **writes `library.json`** |
| Server | HTTP API, event stream, storing worlds, answer endpoint | — |
| UI | — | Story input, **question cards**, stage progress, agent log panel, story notes, **debug overlay**, quality toggle |
| Shared | `shared/contract.ts`, `fixtures/` (both own; changes need the other's review) | same |

### Person A: detailed scope

- **Stage 1: compression.** Cheapest model. Skipped for short inputs. Output: plain text that keeps every mention of places, terrain, weather, time of day, buildings, notable objects and creatures, plus a one-paragraph plot.
- **Stage 2: World Brief + gaps.** Mid-tier model, JSON output. Internal to A, not part of the contract. Suggested shape:
  ```json
  {
    "title": "Jack and the Beanstalk",
    "mood": "whimsical, slightly ominous",
    "environmentPreset": "meadow",
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
    "ambientObjects": ["hay bales", "cow", "wooden fence", "cloud puffs"],
    "gaps": [
      { "id": "g1", "field": "castle.mood", "impact": 9, "question": "castle_feel" },
      { "id": "g2", "field": "farm.season", "impact": 4, "question": "time_of_year" }
    ]
  }
  ```
- **Gap detection and ranking.** The story will always underspecify. The job is not to list everything missing — it's to rank gaps by *visual impact* and ask about only the top few. The dragon's colour matters; the exact height of a wall does not. This ranking is a real decision the system makes and it's worth demoing.
- **Stage 2.5: Clarify.** A emits a `questions` event with 3–5 questions and then waits for `POST /api/worlds/:id/answers`. Rules:
  - **Questions are template + slot fill, never free-generated.** We have a fixed template set (`castle_feel`, `creature_color`, `time_of_year`, `forest_density`, …) and the model only chooses which templates apply and fills their slots. Cheaper, faster, consistent in tone, and it closes the hole where model output goes straight to a child unfiltered.
  - **Hard cap of 5**, target 3. A child abandons a long form.
  - **Every question offers a free-text escape hatch** (`allowFreeText: true`). Preserves authorship, and it's where the genuinely messy input comes from.
  - **Skippable.** If the client sends no answers within a timeout, or the child hits skip, unanswered gaps fall through to model inference and get marked `source: 'inferred'`.
  - Answers merge into the brief before the agent prompt is built.
- **Input safety.** Story text is content-filtered before it reaches any prompt. Free-text answers are filtered before they're merged. This is a children's product with an open text input — it does not go live without this.
- **Asset jobs.** Once the brief is ready (do **not** wait for clarify), start text-to-3D jobs for the `heroObjects` and a skybox job, all in parallel. Cache results by prompt hash. Each hero is added to `Scene.assets` right away with `status: 'pending'` and a `fallbackAssetId`, then updated to `ready` + `url` (or `failed`). Running these under the question loop is free latency — the child is busy answering while the slow jobs run.
- **Agent loop.** A tool-calling model builds the scene with the tools below. After every tool call: apply it to the Scene, validate against the zod schema, and send a `scene` event. An invalid call goes back to the agent as a tool error so it can fix it.

  | Tool | Effect on `Scene` |
  |---|---|
  | `set_terrain(biome, heightVariation, water?)` | sets `terrain` |
  | `set_environment(preset, timeOfDay, weather, fogDensity?)` | sets `environment` |
  | `create_zone(name, description, center, radius, elevation, platform?, storyNote?, source?)` | appends to `zones` |
  | `place_object(assetId, zoneId?, position, size, rotationY, snapToGround, label?, storyNote?, source?)` | appends to `objects` |
  | `scatter(assetIds, zoneId, count, sizeRange)` | appends to `scatters` |
  | `set_ground_cover(layers)` | sets `groundCover` |
  | `add_life(type, zoneId, count)` | appends to `life` |
  | `remove(id)` | removes a zone, object, scatter or life entry |
  | `describe_scene()` | returns a text summary so the agent can check its own work |
  | `finish()` | ends the loop, sends `stage: done` |

  The agent's system prompt includes: the brief with merged answers, the library list (IDs, tags, descriptions, default sizes), the IDs of pending hero assets, the environment preset names, and the world conventions from §4.1. It should think in **zones and relative placement**. Code handles exact placement (e.g. `snapToGround`).
- **Provenance.** Every zone and object carries `source: 'stated' | 'asked' | 'inferred'` — did the story say this, did the child choose it, or did we fill it in? The agent sets it. B uses it for the debug overlay. It costs one enum per tool call and it is the difference between "we hallucinate a world" and "we can show you exactly what came from where."
- **Budget:** cap the agent at ~40 tool calls. Aim for world done in under 90s, excluding hero asset generation.

### Person B: detailed scope

- **Renderer** for every field in `Scene`, with each piece a component: `<Terrain>`, `<Water>`, `<Ambience>`, `<ZonePlatform>`, `<SceneObject>`, `<Scatter>`, `<GroundCover>`, `<Life>`.
- **Ambience layer (`<Ambience>`).** The single biggest lever on whether this looks intentional. Driven entirely by `environment.preset` + `environment.timeOfDay`, merged as **base + place + time**:
  - `base` — never varies. `ACESFilmicToneMapping`, exposure ~1.0–1.3, `PCFSoftShadowMap` at low resolution (1024 or 512 — soft mushy shadows suit the style and run faster), bloom pass settings, vignette.
  - `place` — palette and density per preset (`meadow`, `deep_forest`, `cloud_kingdom`, `cave`, `seaside`, `village`).
  - `time` — palette shift and sun angle per `timeOfDay`.

  Contents, in build order (each stage stands alone, so we can stop anywhere and still look finished):
  1. **Tone mapping + exposure.** Highest impact per line in the whole project. Without it, flat-shaded colour looks like plastic.
  2. **Gradient sky dome.** Large inverted sphere, two-colour vertical gradient shader, `BackSide`. Not a skybox texture. Overridden when a generated skybox arrives.
  3. **Fog matched to the sky's horizon colour.** Linear `THREE.Fog`. If fog colour ≠ sky bottom colour, objects look cut out against the horizon — both come from the same preset so this is free.
  4. **Two-light rig.** One `HemisphereLight` (sky above, ground bounce below) for soft fill, one warm `DirectionalLight` at a low angle for long shadows. Two lights is the look — resist adding more.
  5. **Selective bloom.** `UnrealBloomPass` with a **high** threshold so only genuinely emissive things glow. Low threshold washes everything out; this is the most common way the look fails.
  6. **Drifting motes.** A few hundred `Points`, soft radial sprite, slow layered drift.
  7. **Foliage wind.** Vertex wobble via `onBeforeCompile`, amplitude weighted by vertex height so trunks stay planted. First thing to cut under time pressure.

  Every numeric value lives in the preset object. **No numeric literals in rendering code** — otherwise the tuning pass becomes archaeology. Build a `lil-gui` panel over the preset fields early; tuning is done by eye and a slider beats edit-rebuild-look by a wide margin.

- **Ground cover (`<GroundCover>`).** Sparse stylized meadow, Sky: CotL reference. Two instanced systems, no models:
  - **Grass:** `InstancedMesh`, one tapered quad blade with 3–4 vertical segments. Density deliberately sparse — ~8–15 blades per square unit with **visible gaps**. Height 0.15–0.3 units. Per-blade vertical gradient where the base is slightly darker than the terrain and the tip is *significantly lighter* — pale, desaturated, approaching off-white. Alpha fades toward the tip. Random yaw and slight lean. Gentle height-weighted wind. Scale and alpha ramp to zero between ~25 and ~40 units so the density boundary never shows as a ring.
  - **Flowers:** separate `InstancedMesh` of camera-facing circular quads with soft radial alpha falloff (no hard edge). Slightly emissive, tuned *just above* the bloom threshold so they catch a faint glow — derive emissive intensity from colour luminance, don't hardcode it, or a pale blue flower will look radioactive. Diameter 0.08–0.15. Placed by noise so they form **drifts with genuinely empty ground between**, not a uniform sprinkle.
  - Two flower layers at different colours, densities and cluster scales beats one — a dominant yellow with a sparse second colour threaded through is what makes a meadow read well.
  - Per-instance colour attribute gives subtle hue variation within a layer for free, still one draw call.
  - Known failure mode: it will come out too dense and too saturated. Pull back further than feels right.

- **Life (`<Life>`).** Motion reads as life only against stillness — if everything moves, nothing stands out. Three tiers:
  - *Ambient* — the motes, always on, barely visible.
  - *Creatures* — **fireflies** (`Points`, additive, emissive above bloom threshold; flicker period must differ from drift period or the loop is visible within seconds) and **butterflies** (`InstancedMesh`, two hinged quads, wings flapping in the vertex shader; the flight path must **bob** with each flap and turn in sharp jinks — bobbing sells it more than the mesh does).
  - *Rare events* — a bird crossing every ~40s. Polish only.
  - Counts are far lower than instinct says: ~20 fireflies in view, 3–4 butterflies. Two hundred is a screensaver.
  - No motion on a clean sine loop. Layer at least two frequencies that don't divide evenly, random phase per instance.

- **Quality tiers.** A three-level setting (`low` / `medium` / `high`) wired in from the start, not retrofitted. Scales bloom resolution, mote and creature counts, grass density and fade distance, shadow map size. On `low`, drop secondary flower layers entirely rather than thinning everything — losing one colour is less visible than a sparse meadow. We do not know what machine we're demoing on; test on the worst laptop the team owns.

- **Model normalization (B owns this, A never deals with it):** after loading a `.glb`, compute its bounding box, scale it so its **height = `size`**, and move its origin to bottom-center. If `snapToGround`, raycast down to the terrain (or to the zone platform when the zone's `elevation > 0`).
- **Terrain:** noise heightmap from `seed` and `heightVariation`, coloured by biome and by the environment preset palette. Flatten slightly near zone centers so buildings sit well. Must look acceptable with zero ground cover on it.
- **Scatter:** deterministic random placement inside the zone circle using `seed`, avoiding objects and zone centers. Instanced meshes.
- **Pending assets:** render `fallbackAssetId` (or a pulsing placeholder) until `status: 'ready'`, then swap in the real model. On `failed`, keep the fallback.
- **Reconcile by ID:** on each new `scene` event, diff by `id`, keep existing meshes and add or remove only what changed. The world should grow smoothly without flicker.
- **Camera:** orbit controls, plus an automatic fly-through that visits each zone in order, including the sky zones.
- **UI:**
  - Story textarea + "Build" button
  - **Question cards** for stage 2.5: one question at a time, large tap targets, **colour swatches and rendered thumbnails rather than text buttons** wherever the question allows it, plus a free-text field behind "something else", and a visible skip.
  - Stage indicator (`compress → brief → clarify → build → assets → done`)
  - Scrolling agent log; click an object or zone for its `storyNote`
  - **Debug overlay** (see below)
  - Quality toggle
- **Debug overlay.** A hidden key press that overlays what the machine did: which zones and objects were `stated` / `asked` / `inferred` (colour-coded), the gaps that were detected and which made the cut, the agent's tool call sequence, and any tool errors it recovered from. The child sees magic; the judge sees the machine. Our whole product thesis is that the machinery is invisible, which is correct for a seven-year-old and dangerous at a judging table where technical complexity is an explicit criterion. This is how we get credit for both.
- **Asset library:** ~40–60 CC0 low-poly models (Quaternius, Kenney, Poly Pizza). Cover trees, rocks, bushes, houses, cottages, castles, towers, fences, wells, bridges, farm animals, clouds, boats, carts, and a few characters. **Grass and flowers are NOT library models** — they're procedural. Write `library.json` (see §4.3).

## 4. The contract

Everything in this section lives in `shared/contract.ts` as zod schemas, with TS types derived from them. **This is the only thing both halves depend on.**

### 4.1 World conventions

- **Y-up. 1 unit = 1 meter. A child is 1.6 units tall.** The world is a square `bounds.size` wide (default 200), centered on the origin. Scale discipline matters more than it looks: fog distances, mote spawn volume, grass height and shadow frustum are all in world units, so a cottage built at 3 units and another at 30 will look completely different under the same preset.
- Ground zones have `elevation: 0`. Sky zones use `elevation ≥ 60` and must set `platform` (`'cloud'` or `'rock'`), which B renders as a floating platform with radius `zone.radius`.
- `size` = **target height in meters** of the object after normalization.
- `rotationY` is in **degrees**.
- `snapToGround: true` → B ignores `position[1]` and places the object on the terrain, or on the platform of its zone if that zone is elevated.
- Every `assetId` used anywhere must be a key in `Scene.assets`, and every library asset ID must exist in `library.json`.
- `environment.preset` must be one of the fixed preset names. The agent may **not** emit raw colours — the preset table owns the palette.
- IDs are unique across `zones`, `objects`, `scatters` and `life`, and **never reused** within a world. B relies on them to update the scene without redrawing it.

### 4.2 Scene

```ts
export type Vec3 = [number, number, number];
export type Source = 'stated' | 'asked' | 'inferred';

export type EnvironmentPreset =
  | 'meadow' | 'deep_forest' | 'cloud_kingdom'
  | 'cave' | 'seaside' | 'village';

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
    preset: EnvironmentPreset;        // B's table owns all colour and lighting
    timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
    weather: 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog';
    fogDensity?: number;              // 0–1, optional override of the preset
    skybox?: { status: 'pending' | 'ready' | 'failed'; url?: string };
  };
  zones: Zone[];
  objects: SceneObject[];
  scatters: Scatter[];
  groundCover: GroundCoverLayer[];
  life: LifeSpawn[];
  assets: Record<string, AssetRef>;
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
  source?: Source;
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
  source?: Source;
}

export interface Scatter {
  id: string;
  assetIds: string[];
  zoneId: string;
  count: number;
  seed: number;
  sizeRange: [number, number];
}

// Procedural ground cover — no models involved.
export interface GroundCoverLayer {
  id: string;
  type: 'grass' | 'flower' | 'reed' | 'mushroom' | 'pebble';
  color: string;                      // hex
  density: number;                    // 0–1, relative to the preset's base density
  clusterScale?: number;              // higher = larger, more separated drifts
  zoneIds?: string[];                 // omitted = whole world
}

// Creatures. Motion against stillness.
export interface LifeSpawn {
  id: string;
  type: 'fireflies' | 'butterflies';
  zoneId: string;
  count: number;                      // B clamps to sane per-type maxima
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

### 4.3 Questions and answers

```ts
export interface Question {
  id: string;
  gapId: string;
  templateId: string;                 // from the fixed template set
  prompt: string;                     // slot-filled, never free-generated
  kind: 'choice' | 'color';
  options: Array<{
    id: string;
    label: string;
    swatch?: string;                  // hex — B renders a colour chip
    previewAssetId?: string;          // B renders a thumbnail from the library
  }>;
  allowFreeText: boolean;
}

export interface Answer {
  questionId: string;
  optionId?: string;
  text?: string;                      // when the child used the escape hatch
}
```

Rules: at most 5 questions per world, `options` is 2–4 entries, and A must be able to build a world from zero answers.

### 4.4 Asset library list

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

### 4.5 HTTP API

| Method & path | Request | Response |
|---|---|---|
| `POST /api/worlds` | `{ story: string }` | `{ worldId: string }` |
| `POST /api/worlds/:id/answers` | `{ answers: Answer[] }` | `{ ok: true }` |
| `GET /api/worlds/:id` | — | latest `Scene` |
| `GET /api/worlds/:id/events` | — | server-sent event stream of `WorldEvent` |
| `GET /generated/:file` | — | generated `.glb` / skybox image (served by A) |

`POST /answers` with an empty array means "skip" and unblocks the agent immediately. A also unblocks on a timeout so a closed tab never strands a world.

The web app talks to the server through a Vite dev proxy (`/api`, `/generated` → server port), so there are no cross-origin (CORS) problems.

### 4.6 Events

```ts
export type WorldEvent =
  | { type: 'stage'; stage: 'compress' | 'brief' | 'clarify' | 'build' | 'assets' | 'done' }
  | { type: 'questions'; questions: Question[] }
  | { type: 'scene'; scene: Scene }   // always the FULL scene
  | { type: 'log'; text: string; tool?: string; rationale?: string }
  | { type: 'error'; message: string };
```

- A sends a `scene` event after every successful tool call and every asset status change.
- A sends `questions` once, then waits. B renders the cards and posts answers back.
- `log.tool` and `log.rationale` are what the debug overlay reads. Filling `rationale` is optional but it's most of what makes the overlay worth showing.
- When the event stream connects, A first sends the current stage, any outstanding questions, and the latest `scene`, so reconnecting or refreshing the page works mid-question.
- B treats the **latest** `scene` as the truth and just redraws from it.

### 4.7 Validation

- A validates every Scene with `SceneSchema.parse` **before** sending it. Invalid scenes never reach the wire.
- B checks incoming events with `WorldEventSchema.safeParse`. If one fails, log it and keep showing the last good scene.
- `shared/` includes a `validateSceneRefs(scene)` helper that checks every rule the types can't express: asset IDs exist, zone IDs exist, `platform` is set when elevation > 0, `url` is set when an asset is ready, `life[].zoneId` and `groundCover[].zoneIds` resolve.

## 5. Repo layout

```
shared/
  contract.ts          zod schemas + inferred types + validateSceneRefs
fixtures/
  jack.scene.json      hand-written complete Jack & the Beanstalk scene
  jack.questions.json  sample question set for B's card UI
  mock-server.ts       replays the fixture as an event stream (for B)
server/                Person A
  src/pipeline/        compress.ts, brief.ts, gaps.ts, questions.ts
  src/agent/           loop.ts, tools.ts, prompts.ts
  src/assets/          text-to-3D + skybox clients, cache
  src/safety/          input filtering
  src/api.ts           HTTP + event stream
web/                   Person B
  public/assets/library/   *.glb + library.json
  src/scene/           Terrain, Ambience, ZonePlatform, SceneObject,
                       Scatter, GroundCover, Life
  src/scene/presets.ts base + place + time preset table (the style bible)
  src/ui/              StoryInput, QuestionCard, StageBar, AgentLog,
                       StoryNote, DebugOverlay, QualityToggle
ARCHITECTURE.md        this file
```

Suggested stack: **server:** Node + TypeScript (Hono or Express), **web:** Vite + React + React Three Fiber + drei, **shared:** zod. Use a pnpm workspace so `server` and `web` both import `shared`.

**Pin the Three.js version on day one.** The `examples/jsm` post-processing API has moved between versions and `EffectComposer` is load-bearing for us. Do not upgrade mid-hackathon.

## 6. Working in parallel

The key is `fixtures/jack.scene.json`. Once it exists, neither of us waits on the other.

**Person B works against the fixture:**
- `mock-server.ts` serves the same API as the real server and sends the fixture **piece by piece**: terrain, then environment, then questions (waits for the answer POST), then each zone, then objects, ground cover, life and scatters one at a time, about 300ms apart. The hero asset starts `pending` and flips to `ready` after ~5s. This covers the question loop, smooth incremental updates, placeholders and asset swaps before the real backend exists.
- Switching from mock to real server is a single env var: `VITE_API_URL`.

**Person A works against the schema:**
- "Done" for any pipeline change = the output passes `SceneSchema` + `validateSceneRefs`.
- A can save any generated Scene to `fixtures/` and load it in B's renderer to see it, even before the event stream is wired up.
- Keep a few test stories (`fixtures/stories/*.txt`): Jack and the Beanstalk, Little Red Riding Hood, The Three Little Pigs, **at least two genuinely underspecified kid-written stories** (three sentences, contradictory, bad spelling — these are the ones that exercise gap detection), and one long story to exercise stage 1.

## 7. Timeline & merge checkpoints

Times are hackathon hours from kickoff. Adjust as needed.

| When | Person A | Person B | Merge checkpoint |
|---|---|---|---|
| **H0–2** | **Together:** agree on `shared/contract.ts`, hand-write `jack.scene.json` + `jack.questions.json`, set up the workspace, pin Three.js | | Contract frozen at `version: 1` |
| H2–8 | Stage 2 brief + gap detection + agent loop with tools; outputs valid Scenes to files | Ambience preset table + `lil-gui` panel FIRST, then terrain, zones, library objects, scatter | **CP1 (~H8):** A's output files render correctly, and the meadow preset already looks right |
| H8–14 | HTTP API + event stream; question templates + answer endpoint; stage 1; input filtering | Mock-server streaming, updating by ID, ground cover, question cards, stage bar, log | **CP2 (~H14):** real end-to-end: story → questions → watch world build live |
| H14–22 | Text-to-3D + skybox jobs, caching, fallbacks; provenance on every tool call | Life (fireflies then butterflies), pending → ready swaps, skybox, camera fly-through, story notes | **CP3 (~H22):** generated hero models + sky appear live, world feels alive |
| H22–30 | Prompt quality across all test stories, gap ranking tuning, speed, error handling | Debug overlay, quality tiers, visual tuning pass by eye, performance on the worst laptop | **CP4:** full run on all test stories, bugs listed and assigned |
| H30–end | **Together:** fix bugs, warm the asset cache for demo stories, rehearse demo, record a backup video | | Demo-ready |

**At each checkpoint:** both merge to `main`, run the full flow on at least two stories, then write down anything that doesn't fit the contract. Fix it by changing the contract (with review), not by working around it in one half.

**Ordering note:** the pretty part will come together faster than expected — the models are good at Three.js. The clarify loop, gap ranking and orchestration will take longer than expected. Build the unimpressive middle layer first and let the visuals land late; the visuals are also the part a coding agent can sprint through.

## 8. Rules for changing the contract

1. Any PR that touches `shared/` or `library.json` IDs needs the other person's review.
2. Adding an optional field is fine anytime. B's renderer must ignore fields it doesn't know yet.
3. Renaming, removing, or making a field required is a **breaking change**: agree in chat first, bump `version`, and update `jack.scene.json` and this doc in the same PR.
4. Adding a value to `EnvironmentPreset`, `GroundCoverLayer['type']` or `LifeSpawn['type']` is a **breaking change in practice** even though it type-checks — B must ship the renderer for it before A emits it. Say so in chat.
5. If you're blocked on the other half, add what you need to the fixture and keep going. Don't wait.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Text-to-3D is slow or fails | Only 2–4 hero objects; library fallbacks; cache by prompt; pre-generate assets for demo stories; asset jobs run under the question loop so the wait is hidden |
| **Generated heroes don't match the library's art style** | This is more visible than it sounds — the hero is what the camera flies to. Generate only silhouette-simple shapes (beanstalk, castle) where mismatch is least legible; pre-generate demo heroes early and judge the real output on day one rather than hoping |
| Generated models are wrong size or orientation | B normalizes by bounding box; `size` is always target height |
| Mixed art styles look bad | Low-poly library only; style keywords in every generation prompt; global ambience layer puts everything under the same light |
| **Parallel/agent visual drift** | The agent cannot emit colours or numbers — only preset names. The style bible is enforced by the contract, not by prompting |
| LLM places things badly | Agent works in zones + relative positions; `snapToGround`; `describe_scene` for self-checking |
| Agent sends invalid tool calls | zod validation after each call; errors returned as tool results; call cap |
| Agent too slow for a live demo | Tool-call cap; stream progress so the wait is part of the show; cached demo worlds |
| **Framerate dies on the demo laptop** | Quality tiers wired in from H2, not retrofitted; bloom, grass and creatures are the first things scaled down; test on the team's worst machine |
| **A child abandons the question loop** | Hard cap of 5, target 3; thumbnails and swatches not text; visible skip; A builds fine from zero answers |
| **Unsafe text reaching a child** | Questions are template + slot fill, never free-generated; story and free-text answers filtered before any prompt |
| **"This is just a wrapper"** | Take an unseen story live at the demo; lead with the question loop rather than a beauty shot; run a deliberately three-sentence story to show gap detection working; debug overlay on request |
| Contract drift between halves | Shared zod types, fixture-driven dev, merge checkpoints |

## 10. Open questions

- [ ] **Agent model:** which model runs the agent loop? It needs reliable tool calling. Hide it behind an interface so we can swap it.
- [ ] **Models for stages 1 & 2:** which cheap and mid-tier models? Gap ranking is the one place worth spending on a stronger model.
- [ ] **Text-to-3D provider:** Meshy, Tripo or Rodin? Pick by speed, price, and whether they offer free hackathon credits.
- [ ] **Skybox provider:** Blockade Labs Skybox AI, or generate an equirectangular image with an image model? Note the gradient sky dome is good enough to ship without this.
- [ ] **Demo mode:** a fly-through to watch only, or a walkable world? Walkable adds collision and player controls, which falls to Person B.
- [ ] **Question templates:** how many do we need for reasonable coverage? Guess is 10–15. Written by whom, and when?
- [ ] **Asset library size vs. semantic search:** at 40–60 models, A prompt-stuffs the whole `library.json` and there's no room for retrieval. If we want to make a search-based sponsor track honest, the library needs to be several hundred models and B's curation workload goes up a lot. Decide early — it changes B's H2–8.
- [ ] **Sponsor APIs** we want to target for prizes.