import { useMemo } from 'react'
import { Sparkles } from '@react-three/drei'
import type { Scene } from '@app/shared'
import { useLibrary } from './assets.ts'
import { InstancedModel } from './Scatter.tsx'
import { mulberry32, type Placement } from './scatter-math.ts'
import { WEATHER, ZONE } from './presets.ts'

/** `weather`: cloud cover for cloudy/rain/snow, precipitation for rain/snow. `fog` is handled by the fog density in Environment. */
export function Weather({ scene }: { scene: Scene }) {
  const w = scene.environment.weather
  const size = scene.bounds.size
  const overcast = w === 'cloudy' || w === 'rain' || w === 'snow'
  return (
    <>
      {overcast && <CloudRing scene={scene} />}
      {w === 'snow' && <Sparkles count={WEATHER.snow.count} scale={[size, WEATHER.snow.height, size]} position-y={WEATHER.snow.y} size={WEATHER.snow.size} speed={WEATHER.snow.speed} noise={WEATHER.snow.noise} color={WEATHER.snow.color} />}
      {w === 'rain' && <Sparkles count={WEATHER.rain.count} scale={[size, WEATHER.rain.height, size]} position-y={WEATHER.rain.y} size={WEATHER.rain.size} speed={WEATHER.rain.speed} noise={WEATHER.rain.noise} color={WEATHER.rain.color} opacity={WEATHER.rain.opacity} />}
    </>
  )
}

function CloudRing({ scene }: { scene: Scene }) {
  const lib = useLibrary()
  const { size, skyHeight } = scene.bounds
  const points = useMemo(() => cloudRing(size, skyHeight), [size, skyHeight])
  const entry = lib[ZONE.cloud.asset]
  if (!entry) return null
  return <InstancedModel url={`/assets/library/${entry.file}`} points={points} shadows={false} />
}

function cloudRing(size: number, skyHeight: number): Placement[] {
  const { count, ringFactor, sizeFactor, jitter, seed } = WEATHER.clouds
  const rand = mulberry32(seed)
  const out: Placement[] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * jitter
    const r = size * ringFactor * (1 + (rand() - 0.5) * jitter)
    const s = size * (sizeFactor[0] + rand() * (sizeFactor[1] - sizeFactor[0]))
    out.push({ assetId: ZONE.cloud.asset, position: [Math.cos(a) * r, skyHeight, Math.sin(a) * r], rotationY: rand() * Math.PI * 2, scale: s })
  }
  return out
}
