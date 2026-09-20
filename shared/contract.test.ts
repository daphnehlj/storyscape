import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { SceneSchema, WorldEventSchema, validateSceneRefs } from './contract.ts'

const fixturesDir = new URL('../fixtures/', import.meta.url)
const libraryDir = new URL('../web/public/assets/library/', import.meta.url)
const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith('.scene.json'))
const load = (file: string) => SceneSchema.parse(JSON.parse(readFileSync(new URL(file, fixturesDir), 'utf8')))
const jack = () => load('jack.scene.json')

test('library.json files exist', () => {
  const lib = JSON.parse(readFileSync(new URL('library.json', libraryDir), 'utf8')) as { id: string; file: string }[]
  for (const e of lib) assert.ok(existsSync(new URL(e.file, libraryDir)), `missing ${e.file}`)
})

test('every fixture is a valid Scene, refs consistent, only known library ids', () => {
  const lib = JSON.parse(readFileSync(new URL('library.json', libraryDir), 'utf8')) as { id: string }[]
  const ids = new Set(lib.map((e) => e.id))
  assert.ok(fixtureFiles.length > 0)
  for (const f of fixtureFiles) assert.deepEqual(validateSceneRefs(load(f), ids), [], f)
})

test('validateSceneRefs catches dangling asset, missing platform, ready-without-url', () => {
  const scene = jack()
  scene.objects[0].assetId = 'nope'
  const elevated = scene.zones.find((z) => z.elevation > 0)!
  elevated.platform = undefined
  const gen = Object.values(scene.assets).find((a) => a.source === 'generated')!
  scene.assets[gen.id] = { ...gen, status: 'ready' }
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
