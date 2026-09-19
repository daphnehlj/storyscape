import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Suspense } from 'react'
import type { Scene } from '@app/shared'
import { Effects } from './Effects.tsx'
import { CAMERA } from './presets.ts'
import { Terrain } from './Terrain.tsx'
import { Water } from './Water.tsx'

export type WorldProps = {
  scene: Scene
  onSelect?: (title: string, note: string) => void
}

export function World({ scene }: WorldProps) {
  return (
    // `flat` = no renderer tone mapping; the ToneMapping effect owns it.
    <Canvas flat shadows camera={CAMERA}>
      <Suspense fallback={null}>
        {/* temporary stand-ins, replaced task by task */}
        <Terrain scene={scene} />
        <Water scene={scene} />
        <directionalLight position={[50, 80, 30]} intensity={2} castShadow />
        <hemisphereLight args={['#cfd8ff', '#3a4a2a', 0.6]} />
        <OrbitControls makeDefault />
        <Effects />
      </Suspense>
    </Canvas>
  )
}
