import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import type { Scene } from '@app/shared'
import { Effects } from './Effects.tsx'
import { Terrain } from './Terrain.tsx'
import { Water } from './Water.tsx'
import { Environment } from './Environment.tsx'
import { SceneObject } from './SceneObject.tsx'
import { ZonePlatform } from './ZonePlatform.tsx'
import { Scatter } from './Scatter.tsx'
import { FlyThrough } from './FlyThrough.tsx'
import { Weather } from './Weather.tsx'
import { CAMERA } from './presets.ts'
import { frameScene } from './camera-math.ts'

export type WorldProps = {
  scene: Scene
  onSelect?: (title: string, note: string) => void
  fly?: boolean // auto fly-through of the zones
  onUserOrbit?: () => void // the user grabbed the camera — a good moment to set fly=false
}

export function World({ scene, onSelect, fly, onUserOrbit }: WorldProps) {
  // Framed once from the first scene; later scenes must not yank the camera away from the user.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const framing = useMemo(() => frameScene(scene), [])
  return (
    // `flat` = no renderer tone mapping; the ToneMapping effect owns it.
    <Canvas flat shadows="variance" camera={{ position: framing.position, fov: CAMERA.fov, near: CAMERA.near, far: scene.bounds.size * CAMERA.farFactor }}>
      <Suspense fallback={null}>
        <Environment scene={scene} />
        <Suspense fallback={null}><Weather scene={scene} /></Suspense>
        <Terrain scene={scene} />
        <Water scene={scene} />
        {/* One Suspense per item: a newly arriving model must not blank the world while it loads. */}
        {scene.zones.map((z) => (
          <Suspense key={z.id} fallback={null}>
            <ZonePlatform zone={z} scene={scene} onSelect={onSelect && ((x) => x.storyNote && onSelect(x.name, x.storyNote))} />
          </Suspense>
        ))}
        {scene.objects.map((o) => (
          <Suspense key={o.id} fallback={null}>
            <SceneObject obj={o} scene={scene} onSelect={onSelect && ((x) => x.storyNote && onSelect(x.label ?? x.assetId, x.storyNote))} />
          </Suspense>
        ))}
        {scene.scatters.map((s) => (
          <Suspense key={s.id} fallback={null}>
            <Scatter scatter={s} scene={scene} />
          </Suspense>
        ))}
        <OrbitControls makeDefault target={framing.target} onStart={onUserOrbit} />
        <FlyThrough zones={scene.zones} enabled={!!fly} />
        <Effects />
      </Suspense>
    </Canvas>
  )
}
