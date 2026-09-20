import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { MathUtils, type Vector3 } from 'three'
import type { Zone } from '@app/shared'
import { FLY } from './presets.ts'

type Controls = { target: Vector3; update: () => void }

/** Visits the zones in array order (the agent creates them in story order), dwelling on each, with damped camera moves. */
export function FlyThrough({ zones, enabled }: { zones: Zone[]; enabled: boolean }) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const [i, setI] = useState(0)
  const t = useRef(0)

  useEffect(() => { setI(0); t.current = 0 }, [enabled])

  useFrame(({ camera }, dt) => {
    if (!enabled || !controls || zones.length === 0) return
    t.current += dt
    if (t.current > FLY.dwellSeconds) { t.current = 0; setI((n) => (n + 1) % zones.length) }
    const z = zones[i % zones.length]
    const [cx, cz] = z.center
    const r = z.radius
    const tx = cx, ty = z.elevation + r * FLY.target.lift, tz = cz
    const ex = cx + r * FLY.eye.back, ey = z.elevation + r * FLY.eye.height, ez = cz + r * FLY.eye.back
    camera.position.set(
      MathUtils.damp(camera.position.x, ex, FLY.smooth, dt),
      MathUtils.damp(camera.position.y, ey, FLY.smooth, dt),
      MathUtils.damp(camera.position.z, ez, FLY.smooth, dt),
    )
    controls.target.set(
      MathUtils.damp(controls.target.x, tx, FLY.smooth, dt),
      MathUtils.damp(controls.target.y, ty, FLY.smooth, dt),
      MathUtils.damp(controls.target.z, tz, FLY.smooth, dt),
    )
    controls.update()
  })
  return null
}
