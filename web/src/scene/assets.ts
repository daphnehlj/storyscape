import { use, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Box3, Group, Mesh, Object3D, Vector3 } from 'three'
import type { Scene } from '@app/shared'
import { buildProcedural, type Palette } from './procedural.ts'

export type LibraryEntry = { id: string; file?: string; procedural?: boolean; tags: string[]; defaultSize: number; description: string }

// Module-scope fetch is fine: this module only ever loads inside the ssr:false boundary.
const libraryPromise: Promise<Record<string, LibraryEntry>> = fetch('/assets/library/library.json')
  .then((r) => r.json())
  .then((list: LibraryEntry[]) => Object.fromEntries(list.map((e) => [e.id, e])))

/** Suspends until library.json is loaded (once per page). */
export function useLibrary() {
  return use(libraryPromise)
}

export const PROC_PREFIX = 'proc:'

/**
 * What to draw for an asset *right now*: a .glb URL, or `proc:<id>` for a procedural model.
 * Generated assets fall back to their library stand-in until ready.
 */
export function assetUrl(assetId: string, assets: Scene['assets'], lib: Record<string, LibraryEntry>): string | null {
  const ref = assets[assetId]
  if (!ref) return null
  if (ref.source === 'generated') {
    if (ref.status === 'ready' && ref.url) return ref.url
    return assetUrl(ref.fallbackAssetId, assets, lib)
  }
  const entry = lib[ref.id]
  if (!entry) return null
  if (entry.procedural) return PROC_PREFIX + entry.id
  return entry.file ? `/assets/library/${entry.file}` : null
}

/** Bounding-box height === size, origin at bottom-center, shadows on. */
function normalize(model: Object3D, size: number, castShadow = true): Group {
  const box = new Box3().setFromObject(model)
  const h = box.max.y - box.min.y || 1
  model.scale.setScalar(size / h)
  box.setFromObject(model)
  const c = box.getCenter(new Vector3())
  model.position.set(-c.x, -box.min.y, -c.z)
  model.traverse((o) => {
    if (o instanceof Mesh) { o.castShadow = castShadow; o.receiveShadow = true }
  })
  const g = new Group()
  g.add(model)
  g.updateMatrixWorld(true) // so children's matrixWorld includes normalization (Scatter relies on this)
  return g
}

/** Load a .glb and normalize it. useGLTF caches the source scene by url; we clone so instances don't share transforms. */
export function useGltfModel(url: string, size: number, castShadow = true): Group {
  const { scene } = useGLTF(url)
  return useMemo(() => normalize(scene.clone(true), size, castShadow), [scene, size, castShadow])
}

/** Build a procedural model for the palette and normalize it. */
export function useProceduralModel(id: string, size: number, palette: Palette, castShadow = true): Group {
  return useMemo(
    () => normalize(buildProcedural(id, palette) ?? new Group(), size, castShadow),
    [id, size, palette.sky, palette.ground, palette.accent, castShadow],
  )
}
