# CLAUDE.md

Guidance for AI coding agents working in this repo. Read [`story-arch.md`](story-arch.md) and [`world-arch.md`](world-arch.md) first — they explain what we're building, why, and how the team is split. This file is about how to write code here.

This is a 36-hour hackathon project. Bias toward working code over perfect code — but never at the cost of the rules in **Non-negotiables**. Those exist because they're the ones that cause cross-team breakage nobody can afford to debug at 4am.

## The one-paragraph summary

A child writes a story. The server turns it into a `Scene` (JSON), asking the child a few questions to fill in what the story doesn't say. The browser renders the `Scene`. `shared/contract.ts` is the only thing the two halves share. Person A owns `server/`, Person B owns `web/`, both own `shared/` and `fixtures/`.

## Non-negotiables

Architectural invariants, not style preferences. Breaking one breaks the other half of the team.

1. **The agent never emits rendering code, colours, or magic numbers.** It calls tools that edit a `Scene`. It picks `environment.preset` by name — it does not choose hex colours, fog distances, light intensities, or particle counts. If a tool signature grows a colour field, stop: that value belongs in `web/src/scene/presets.ts`.
2. **No numeric literals in rendering code.** Every tunable value lives in a preset object. `fogNear: 20` inside `<Ambience>` is a bug even though it works — it makes the tuning pass impossible. Exception: structural constants that are never tuned (array indices, `Math.PI`).
3. **Never mutate a `Scene` in place on the client.** B treats the incoming scene as immutable truth and diffs by `id`. A builds the next scene from the previous one and sends the whole thing.
4. **IDs are never reused within a world.** B's reconciliation depends on this. Generate with a counter or `nanoid` — never by index or by name.
5. **Validate before the wire, tolerate after it.** A runs `SceneSchema.parse` + `validateSceneRefs` before every send and lets it throw. B runs `safeParse` and, on failure, logs and keeps the last good scene. Never the other way round.
6. **Changes to `shared/` need the other person's review.** Adding an optional field is safe. Adding a value to an enum (`EnvironmentPreset`, `GroundCoverLayer['type']`, `LifeSpawn['type']`) type-checks but breaks the demo, because B has to ship the renderer before A emits it. Say so in chat first.
7. **Nothing from the user reaches a prompt unfiltered.** Story text and free-text answers go through `server/src/safety/` first. This is a children's product with an open text input.

## Reuse before you write

Check these before adding anything. Duplicated helpers are how the two halves silently diverge.

- `shared/contract.ts` — all schemas and types. Never redeclare a `Scene` shape locally or write a parallel interface "just for this function." Import the inferred type.
- `shared/validateSceneRefs.ts` — the cross-field checks types can't express. Add to it rather than writing ad-hoc checks at call sites.
- `web/src/scene/presets.ts` — the base + place + time table, and every visual constant in the app. Need a new look? Add a preset entry, don't add a prop.
- `web/public/assets/library/library.json` — the model catalogue. Check whether a model already covers what you need before generating or importing one. Entries may be added at any time; IDs are never renamed or removed.
- `fixtures/jack.scene.json` — the reference scene. Need a field to exist for testing? Add it here rather than stubbing it inline.

Generally: if you're about to write a second function that loads a `.glb`, normalizes a bounding box, seeds a PRNG, or maps a biome to a colour, one already exists. Find it.

## Code style

- TypeScript, strict. No `any`. If you genuinely don't know a shape, `unknown` plus a zod parse. `as` casts need a comment explaining why the compiler is wrong.
- Types come from zod, not hand-written alongside it: `type Scene = z.infer<typeof SceneSchema>`. Two sources of truth for one shape is how contract drift starts.
- Small modules, named exports. One concept per file. No default exports except React components.
- Functions do one thing and say so in their name — `normalizeModel`, `snapToTerrain`, `rankGapsByImpact`. If the name needs "and" in it, split it.
- Comments explain why, not what. `// bloom threshold must stay above flower emissive or the whole meadow glows` is useful. `// set the threshold` is noise.
- Delete dead code immediately. Don't comment it out "in case" — git has it.
- No premature abstraction. Two similar things stay two things; extract on the third. A hackathon codebase dies faster from a wrong abstraction than from duplication.

## Server (`server/`)

- Pipeline stages are pure where possible: `compress(story) → text`, `buildBrief(text) → Brief`, `rankGaps(brief) → Gap[]`. Take input, return output, don't touch the event stream. The orchestrator in `api.ts` wires them and emits events — this makes every stage testable against a fixture without running the whole thing.
- Model calls go behind an interface. `src/llm/` exposes `complete()` and `callWithTools()`. No SDK imports scattered through pipeline code — we will swap models under time pressure and can't be hunting for call sites when we do.
- Every LLM call declares its tier: `cheap` | `mid` | `agent`. Tiers map to models in one config object. The wrong model on the wrong stage is the main way this project overspends.
- Prompts live in `prompts.ts`, not inline. Template literals with named slots — a prompt buried in a function body can't be iterated on.
- Tool handlers validate, apply, return. Each handler takes the current `Scene` and the tool args, returns the next `Scene`, or throws a descriptive error. The loop catches, feeds the message back to the agent as a tool result, and continues. Never let a bad tool call kill the run.
- Assume every external call fails. Text-to-3D, skybox generation, and the model API all fail or hang. Every one needs a timeout and a fallback that still produces a valid `Scene`. A world with placeholder models is a demo; a hung request is not.

## Web (`web/`)

- One component per `Scene` field: `<Terrain>`, `<Ambience>`, `<ZonePlatform>`, `<SceneObject>`, `<Scatter>`, `<GroundCover>`, `<Life>`. A component reads its slice and nothing else.
- Render from the scene, never from local state. The only local state is UI state (which panel is open, quality level). Tempted to cache derived scene data? Memoize on the scene object identity instead.
- Key everything by `id`. React reconciliation and our scene diffing are the same mechanism — never key by array index.
- Ignore unknown fields. A newer server may send fields this build doesn't know. Render what you understand, skip the rest, don't crash.
- Instance anything that appears more than ~20 times — grass, flowers, fireflies, scattered rocks. `InstancedMesh`, one draw call. Per-instance variation goes in an instanced attribute, not in separate meshes.
- Nothing allocates in the frame loop. No `new THREE.Vector3()` inside `useFrame`. Hoist to module scope or a ref and reuse — this is the single most common cause of hackathon framerate collapse.
- Dispose what you create. Geometries, materials, and textures created in a component are disposed on unmount. Scenes rebuild constantly during development; leaks compound fast.
- Every visual system respects the quality level. If it draws, it scales down on `low`. Wire that when you write it, not later.
- Pin Three.js. The `examples/jsm` post-processing API moves between versions and `EffectComposer` is load-bearing. Do not bump it.

## Testing, such as it is

We're not writing a test suite. We are keeping these three things green:

1. `SceneSchema.parse` + `validateSceneRefs` on every fixture. One script, runs in a second, catches most cross-team breakage.
2. The mock server runs B's renderer end to end. If `pnpm mock` renders `jack.scene.json` without errors, B is unblocked.
3. A's pipeline produces a valid scene for every story in `fixtures/stories/`, including the deliberately broken kid-written ones — those are the interesting cases.

If you add a field to the contract, add it to `jack.scene.json` in the same commit. That's the test.

## Working with the fixture

`fixtures/jack.scene.json` is the contract made concrete. When something is ambiguous, the fixture is the answer.

If you're blocked on the other half, add what you need to the fixture and keep going. Don't wait, and don't work around the contract in your own half — that's how the two of you end up with incompatible assumptions that only surface at a merge checkpoint.

## Things that look like good ideas and aren't

- **Letting the agent emit a palette.** It will produce plausible, slightly different colours every run and the world will look assembled from parts. Preset names only.
- **Generating rendering code at runtime.** Slow, expensive, and inconsistent. The renderer is static; only the data varies.
- **Partial scene updates over the wire.** We tried the reasoning and rejected it: full scenes are a few KB, and resending everything eliminates a whole class of ordering bugs.
- **Free-generating question text.** Model output going straight to a child, unfiltered, with no tone control. Templates with slots.
- **Adding a config option instead of making a decision.** Every flag is a branch nobody tests. Pick a value, write it in the preset, move on.
- **Refactoring at hour 30.** Whatever it is, it can wait until after the demo.

## Commits and PRs

Small commits with real messages — `fix firefly flicker period colliding with drift` beats `wip`. PRs touching `shared/` or `library.json` need the other person's review (see Non-negotiables #6); everything else can go straight to `main` if it builds. At each merge checkpoint, both halves merge and run the full flow on at least two stories before anyone starts the next chunk.
