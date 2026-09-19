import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { SceneSchema, WorldEventSchema, validateSceneRefs } from './contract.ts'

const fixture = () =>
  SceneSchema.parse(JSON.parse(readFileSync(new URL('../fixtures/jack.scene.json', import.meta.url), 'utf8')))

test('fixture is a valid Scene with consistent refs', () => {
  assert.deepEqual(validateSceneRefs(fixture()), [])
})

test('validateSceneRefs catches dangling asset, missing platform, ready-without-url', () => {
  const scene = fixture()
  scene.objects[0].assetId = 'nope'
  scene.zones[1].platform = undefined
  scene.assets.beanstalk = { ...scene.assets.beanstalk, status: 'ready' } as typeof scene.assets.beanstalk
  const errs = validateSceneRefs(scene)
  assert.ok(errs.some((e) => e.includes('nope')))
  assert.ok(errs.some((e) => e.includes('platform')))
  assert.ok(errs.some((e) => e.includes('ready without url')))
})

test('event schema accepts valid events and rejects junk', () => {
  assert.equal(WorldEventSchema.safeParse({ type: 'log', text: 'hi' }).success, true)
  assert.equal(WorldEventSchema.safeParse({ type: 'scene', scene: {} }).success, false)
  assert.equal(WorldEventSchema.safeParse({ type: 'stage', stage: 'nope' }).success, false)
})

test('library.json files exist and fixture only uses known library ids', () => {
  const dir = new URL('../web/public/assets/library/', import.meta.url)
  const lib = JSON.parse(readFileSync(new URL('library.json', dir), 'utf8')) as { id: string; file: string }[]
  for (const e of lib) assert.ok(existsSync(new URL(e.file, dir)), `missing ${e.file}`)
  assert.deepEqual(validateSceneRefs(fixture(), new Set(lib.map((e) => e.id))), [])
})
