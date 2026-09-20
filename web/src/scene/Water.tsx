import type { Scene } from '@app/shared'
import { WATER } from './presets.ts'

export function Water({ scene }: { scene: Scene }) {
  const w = scene.terrain.water
  if (!w) return null
  const color = scene.environment.palette?.[2] ?? WATER.fallbackColor
  const s = scene.bounds.size * WATER.sizeFactor
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={w.level}>
      <planeGeometry args={[s, s]} />
      <meshStandardMaterial color={color} transparent opacity={WATER.opacity} roughness={WATER.roughness} metalness={WATER.metalness} />
    </mesh>
  )
}
