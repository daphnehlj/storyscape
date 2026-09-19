import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildProcedural, cloudBank, PROCEDURAL } from './procedural.ts'

const palette = { sky: '#ffd9b3', ground: '#8ed072', accent: '#8fb8f0' }
const lib = JSON.parse(readFileSync(new URL('../../public/assets/library/library.json', import.meta.url), 'utf8')) as { id: string; procedural?: boolean }[]

test('every procedural library id has a builder, and builds a non-empty coloured mesh', () => {
  for (const e of lib.filter((e) => e.procedural)) {
    assert.ok(PROCEDURAL[e.id], `no builder for ${e.id}`)
    const m = buildProcedural(e.id, palette)!
    assert.ok(m.geometry.attributes.position.count > 0, e.id)
    assert.ok(m.geometry.attributes.color, `${e.id} has no vertex colours`)
  }
})

test('cloud bank covers its disc and tops out near y = 0', () => {
  const m = cloudBank(30, 7, palette)
  m.geometry.computeBoundingBox()
  const b = m.geometry.boundingBox!
  assert.ok(b.max.x > 15 && b.min.x < -15 && b.max.z > 15 && b.min.z < -15)
  assert.ok(b.max.y > 0 && b.max.y < 12 && b.min.y < -5)
})
