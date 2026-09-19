import { Component, Suspense, type ReactNode } from 'react'
import type { Scene, SceneObject as SceneObjectT } from '@app/shared'
import { assetUrl, useLibrary, useNormalizedModel } from './assets.ts'
import { groundY } from './terrain-math.ts'

type Props = { obj: SceneObjectT; scene: Scene; onSelect?: (o: SceneObjectT) => void }

export function SceneObject({ obj, scene, onSelect }: Props) {
  const lib = useLibrary()
  const ref = scene.assets[obj.assetId]
  const url = assetUrl(obj.assetId, scene.assets, lib)
  if (!url) return null
  // While a generated model is loading, show its fallback instead of nothing.
  const fallbackUrl = ref?.source === 'generated' ? assetUrl(ref.fallbackAssetId, scene.assets, lib) : null
  const zone = scene.zones.find((z) => z.id === obj.zoneId)
  const [x, y0, z] = obj.position
  const y = obj.snapToGround ? groundY(x, z, scene.terrain, scene.zones, zone) : y0
  return (
    <group
      position={[x, y, z]}
      rotation-y={(obj.rotationY * Math.PI) / 180}
      onClick={onSelect && ((e) => { e.stopPropagation(); onSelect(obj) })}
    >
      <ModelBoundary>
        <Suspense fallback={fallbackUrl && fallbackUrl !== url ? <Model url={fallbackUrl} size={obj.size} /> : null}>
          <Model url={url} size={obj.size} />
        </Suspense>
      </ModelBoundary>
    </group>
  )
}

function Model({ url, size }: { url: string; size: number }) {
  const model = useNormalizedModel(url, size)
  return <primitive object={model} />
}

/** One bad .glb (404, corrupt) must not blank the whole world. */
class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err: unknown) { console.warn('model failed to load', err) }
  render() { return this.state.failed ? null : this.props.children }
}
