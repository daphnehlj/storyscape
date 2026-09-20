import type { Scatter, SceneObject, Vec3, Zone } from '@app/shared'
import { SCATTER } from './presets.ts'

export type Placement = { assetId: string; position: Vec3; rotationY: number; scale: number }

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic points inside the zone circle, avoiding the center and any placed objects in the zone. */
export function scatterPoints(
  s: Scatter,
  zone: Zone,
  objects: SceneObject[],
  groundY: (x: number, z: number) => number,
): Placement[] {
  const rand = mulberry32(s.seed)
  const [cx, cz] = zone.center
  const blocked = objects
    .filter((o) => o.zoneId === zone.id)
    .map((o) => ({ x: o.position[0], z: o.position[2], r: o.size / 2 + SCATTER.objectClearance }))
  const out: Placement[] = []
  for (let tries = 0; out.length < s.count && tries < s.count * SCATTER.maxTriesFactor; tries++) {
    const r = zone.radius * Math.sqrt(rand()) // sqrt → uniform over the disc
    const a = rand() * Math.PI * 2
    const x = cx + r * Math.cos(a), z = cz + r * Math.sin(a)
    if (r < SCATTER.centerClearance) continue
    if (blocked.some((b) => Math.hypot(x - b.x, z - b.z) < b.r)) continue
    const scale = s.sizeRange[0] + rand() * (s.sizeRange[1] - s.sizeRange[0])
    const assetId = s.assetIds[Math.floor(rand() * s.assetIds.length)]
    out.push({ assetId, position: [x, groundY(x, z), z], rotationY: rand() * Math.PI * 2, scale })
  }
  return out
}
