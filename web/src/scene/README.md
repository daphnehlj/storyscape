# Renderer — `<World />`

Renders any valid `Scene` (see `shared/contract.ts`). Owns everything under `src/scene/`. No network, no state — pass it the latest scene and it draws it.

## Mount

three.js needs a browser, so load it client-only from a `'use client'` component:

```tsx
import dynamic from 'next/dynamic'
const World = dynamic(() => import('@/scene/World').then((m) => m.World), { ssr: false })

<World
  scene={scene}                    // latest valid Scene — final or mid-stream, same thing
  onSelect={(title, note) => …}    // optional: user clicked an object/zone that has a storyNote
  fly={fly}                        // optional: auto fly-through of zones
  onUserOrbit={() => setFly(false)}// optional: fires when the user drags the camera
/>
```

Put it in a `position: fixed; inset: 0` container (or any sized box). Overlay your UI on top.

## Feeding it scenes

- Hand it every `scene` event's full `Scene` as it arrives. Components are keyed by `id`, so unchanged things stay mounted — the world grows in place without flicker.
- Validate with `WorldEventSchema.safeParse` before passing; on failure keep the last good scene.
- Generated assets: while `assets[id].status === 'pending'` the renderer draws `fallbackAssetId`; when it flips to `ready` with a `url`, it swaps in place. `failed` keeps the fallback. Same for `environment.skybox`.

## Static files it loads (all under `public/assets/`)

`library/library.json` + `library/*.glb`, `cloud.png`. Generated models come from `scene.assets[].url` (`/generated/…`, proxied to the server by `next.config.ts`).

## Tuning

Every visual constant lives in `presets.ts`. Nothing else in `src/scene/` has magic numbers.

## Dev page

`/dev` renders the fixture with replay + tuning controls. Not part of the app.
