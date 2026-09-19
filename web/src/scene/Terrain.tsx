import { useEffect, useMemo } from 'react'
import { BufferAttribute, Color, PlaneGeometry } from 'three'
import type { Scene } from '@app/shared'
import { heightAt } from './terrain-math.ts'
import { BIOME_COLOR, TERRAIN_MESH } from './presets.ts'

export function Terrain({ scene }: { scene: Scene }) {
  const { terrain, zones, bounds, environment } = scene
  const tint = environment.palette?.[1]
  // Only ground zones change the mesh; key on their geometry so a new object doesn't rebuild 16k verts.
  const zoneKey = zones.filter((z) => z.elevation === 0).map((z) => `${z.center}:${z.radius}`).join('|')

  const geometry = useMemo(() => {
    const { segments, paletteTint, shade } = TERRAIN_MESH
    const g = new PlaneGeometry(bounds.size, bounds.size, segments, segments)
    g.rotateX(-Math.PI / 2) // now vertices are in world XZ
    const pos = g.attributes.position
    const base = new Color(BIOME_COLOR[terrain.biome])
    if (tint) base.lerp(new Color(tint), paletteTint)
    const colors = new Float32Array(pos.count * 3)
    const c = new Color()
    for (let i = 0; i < pos.count; i++) {
      const y = heightAt(pos.getX(i), pos.getZ(i), terrain, zones)
      pos.setY(i, y)
      const t = Math.min(1, Math.max(0, y / shade.heightScale + 0.5))
      c.copy(base).multiplyScalar(shade.min + shade.range * t)
      colors.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain.biome, terrain.heightVariation, terrain.seed, bounds.size, tint, zoneKey])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors flatShading />
    </mesh>
  )
}
