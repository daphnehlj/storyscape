import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SceneSchema } from '@app/shared'
import { ATMOSPHERE, BIOME_COLOR, SUN } from './presets.ts'

// Every value the contract allows must have a preset, or a valid scene could hit an undefined lookup.
const env = SceneSchema.shape.environment.shape
const biomes = SceneSchema.shape.terrain.shape.biome.options

test('every biome has a colour', () => {
  assert.deepEqual(Object.keys(BIOME_COLOR).sort(), [...biomes].sort())
})

test('every timeOfDay has a sun and a default palette', () => {
  assert.deepEqual(Object.keys(SUN).sort(), [...env.timeOfDay.options].sort())
  assert.deepEqual(Object.keys(ATMOSPHERE.defaultPalette).sort(), [...env.timeOfDay.options].sort())
})
