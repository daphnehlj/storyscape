# How the renderer works

`web/src/scene/` turns a `Scene` (see `shared/contract.ts`, and `SCENE.md` for how to write one) into a three.js world. ~900 lines across 15 files. This document is the tour: what each file does, how they fit, and the decisions behind them. `../README.md` covers mounting `<World>`; this covers what's inside it.

## The one rule

**The renderer is a pure function of the scene.** It reads the JSON and `library.json`, nothing else. No story knowledge, no per-scene branches, no runtime-generated models, no invented colours. Every number that affects the look lives in `presets.ts`. If a scene looks wrong, the fix is in the scene JSON unless the problem would affect *every* scene — then it's a renderer fix.

## Data flow

```
Scene JSON ──SceneSchema.parse──▶ <World scene>
                                     │
            ┌────────────────────────┼─────────────────────────┐
            ▼                        ▼                         ▼
      environment/bounds        terrain/zones            zones/objects/scatters
      Environment, Weather      Terrain, Water           ZonePlatform, SceneObject, Scatter
      (light, fog, sky,         (mesh from heightAt)     (models from library.json,
       clouds, rain, snow)                                placed with groundY)
                                     │
                                  Effects (bloom → tone map → saturation → vignette)
```

One component per scene field. Each reads its slice of the scene and nothing else. Everything is keyed by `id`, so when a new scene arrives (the server streams the full scene after every change), React keeps what's unchanged mounted and only adds/removes the difference — the world grows without flicker.

## Files

### `World.tsx` — the entry point

`<World scene onSelect? fly? onUserOrbit? />`. Creates the `<Canvas>` (`flat`, so the post-processing pass owns tone mapping; `shadows="variance"` for soft shadows), computes the initial camera framing once from the zones (`camera-math.ts`) and never touches the camera again, then renders the components below. Each zone/object/scatter gets its own `<Suspense>` boundary — a model that's still loading suspends only itself, never the whole world.

### `presets.ts` — every tunable

`CAMERA` (fov, framing distances), `POST` (bloom/vignette/saturation), `TERRAIN` (noise), `BIOME_COLOR`, `TERRAIN_MESH` (resolution, island edge, colour ramp), `WATER`, `SUN` (per time of day: direction, colour, intensity, ambient), `ATMOSPHERE` (fog curve, sky dome, sun disc, sparkles, skybox), `FLY`, `WEATHER`, `ZONE` (ring, rock, cloud platform), `SCATTER` (clearances). Components import from here; `presets.test.ts` checks every enum value in the contract has an entry.

### `terrain-math.ts` — the ground

`heightAt(x, z, terrain, zones)`: 2D value noise, four octaves of fBm, seeded by `terrain.seed`, scaled by `heightVariation × 25 m`. Ground zones flatten the terrain toward the height at their centre with a smooth falloff, so buildings sit flat. `groundY(...)` is what objects snap to: the zone's `elevation` if it's a platform, else `heightAt`.

This is the *only* source of ground height. The terrain mesh displaces its vertices with it, objects snap with it, scatters place with it. Nothing raycasts, so nothing can float or sink.

### `Terrain.tsx` / `Water.tsx`

A `PlaneGeometry` four times `bounds.size` wide (so its edge is out in the fog), every vertex displaced by `heightAt`. Past `bounds` the land falls away into the sea along a rounded-square coastline roughened by the same noise — the world is an island, which killed the "flat square floating in space" look. Vertex colours: biome colour blended with `palette[1]`, darker in valleys, tinted toward the sky colour on peaks. Smooth-shaded; the low-poly look comes from the models.

Water is one big transparent plane at `terrain.water.level`, coloured by `palette[2]`, sized past the fog horizon.

### `Environment.tsx` — light and sky

`paletteOf(env)` reads `[sky, ground, accent]`. `atmosphere(env)` derives horizon, zenith and fog colours from it. Then:

- **sun**: a directional light from `SUN[timeOfDay]`, casting shadows over the whole `bounds`
- **hemisphere fill**: zenith colour above, ground colour below
- **exp² fog** in the horizon colour, density from `fogDensity` (+ extra for `weather: 'fog'`)
- **sky**: a gradient dome (zenith → horizon band → zenith) — or, when `skybox.status === 'ready'`, drei's `Environment` with the panorama as background and image-based lighting
- **sun disc**: an over-bright sphere in the sun's direction so bloom gives it a halo
- **sparkles**: drifting light motes

### `Weather.tsx` / `Precipitation.tsx`

`cloudy` / `rain` / `snow` add a ring of `cloud_puff` instances at `bounds.skyHeight`. `snow` adds falling points with a sideways sway; `rain` adds short vertical line streaks. Particles are world-fixed: each keeps its own position and falls; when one leaves the 90 × 50 m region around the camera it's shifted to the far side, so the field is endless without ever moving with the camera. Positions update in place every frame — no allocation in the loop.

### `ZonePlatform.tsx`

Ground zone → a faint ring on the terrain (also the click target). `elevation > 0` with `platform: 'rock'` → a stone cylinder whose top is at `elevation`. `'cloud'` → a bank of `cloud_puff` instances seeded from the zone id, tops just above `elevation` so objects nestle in. Falls back to the rock disc if the library has no cloud model. Platforms cast no shadows: a shape 50 m up would stamp a black blob on the ground.

### `assets.ts` — models

`useLibrary()` fetches `library.json` once. `assetUrl(id, assets, lib)` resolves an asset to a URL: a library file, or for a `generated` asset its `url` when `ready` and otherwise its fallback's file. `useNormalizedModel(url, size)` loads the `.glb` (cached per URL by drei), clones it, scales its bounding-box height to `size`, moves the origin to bottom-centre, and sets shadow flags — so authors never need to know a model's native scale or origin.

### `SceneObject.tsx`

One placed model: resolves the URL, snaps to `groundY`, applies `rotationY`, wires `onClick` → `onSelect`. While a generated model loads, its fallback is shown in its place; if the load fails (404, bad file) an error boundary keeps the fallback instead of leaving a hole. Objects on elevated zones don't cast or receive shadows (with variance shadow maps, receivers are drawn into the map too).

### `scatter-math.ts` / `Scatter.tsx`

`scatterPoints(scatter, zone, objects, groundY)`: a seeded PRNG (`mulberry32`) places `count` points uniformly over the zone disc, never within 3 m of the centre, never on a placed object of that zone, each with a random size in `sizeRange` and rotation. Same seed → same layout, forever.

`Scatter` groups the points by asset and renders each as an `InstancedMesh` — one draw call per asset per sub-mesh, whatever the count. `InstancedModel` is reused by the cloud platform and the weather ring.

### `camera-math.ts` / `FlyThrough.tsx`

`frameScene(scene)` puts the camera behind and above the zones' bounding circle, aimed a little above the ground if any zone is elevated. With `fly`, `FlyThrough` glides between zones in array order (the agent creates them in story order), dwelling on each; the first drag hands control back to the user via `onUserOrbit`.

### `Effects.tsx`

Post-processing: bloom (mipmap blur) → ACES tone mapping → saturation → vignette. This is most of the "Sky: Children of the Light" feel. One hard-won setting: the composer uses **8-bit buffers**, not the default half-float. With half-float buffers, bloom produced a single-frame black band across the screen every ~8 seconds on Chrome/Apple GPUs — bisected with a per-frame framebuffer probe, reproducible in every bloom configuration and in none without bloom. Cost: no HDR headroom before bloom.

## Decisions worth knowing

- **Reconcile by id, per-item Suspense.** The stream sends full scenes; the renderer diffs by React keys. Verified: 17 objects each mount exactly once across ~30 growing scene updates.
- **`palette` is required in the contract.** The renderer never invents colours. `timeOfDay`/`biome`/`weather` are enums, so the renderer owns what those *look like* (sun angle, base tint) — but the scene owns the colours.
- **The library is files.** `web/public/assets/library/*.glb` + `library.json`. Five of the eleven were built with a script (spheres, cones, a tube on a helix) and baked to `.glb`; the script stays out of the repo. The renderer only ever loads files.
- **No story-specific code anywhere.** The only library id the renderer knows is `cloud_puff` (in `presets.ts`), and it has a fallback.
- **Fail soft.** Unknown asset → skipped. Generated URL 404 → fallback. Missing zone → terrain height. Palette missing → schema rejects it *before* the wire, on A's side.
- **Everything scales with `bounds`.** Terrain, sea, shadow area, sky dome, far plane, initial camera. A 320 m desert and a 200 m farm both frame correctly.

## Dev page

`/dev?scene=<name>` (outside `scene/`, in `app/dev/`) loads `fixtures/<name>.scene.json` through a dev-only route and renders it. **Replay** feeds the scene in piece by piece the way the server would, then flips generated assets to `ready` and the skybox to a test image. **Fly** toggles the fly-through. It knows nothing about any particular fixture.

If a browser-automation tab shows a blank page: background tabs pause `requestAnimationFrame`, so three.js never draws until the tab is focused.

## Tests

`npm test` (Node's own runner, no framework): terrain height determinism and zone flattening; scatter placement rules; camera framing incl. off-origin scenes; every contract enum has a preset; every fixture parses, has consistent refs and uses only library ids; every `library.json` file exists.

## Not done

Task 17 (a proper look pass per time of day with dev-page selectors) and Task 18 (a measured performance pass) were dropped as unnecessary for now. The knobs for both are in `presets.ts`.
