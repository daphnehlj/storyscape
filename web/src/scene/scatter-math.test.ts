import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32, scatterPoints } from './scatter-math.ts'
import type { Scatter, SceneObject, Zone } from '@app/shared'

const zone: Zone = { id: 'z', name: '', description: '', center: [-40, 30], radius: 35, elevation: 0 }
const s: Scatter = { id: 's', assetIds: ['oak_tree', 'bush'], zoneId: 'z', count: 30, seed: 11, sizeRange: [4, 9] }
const cottage: SceneObject = { id: 'o', assetId: 'cottage', zoneId: 'z', position: [-45, 0, 25], snapToGround: true, rotationY: 0, size: 6 }
const flat = () => 0

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(5), b = mulberry32(5)
  for (let i = 0; i < 100; i++) { const v = a(); assert.equal(v, b()); assert.ok(v >= 0 && v < 1) }
})

test('same seed → same points; different seed → different', () => {
  assert.deepEqual(scatterPoints(s, zone, [], flat), scatterPoints(s, zone, [], flat))
  assert.notDeepEqual(scatterPoints(s, zone, [], flat), scatterPoints({ ...s, seed: 12 }, zone, [], flat))
})

test('points stay inside the zone, off its center, away from objects, sized in range', () => {
  const pts = scatterPoints(s, zone, [cottage], (x, z) => x + z)
  assert.ok(pts.length > 0 && pts.length <= s.count)
  for (const p of pts) {
    const d = Math.hypot(p.position[0] - zone.center[0], p.position[2] - zone.center[1])
    assert.ok(d <= zone.radius + 1e-9 && d >= 2.99, `distance ${d}`) // tolerance: hypot(r cos a, r sin a) ≈ r
    assert.ok(Math.hypot(p.position[0] - cottage.position[0], p.position[2] - cottage.position[2]) >= cottage.size / 2 + 1.5)
    assert.ok(p.scale >= 4 && p.scale <= 9)
    assert.equal(p.position[1], p.position[0] + p.position[2]) // groundY applied
    assert.ok(s.assetIds.includes(p.assetId))
  }
})
