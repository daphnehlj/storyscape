import { useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three'
import type { Scatter as ScatterT, Scene } from '@app/shared'
import { assetUrl, useLibrary, useNormalizedModel } from './assets.ts'
import { groundY } from './terrain-math.ts'
import { scatterPoints, type Placement } from './scatter-math.ts'

export function Scatter({ scatter, scene }: { scatter: ScatterT; scene: Scene }) {
  const lib = useLibrary()
  const zone = scene.zones.find((z) => z.id === scatter.zoneId)
  // ponytail: re-rolls if an object is later added to this zone (points shift). Freeze on first compute if that jump looks bad.
  const points = useMemo(
    () => (zone ? scatterPoints(scatter, zone, scene.objects, (x, z) => groundY(x, z, scene.terrain, scene.zones, zone)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scatter.id, scatter.seed, scatter.count, zone?.id, scene.objects.length, scene.terrain.seed, scene.terrain.heightVariation],
  )
  if (!zone) return null
  return (
    <>
      {[...new Set(scatter.assetIds)].map((id) => { // ids may repeat to weight the draw
        const url = assetUrl(id, scene.assets, lib)
        const mine = points.filter((p) => p.assetId === id)
        return url && mine.length ? <InstancedModel key={id} url={url} points={mine} shadows={zone.elevation === 0} /> : null
      })}
    </>
  )
}

/** One InstancedMesh per sub-mesh of the model. Unit height; per-instance scale = target height. */
export function InstancedModel({ url, points, shadows }: { url: string; points: Placement[]; shadows: boolean }) {
  const model = useNormalizedModel(url, 1, shadows)
  const meshes = useMemo(() => {
    const out: Mesh[] = []
    model.traverse((o) => { if (o instanceof Mesh) out.push(o) })
    return out
  }, [model])
  return <>{meshes.map((m, i) => <Part key={i} mesh={m} points={points} shadows={shadows} />)}</>
}

const UP = new Vector3(0, 1, 0)

function Part({ mesh, points, shadows }: { mesh: Mesh; points: Placement[]; shadows: boolean }) {
  const ref = useRef<InstancedMesh>(null!)
  useLayoutEffect(() => {
    const place = new Matrix4(), m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3()
    points.forEach((pt, i) => {
      place.compose(p.set(...pt.position), q.setFromAxisAngle(UP, pt.rotationY), s.setScalar(pt.scale))
      ref.current.setMatrixAt(i, m.multiplyMatrices(place, mesh.matrixWorld)) // matrixWorld = normalization
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere() // else the instanced mesh gets frustum-culled by its origin-centered base sphere
  }, [points, mesh])
  return <instancedMesh ref={ref} args={[mesh.geometry, mesh.material, points.length]} castShadow={shadows} receiveShadow={shadows} />
}
