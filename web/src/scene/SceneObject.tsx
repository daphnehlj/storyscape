import { Component, Suspense, type ReactNode } from 'react'
import type { Scene, SceneObject as SceneObjectT } from '@app/shared'
import { assetUrl, PROC_PREFIX, useGltfModel, useLibrary, useProceduralModel } from './assets.ts'
import { paletteOf } from './Environment.tsx'
import { groundY } from './terrain-math.ts'
import type { Palette } from './procedural.ts'

type Props = { obj: SceneObjectT; scene: Scene; onSelect?: (o: SceneObjectT) => void }

export function SceneObject({ obj, scene, onSelect }: Props) {
  const lib = useLibrary()
  const ref = scene.assets[obj.assetId]
  const url = assetUrl(obj.assetId, scene.assets, lib)
  if (!url) return null
  const palette = paletteOf(scene.environment)
  // While a generated model is loading, show its fallback instead of nothing.
  const fallbackUrl = ref?.source === 'generated' ? assetUrl(ref.fallbackAssetId, scene.assets, lib) : null
  const zone = scene.zones.find((z) => z.id === obj.zoneId)
  const [x, y0, z] = obj.position
  const y = obj.snapToGround ? groundY(x, z, scene.terrain, scene.zones, zone) : y0
  const castShadow = !zone || zone.elevation === 0 // a castle 50 m up would stamp a black blob on the farm
  return (
    <group
      position={[x, y, z]}
      rotation-y={(obj.rotationY * Math.PI) / 180}
      onClick={onSelect && ((e) => { e.stopPropagation(); onSelect(obj) })}
    >
      <ModelBoundary>
        <Suspense fallback={fallbackUrl && fallbackUrl !== url ? <Model url={fallbackUrl} size={obj.size} palette={palette} castShadow={castShadow} /> : null}>
          <Model url={url} size={obj.size} palette={palette} castShadow={castShadow} />
        </Suspense>
      </ModelBoundary>
    </group>
  )
}

type ModelProps = { url: string; size: number; palette: Palette; castShadow: boolean }

export function Model({ url, size, palette, castShadow }: ModelProps) {
  return url.startsWith(PROC_PREFIX)
    ? <ProcModel id={url.slice(PROC_PREFIX.length)} size={size} palette={palette} castShadow={castShadow} />
    : <GltfModel url={url} size={size} castShadow={castShadow} />
}

function GltfModel({ url, size, castShadow }: Omit<ModelProps, 'palette'>) {
  return <primitive object={useGltfModel(url, size, castShadow)} />
}

function ProcModel({ id, size, palette, castShadow }: Omit<ModelProps, 'url'> & { id: string }) {
  return <primitive object={useProceduralModel(id, size, palette, castShadow)} />
}

/** One bad .glb (404, corrupt) must not blank the whole world. */
class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err: unknown) { console.warn('model failed to load', err) }
  render() { return this.state.failed ? null : this.props.children }
}
