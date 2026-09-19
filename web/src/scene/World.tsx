import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Suspense } from 'react'
import type { Scene } from '@app/shared'
import { Effects } from './Effects.tsx'
import { Environment } from './Environment.tsx'
import { CAMERA } from './presets.ts'
import { SceneObject } from './SceneObject.tsx'
import { Terrain } from './Terrain.tsx'
import { Water } from './Water.tsx'

export type WorldProps = {
  scene: Scene
  onSelect?: (title: string, note: string) => void
}

export function World({ scene, onSelect }: WorldProps) {
  return (
    // `flat` = no renderer tone mapping; the ToneMapping effect owns it.
    <Canvas flat shadows camera={CAMERA}>
      <Suspense fallback={null}>
        <Terrain scene={scene} />
        <Water scene={scene} />
        <Environment scene={scene} />
        {scene.objects.map((o) => (
          <Suspense key={o.id} fallback={null}>
            <SceneObject obj={o} scene={scene} onSelect={onSelect && ((x) => x.storyNote && onSelect(x.label ?? x.assetId, x.storyNote))} />
          </Suspense>
        ))}
        <OrbitControls makeDefault />
        <Effects />
      </Suspense>
    </Canvas>
  )
}
