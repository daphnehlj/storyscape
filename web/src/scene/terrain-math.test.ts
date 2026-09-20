import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groundY, heightAt } from './terrain-math.ts'
import type { Scene, Zone } from '@app/shared'

const T: Scene['terrain'] = { biome: 'grassland', heightVariation: 0.5, seed: 7 }
const farm: Zone = { id: 'z', name: '', description: '', center: [-40, 30], radius: 35, elevation: 0 }
const sky: Zone = { id: 's', name: '', description: '', center: [40, -40], radius: 40, elevation: 80, platform: 'cloud' }

test('deterministic for same seed, differs for other seed', () => {
  assert.equal(heightAt(3.2, -7.9, T, []), heightAt(3.2, -7.9, T, []))
  assert.notEqual(heightAt(3.2, -7.9, T, []), heightAt(3.2, -7.9, { ...T, seed: 8 }, []))
})

test('flat when heightVariation is 0, bumpy otherwise', () => {
  assert.equal(Math.abs(heightAt(10, 10, { ...T, heightVariation: 0 }, [])), 0) // abs: strictEqual treats -0 !== 0
  const hs = [0, 20, 40, 60].map((x) => heightAt(x, 0, T, []))
  assert.ok(Math.max(...hs) - Math.min(...hs) > 1, 'terrain should vary by more than 1m across 60m')
})

test('ground zone flattens toward its center height; elevated zone does not', () => {
  const hc = heightAt(-40, 30, T, [])
  assert.ok(Math.abs(heightAt(-38, 31, T, [farm]) - hc) < 0.2)
  assert.equal(heightAt(42, -38, T, [sky]), heightAt(42, -38, T, []))
})

test('groundY uses zone elevation when elevated, terrain otherwise', () => {
  assert.equal(groundY(40, -40, T, [sky], sky), 80)
  assert.equal(groundY(-40, 30, T, [farm], farm), heightAt(-40, 30, T, [farm]))
  assert.equal(groundY(0, 0, T, [], undefined), heightAt(0, 0, T, []))
})
