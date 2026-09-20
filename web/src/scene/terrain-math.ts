import type { Scene, Zone } from '@app/shared'
import { TERRAIN } from './presets.ts'

type Terrain = Scene['terrain']

// ponytail: 2D value noise + fBm. Swap for simplex-noise if the hills look too blobby.
function hash(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const smooth = (t: number) => t * t * (3 - 2 * t)

function noise2(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z)
  const fx = smooth(x - ix), fz = smooth(z - iz)
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed)
  const c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed)
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz // 0..1
}

function rawHeight(x: number, z: number, t: Terrain): number {
  let h = 0, amp = 1, freq = TERRAIN.baseFrequency, norm = 0
  for (let o = 0; o < TERRAIN.octaves; o++) {
    h += (noise2(x * freq, z * freq, t.seed + o * 101) - 0.5) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return (h / norm) * 2 * t.heightVariation * TERRAIN.maxHeight
}

/** Ground height at (x, z). Ground zones are flattened toward the height at their center. */
export function heightAt(x: number, z: number, terrain: Terrain, zones: Zone[]): number {
  let h = rawHeight(x, z, terrain)
  for (const zone of zones) {
    if (zone.elevation > 0) continue
    const d = Math.hypot(x - zone.center[0], z - zone.center[1])
    if (d >= zone.radius) continue
    const hc = rawHeight(zone.center[0], zone.center[1], terrain)
    h = hc + (h - hc) * smooth(d / zone.radius)
  }
  return h
}

/** Y for a snapped object: the zone platform if elevated, else the terrain. */
export function groundY(x: number, z: number, terrain: Terrain, zones: Zone[], zone?: Zone): number {
  if (zone && zone.elevation > 0) return zone.elevation
  return heightAt(x, z, terrain, zones)
}
