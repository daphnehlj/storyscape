'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { SceneSchema, type Scene } from '@app/shared'
import jack from '../../../../fixtures/jack.scene.json'

const World = dynamic(() => import('@/scene/World').then((m) => m.World), { ssr: false })

export default function DevPage() {
  const [scene] = useState<Scene>(() => SceneSchema.parse(jack))
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <World scene={scene} />
    </div>
  )
}
