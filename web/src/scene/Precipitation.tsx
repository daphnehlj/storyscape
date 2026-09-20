import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { mulberry32 } from './scatter-math.ts'
import { WEATHER } from './presets.ts'

/**
 * Falling particles in world space. Each particle keeps its own world position; when it leaves the
 * radius×height region around the camera it wraps to the opposite side, so the field is effectively
 * endless but never moves with the camera. Nothing allocates per frame.
 */
export function Snow() {
  const { count, radius, height, fallSpeed, sway, size, color, opacity } = WEATHER.snow
  const geometry = useMemo(() => field(count, radius, height, 1), [count, radius, height])
  useFrame(({ camera, clock }, dt) => {
    const a = (geometry.attributes.position as BufferAttribute).array as Float32Array
    const t = clock.elapsedTime
    for (let i = 0; i < count; i++) {
      a[i * 3 + 1] -= fallSpeed * dt
      a[i * 3] += Math.sin(t + i) * sway * dt
      wrap(a, i * 3, camera.position, radius, height)
    }
    geometry.attributes.position.needsUpdate = true
  })
  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial size={size} color={color} transparent opacity={opacity} depthWrite={false} sizeAttenuation />
    </points>
  )
}

export function Rain() {
  const { count, radius, height, fallSpeed, length, color, opacity } = WEATHER.rain
  // two vertices per drop: top and bottom of a vertical streak
  const geometry = useMemo(() => field(count, radius, height, 2, length), [count, radius, height, length])
  useFrame(({ camera }, dt) => {
    const a = (geometry.attributes.position as BufferAttribute).array as Float32Array
    const step = fallSpeed * dt
    for (let i = 0; i < count; i++) {
      const top = i * 6, bottom = i * 6 + 3
      a[top + 1] -= step
      wrap(a, top, camera.position, radius, height)
      a[bottom] = a[top]; a[bottom + 1] = a[top + 1] - length; a[bottom + 2] = a[top + 2]
    }
    geometry.attributes.position.needsUpdate = true
  })
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </lineSegments>
  )
}

/** Keep the particle at `o` inside the box around `c` by shifting it a whole box width — it stays world-fixed otherwise. */
function wrap(a: Float32Array, o: number, c: Vector3, radius: number, height: number) {
  if (a[o] < c.x - radius) a[o] += radius * 2; else if (a[o] > c.x + radius) a[o] -= radius * 2
  if (a[o + 2] < c.z - radius) a[o + 2] += radius * 2; else if (a[o + 2] > c.z + radius) a[o + 2] -= radius * 2
  if (a[o + 1] < c.y - height / 2) a[o + 1] += height; else if (a[o + 1] > c.y + height / 2) a[o + 1] -= height
}

/** `count` particles uniformly in a radius×height×radius box around the origin (wrap() moves them to the camera on the first frame). */
function field(count: number, radius: number, height: number, verts: 1 | 2, length = 0): BufferGeometry {
  const rand = mulberry32(count)
  const a = new Float32Array(count * verts * 3)
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * 2 * radius, y = (rand() - 0.5) * height, z = (rand() - 0.5) * 2 * radius
    a.set([x, y, z], i * verts * 3)
    if (verts === 2) a.set([x, y - length, z], i * 6 + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(a, 3))
  return g
}
