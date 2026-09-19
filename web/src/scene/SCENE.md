# Writing a `Scene`

The renderer draws exactly what the scene JSON says. This is the reference for producing one: every field, what it may contain, and what the renderer does with it. The schema itself is `shared/contract.ts` (zod) — it is the source of truth; this document explains it. Reference scenes: `fixtures/jack.scene.json`, `fixtures/oasis.scene.json`.

Two rules before the wire: `SceneSchema.parse(scene)` must pass and `validateSceneRefs(scene, libraryIds)` must return `[]`.

## Units and axes

- Distances are **metres**. `y` is up. `x` runs left→right, `z` runs back→front (the camera starts at +z looking toward −z, so **negative z is "behind", positive z is "in front"**).
- Angles are **degrees**.
- The world is the square `[-size/2, size/2]` in x and z. Beyond it the land falls away into the sea (if `terrain.water` is set) or drops off into fog. Put everything inside.
- IDs are free strings, unique across zones + objects + scatters within a scene, and **never reused** for something else once sent (the renderer reconciles by id).

## Top level

```jsonc
{
  "version": 1,                 // literal 1
  "id": "jack",                 // scene id, used as React key: change it and the whole world remounts
  "title": "Jack and the Beanstalk",
  "bounds": { ... },
  "terrain": { ... },
  "environment": { ... },
  "zones": [ ... ],
  "objects": [ ... ],
  "scatters": [ ... ],
  "assets": { ... }
}
```

## `bounds`

| field | type | meaning |
|---|---|---|
| `size` | number > 0 | side of the world square, metres. 200 = a village; 400 = a landscape. Terrain, sea, fog horizon, shadow area and camera distance all scale with it. |
| `skyHeight` | number > 0 | ceiling for elevated content (reserved for weather clouds). Keep elevated zones below it. |

## `terrain`

| field | type | meaning |
|---|---|---|
| `biome` | `grassland` `forest` `desert` `snow` `swamp` `beach` | base ground colour (blended 60 % with `palette[1]`) |
| `heightVariation` | 0–1 | hilliness. Peaks reach about ±`25 × heightVariation` m. 0 = flat; 0.3 = gentle rolling; 0.6 = hills. |
| `seed` | number | any number; same seed = same hills |
| `water` | `{ "level": number }` optional | a flat sea/lake plane at this height. Anything lower is under water. With `heightVariation 0.3`, `level: -3` gives a few ponds, `level: 0` floods half the map. Omit for no water. |

Ground zones flatten the terrain toward the height at their centre, so buildings sit well.

## `environment`

| field | type | meaning |
|---|---|---|
| `timeOfDay` | `dawn` `day` `dusk` `night` | sun position, colour and strength. `dawn`/`dusk` = low warm sun, long shadows, the showcase look. `day` = high bright sun. `night` = dim blue moonlight. |
| `weather` | `clear` `cloudy` `rain` `snow` `fog` | `fog` thickens the haze. The others are accepted but not drawn yet. |
| `fogDensity` | 0–1 | haze. 0.15 = crisp, 0.3 = soft distance, 0.6 = things 100 m away start disappearing. |
| `palette` | `[sky, ground, accent]` — three hex strings, **required** | every colour in the world derives from it: `[0]` horizon, fog and sky band; `[1]` tints the terrain and the ground bounce light; `[2]` zenith and water. The renderer never invents colours — this is the main lever over how a world *feels*. |
| `skybox` | `{ status: pending\|ready\|failed, url? }` optional | a generated equirectangular sky image. Reserved: not drawn yet; the gradient sky is used regardless. |

Palette guidance: sunny fairy tale `["#d6ecff", "#8ed072", "#6ea8f5"]`; golden dawn `["#ffc7a0", "#8ccf66", "#9db8ea"]`; desert night `["#5b6a9c", "#d9b984", "#2d3a6b"]`. Keep `[1]` close to what the biome would naturally be — it is the ground.

## `zones[]`

A zone is a circular area of the world that means something in the story.

| field | type | meaning |
|---|---|---|
| `id` | string | unique |
| `name` | string | shown to the user on click |
| `description` | string | for the agent's own bookkeeping; not rendered |
| `center` | `[x, z]` | metres |
| `radius` | number > 0 | metres. 25–45 is a good size in a 200 m world. |
| `elevation` | number ≥ 0 | 0 = on the ground. > 0 = a floating platform whose top surface is at this height; everything placed in the zone snaps to it. |
| `platform` | `cloud` \| `rock` | **required when `elevation > 0`**. `cloud` = a bank of cloud puffs; `rock` = a stone disc. |
| `storyNote` | string optional | one or two sentences shown when the user clicks the zone |

Rendering: ground zones get a faint ring on the terrain and flatten it. Elevated zones get their platform; objects and scatters assigned to them sit on top. Zones may overlap; keep elevated zones' footprints clear of tall ground objects unless you want them poking through.

## `objects[]`

Individual placed models — the things the story is about.

| field | type | meaning |
|---|---|---|
| `id` | string | unique |
| `assetId` | string | key into `assets` |
| `zoneId` | string optional | which zone it belongs to. Determines the platform it snaps to and which scatters avoid it. Omit for free-standing objects. |
| `position` | `[x, y, z]` | metres. `y` is ignored when `snapToGround` is true. |
| `snapToGround` | boolean | `true` = stand on the terrain (or on the zone's platform). `false` = use `y` exactly — floating things. |
| `rotationY` | degrees | turn about the vertical axis |
| `size` | number > 0 | **height in metres**. Models are normalised so their bounding box is exactly this tall, origin at the bottom centre. Use the library's `defaultSize` unless the story says otherwise. |
| `label` | string optional | shown on click |
| `storyNote` | string optional | shown on click; objects without one aren't clickable |

## `scatters[]`

Many copies of small things filling a zone — trees, rocks, bushes, cloud puffs. Drawn instanced, so counts of 20–60 per scatter are cheap.

| field | type | meaning |
|---|---|---|
| `id` | string | unique |
| `assetIds` | string[] (≥ 1) | drawn from at random per copy. Repeat an id to weight it: `["pine_tree", "pine_tree", "oak_tree"]` = 2:1. |
| `zoneId` | string | the zone to fill. Copies land uniformly inside its circle, never within 3 m of the centre, and never on a placed object of that zone (object's `size/2 + 1.5 m`). |
| `count` | integer ≥ 1 | how many to try to place |
| `seed` | number | same seed = same layout, every load |
| `sizeRange` | `[min, max]` both > 0 | height of each copy, metres, uniform random |

## `assets`

A map from asset id to where its model comes from. Every `assetId` in `objects` and `scatters` must be a key here.

**Library asset** — a file that ships with the renderer:

```json
"oak_tree": { "id": "oak_tree", "source": "library" }
```

The id must exist in `web/public/assets/library/library.json`. Current library:

| id | defaultSize (m) | description | tags |
|---|---|---|---|
| `oak_tree` | 8 | large leafy oak tree | tree, forest, nature |
| `pine_tree` | 10 | tall conifer pine tree | tree, forest, nature |
| `bush` | 1.5 | round green bush | bush, nature |
| `rock` | 1 | grey boulder | rock, nature |
| `cloud_puff` | 5 | fluffy low-poly cloud | sky, cloud, nature |
| `beanstalk` | 60 | enormous twisting green beanstalk with big leaves | plant, fantasy, giant |
| `cottage` | 6 | small cottage with a red tile roof | building, house, farm |
| `fence` | 1.2 | wooden fence segment | farm, prop |
| `cow` | 1.5 | black and white farm cow | animal, farm |
| `hay_bale` | 1.2 | bundle of hay | farm, prop |
| `castle` | 25 | stone castle with towers and a keep | building, castle, fantasy |

**Generated asset** — a hero model made by text-to-3D on the server:

```json
"giant_castle": {
  "id": "giant_castle",
  "source": "generated",
  "prompt": "huge grey stone castle on clouds, stylized low-poly",
  "status": "pending",
  "fallbackAssetId": "castle"
}
```

| field | meaning |
|---|---|
| `prompt` | what was asked of the generator |
| `status` | `pending` → the fallback is drawn. `ready` → `url` is loaded and swapped in place. `failed` → the fallback stays. |
| `url` | required when `ready`; `/generated/...` served by the server |
| `fallbackAssetId` | a **library** id drawn until the model is ready, or forever if it fails or the url doesn't load |

Use the library for anything it covers. Generate only for the 2–4 objects the story can't do without and the library can't stand in for.

## Validation (`validateSceneRefs`)

Beyond types, these must hold or the scene is rejected:

- ids unique across `zones` + `objects` + `scatters`
- `elevation > 0` ⇒ `platform` set
- every `objects[].assetId` and `scatters[].assetIds[]` exists in `assets`
- every `objects[].zoneId` and `scatters[].zoneId` exists in `zones`
- every library asset id exists in `library.json`
- generated `ready` ⇒ has `url`; `fallbackAssetId` is a library asset

## What the renderer decides for you

- **Camera.** Framed automatically from the zones: it sits at +z of their centroid, looking slightly up if any zone is elevated. For the best first view put ground zones toward +z (front) and elevated ones toward −z (back). The user can orbit freely afterwards.
- **Shadows** come from the sun; things on elevated platforms don't cast them onto the ground.
- **Everything else** is in `presets.ts`: how "dawn" looks, fog curve, bloom, model shapes. Those are the same for every scene — the scene controls *what* and *where*, the renderer controls *how it's drawn*.

## Streaming

The server sends the **full** scene after every change, not a diff. The renderer keeps unchanged ids mounted and only adds/removes what changed, so a world can grow one zone at a time without flicker. Send the terrain and environment first, then zones, then objects, then scatters; flip assets to `ready` whenever they finish.

## Minimal valid scene

```json
{
  "version": 1, "id": "s1", "title": "A field",
  "bounds": { "size": 200, "skyHeight": 100 },
  "terrain": { "biome": "grassland", "heightVariation": 0.3, "seed": 1 },
  "environment": { "timeOfDay": "day", "weather": "clear", "fogDensity": 0.25, "palette": ["#d6ecff", "#8ed072", "#6ea8f5"] },
  "zones": [{ "id": "z1", "name": "The field", "description": "open meadow", "center": [0, 0], "radius": 40, "elevation": 0 }],
  "objects": [{ "id": "o1", "assetId": "cottage", "zoneId": "z1", "position": [0, 0, 0], "snapToGround": true, "rotationY": 20, "size": 6 }],
  "scatters": [{ "id": "s1", "assetIds": ["oak_tree", "bush"], "zoneId": "z1", "count": 20, "seed": 2, "sizeRange": [3, 8] }],
  "assets": {
    "cottage": { "id": "cottage", "source": "library" },
    "oak_tree": { "id": "oak_tree", "source": "library" },
    "bush": { "id": "bush", "source": "library" }
  }
}
```

Drop a new scene at `fixtures/<name>.scene.json` and open `/dev?scene=<name>` to see it. `npm test` validates every fixture.
