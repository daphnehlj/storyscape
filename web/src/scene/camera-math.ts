import type { Scene } from '@app/shared'
import { CAMERA } from './presets.ts'

export type Framing = { position: [number, number, number]; target: [number, number, number] }

/**
 * Where the camera starts: back and above the zones' bounding circle, aimed a bit above the ground.
 * Pure so it can be tested; the result is only applied on first mount (the user owns the camera after that).
 */
export function frameScene(scene: Scene): Framing {
  const { distance, height, elevationLift, pitchUp, minRadius } = CAMERA.frame
  const zones = scene.zones
  const cx = zones.length ? zones.reduce((a, z) => a + z.center[0], 0) / zones.length : 0
  const cz = zones.length ? zones.reduce((a, z) => a + z.center[1], 0) / zones.length : 0
  const top = Math.max(0, ...zones.map((z) => z.elevation))
  const r = Math.max(minRadius, ...zones.map((z) => Math.hypot(z.center[0] - cx, z.center[1] - cz) + z.radius), top * 0.6)
  return {
    target: [cx, top * pitchUp, cz],
    position: [cx, r * height + top * elevationLift, cz + r * distance],
  }
}
