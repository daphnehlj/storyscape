'use client'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { SceneSchema, type Scene } from '@app/shared'
import library from '../../../../web/public/assets/library/library.json'

const World = dynamic(() => import('@/scene/World').then((m) => m.World), { ssr: false })

/** The sequence of full scenes the real server would send: empty → +zone… → +object… → +scatter… → assets ready. */
function replaySteps(full: Scene): Scene[] {
  const steps: Scene[] = []
  let s: Scene = { ...full, zones: [], objects: [], scatters: [], environment: { ...full.environment, skybox: { status: 'pending' } } }
  steps.push(s)
  for (const z of full.zones) steps.push((s = { ...s, zones: [...s.zones, z] }))
  for (const o of full.objects) steps.push((s = { ...s, objects: [...s.objects, o] }))
  for (const sc of full.scatters) steps.push((s = { ...s, scatters: [...s.scatters, sc] }))
  // Every "generated" asset becomes ready — pointed at a library file other than its own fallback so the swap is visible.
  const assets = { ...s.assets }
  for (const a of Object.values(assets)) {
    if (a.source !== 'generated') continue
    const standIn = library.find((e) => e.id !== a.fallbackAssetId)
    if (standIn) assets[a.id] = { ...a, status: 'ready', url: `/assets/library/${standIn.file}` }
  }
  steps.push({ ...s, assets, environment: { ...s.environment, skybox: { status: 'ready', url: '/assets/sky-test.jpg' } } })
  return steps
}

export default function DevPage() {
  return <Suspense fallback={null}><Dev /></Suspense> // useSearchParams needs a boundary
}

function Dev() {
  const name = useSearchParams().get('scene') ?? 'jack'
  const [names, setNames] = useState<string[]>([])
  const [full, setFull] = useState<Scene | null>(null)
  const steps = useMemo(() => (full ? replaySteps(full) : []), [full])
  const [scene, setScene] = useState<Scene | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [fly, setFly] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => { fetch('/dev/fixtures/index').then((r) => r.json()).then(setNames) }, [])
  useEffect(() => {
    fetch(`/dev/fixtures/${name}`).then((r) => r.json()).then((j) => { const s = SceneSchema.parse(j); setFull(s); setScene(s) })
  }, [name])

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
      {scene && <World key={scene.id} scene={scene} onSelect={(title, n) => setNote(`${title}: ${n}`)} fly={fly} onUserOrbit={() => setFly(false)} />}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8, font: '13px system-ui', color: '#eee' }}>
        <select value={name} onChange={(e) => { window.location.search = `?scene=${e.target.value}` }}>
          {(names.length ? names : [name]).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={replay}>Replay</button>
        <button onClick={() => full && setScene(full)}>Full</button>
        <button onClick={() => setFly((f) => !f)}>{fly ? 'Stop' : 'Fly'}</button>
        {note && <span style={{ background: '#0008', padding: '4px 8px', borderRadius: 6 }}>{note}</span>}
      </div>
    </div>
  )
}
