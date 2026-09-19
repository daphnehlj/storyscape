import { use, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Box3, Group, Mesh, Vector3 } from 'three'
import type { Scene } from '@app/shared'

export type LibraryEntry = { id: string; file: string; tags: string[]; defaultSize: number; description: string }

// Module-scope fetch is fine: this module only ever loads inside the ssr:false boundary.
const libraryPromise: Promise<Record<string, LibraryEntry>> = fetch('/assets/library/library.json')
  .then((r) => r.json())
  .then((list: LibraryEntry[]) => Object.fromEntries(list.map((e) => [e.id, e])))

/** Suspends until library.json is loaded (once per page). */
export function useLibrary() {
  return use(libraryPromise)
}

/** The URL to draw for an asset *right now*. Generated assets fall back to their library stand-in until ready. */
export function assetUrl(assetId: string, assets: Scene['assets'], lib: Record<string, LibraryEntry>): string | null {
  const ref = assets[assetId]
  if (!ref) return null
  if (ref.source === 'generated') {
    if (ref.status === 'ready' && ref.url) return ref.url
    return assetUrl(ref.fallbackAssetId, assets, lib)
  }
  const entry = lib[ref.id]
  return entry ? `/assets/library/${entry.file}` : null
}

/**
 * Load a .glb and normalize it: bounding-box height === size, origin at bottom-center, shadows on.
 * Returns a fresh Group (useGLTF caches the source scene by url; we clone so instances don't share transforms).
 */
export function useNormalizedModel(url: string, size: number): Group {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    const model = scene.clone(true)
    const box = new Box3().setFromObject(model)
    const h = box.max.y - box.min.y || 1
    model.scale.setScalar(size / h)
    box.setFromObject(model)
    const c = box.getCenter(new Vector3())
    model.position.set(-c.x, -box.min.y, -c.z)
    model.traverse((o) => {
      if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true }
    })
    const g = new Group()
    g.add(model)
    g.updateMatrixWorld(true) // so children's matrixWorld includes normalization (Scatter relies on this)
    return g
  }, [scene, size])
}
