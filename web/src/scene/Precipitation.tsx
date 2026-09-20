import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Group } from 'three'
import { mulberry32 } from './scatter-math.ts'
import { WEATHER } from './presets.ts'

/**
 * Falling particles in a box centred on the camera, so precipitation is always in view whatever the world size.
 * Positions are in the box's local space; the group is moved to the camera every frame. Nothing allocates per frame.
 */
export function Snow() {
  const { count, radius, height, fallSpeed, sway, size, color, opacity } = WEATHER.snow
  const group = useRef<Group>(null!)
  const geometry = useMemo(() => box(count, radius, height, 1), [count, radius, height])
  useFrame(({ camera, clock }, dt) => {
    group.current.position.copy(camera.position)
    const pos = geometry.attributes.position as BufferAttribute
    const a = pos.array as Float32Array
    const t = clock.elapsedTime
    for (let i = 0; i < count; i++) {
      a[i * 3 + 1] -= fallSpeed * dt
      a[i * 3] += Math.sin(t + i) * sway * dt
      if (a[i * 3 + 1] < -height / 2) a[i * 3 + 1] += height
    }
    pos.needsUpdate = true
  })
  return (
    <group ref={group}>
      <points geometry={geometry}>
        <pointsMaterial size={size} color={color} transparent opacity={opacity} depthWrite={false} sizeAttenuation />
      </points>
    </group>
  )
}

export function Rain() {
  const { count, radius, height, fallSpeed, length, color, opacity } = WEATHER.rain
  const group = useRef<Group>(null!)
  // two vertices per drop: top and bottom of a vertical streak
  const geometry = useMemo(() => box(count, radius, height, 2, length), [count, radius, height, length])
  useFrame(({ camera }, dt) => {
    group.current.position.copy(camera.position)
    const pos = geometry.attributes.position as BufferAttribute
    const a = pos.array as Float32Array
    const step = fallSpeed * dt
    for (let i = 0; i < count; i++) {
      const top = i * 6 + 1, bottom = i * 6 + 4
      a[top] -= step
      a[bottom] -= step
      if (a[bottom] < -height / 2) { a[top] += height; a[bottom] += height }
    }
    pos.needsUpdate = true
  })
  return (
    <group ref={group}>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </lineSegments>
    </group>
  )
}

/** `count` particles uniformly in a radius×height×radius box around the origin; `verts` per particle stacked `length` apart. */
function box(count: number, radius: number, height: number, verts: 1 | 2, length = 0): BufferGeometry {
  const rand = mulberry32(count)
  const a = new Float32Array(count * verts * 3)
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * 2 * radius, y = (rand() - 0.5) * height, z = (rand() - 0.5) * 2 * radius
    a.set([x, y, z], i * verts * 3)
    if (verts === 2) a.set([x, y - length, z], i * 6 + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(a, 3))
  g.computeBoundingSphere() // the box surrounds the camera, so this sphere is always in the frustum
  return g
}
