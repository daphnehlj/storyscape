'use client'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SceneSchema, type Scene } from '@app/shared'
import jack from '../../../../fixtures/jack.scene.json'

const World = dynamic(() => import('@/scene/World').then((m) => m.World), { ssr: false })

/** The sequence of full scenes the real server would send: empty → +zone… → +object… → +scatter… → assets ready. */
function replaySteps(full: Scene): Scene[] {
  const steps: Scene[] = []
  let s: Scene = { ...full, zones: [], objects: [], scatters: [], environment: { ...full.environment, skybox: { status: 'pending' } } }
  steps.push(s)
  for (const z of full.zones) steps.push((s = { ...s, zones: [...s.zones, z] }))
  for (const o of full.objects) steps.push((s = { ...s, objects: [...s.objects, o] }))
  for (const sc of full.scatters) steps.push((s = { ...s, scatters: [...s.scatters, sc] }))
  // "Generated" assets become ready — pointed at library files that differ from their fallback so the swap is visible.
  const swap: Record<string, string> = { beanstalk: 'oak_tree.glb', giant_castle: 'cottage.glb' }
  const assets = { ...s.assets }
  for (const a of Object.values(assets)) {
    if (a.source === 'generated' && swap[a.id]) assets[a.id] = { ...a, status: 'ready', url: `/assets/library/${swap[a.id]}` }
  }
  steps.push({ ...s, assets, environment: { ...s.environment, skybox: { status: 'ready', url: '/assets/sky-test.jpg' } } })
  return steps
}

export default function DevPage() {
  const full = useMemo(() => SceneSchema.parse(jack), [])
  const steps = useMemo(() => replaySteps(full), [full])
  const [scene, setScene] = useState<Scene>(full)
  const [note, setNote] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  function replay() {
    if (timer.current) window.clearTimeout(timer.current)
    let i = 0
    const tick = () => {
      setScene(steps[i])
      const last = i === steps.length - 2 // pause before the asset flip, like the real 3D job
      i++
      if (i < steps.length) timer.current = window.setTimeout(tick, last ? 5000 : 300)
    }
    tick()
  }
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <World scene={scene} onSelect={(title, n) => setNote(`${title}: ${n}`)} />
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8, font: '13px system-ui', color: '#eee' }}>
        <button onClick={replay}>Replay</button>
        <button onClick={() => setScene(full)}>Full</button>
        {note && <span style={{ background: '#0008', padding: '4px 8px', borderRadius: 6 }}>{note}</span>}
      </div>
    </div>
  )
}
