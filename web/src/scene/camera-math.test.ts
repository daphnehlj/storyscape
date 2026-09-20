import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { frameScene } from './camera-math.ts'
import type { Scene } from '@app/shared'

const jack = JSON.parse(readFileSync(new URL('../../../fixtures/jack.scene.json', import.meta.url), 'utf8')) as Scene

test('frames the zones: camera behind and above their centroid, aimed above ground when a zone is elevated', () => {
  const f = frameScene(jack)
  assert.ok(f.position[2] > f.target[2], 'camera sits at +z of the target')
  assert.ok(f.position[1] > f.target[1], 'camera sits above the target')
  assert.ok(f.target[1] > 0, 'elevated zone lifts the aim point')
})

test('a scene with zones far from the origin is still framed around them', () => {
  const shifted = { ...jack, zones: jack.zones.map((z) => ({ ...z, center: [z.center[0] + 300, z.center[1] + 300] as [number, number] })) }
  const f = frameScene(shifted)
  assert.ok(Math.abs(f.target[0] - 300) < 60 && Math.abs(f.target[2] - 300) < 60)
})

test('no zones → sane default', () => {
  const f = frameScene({ ...jack, zones: [] })
  assert.deepEqual(f.target, [0, 0, 0])
  assert.ok(f.position[2] > 0)
})
