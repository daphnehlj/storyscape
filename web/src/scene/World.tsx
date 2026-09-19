import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Suspense } from 'react'
import type { Scene } from '@app/shared'
import { Effects } from './Effects.tsx'
import { Terrain } from './Terrain.tsx'
import { Water } from './Water.tsx'
import { Environment } from './Environment.tsx'
import { SceneObject } from './SceneObject.tsx'
import { ZonePlatform } from './ZonePlatform.tsx'
import { Scatter } from './Scatter.tsx'
import { CAMERA } from './presets.ts'

export type WorldProps = {
  scene: Scene
  onSelect?: (title: string, note: string) => void
}

export function World({ scene, onSelect }: WorldProps) {
  return (
    // `flat` = no renderer tone mapping; the ToneMapping effect owns it.
    <Canvas flat shadows camera={CAMERA}>
      <Suspense fallback={null}>
        <Environment scene={scene} />
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
        <OrbitControls makeDefault />
        <Effects />
      </Suspense>
    </Canvas>
  )
}
