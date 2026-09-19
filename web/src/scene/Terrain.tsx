import { useEffect, useMemo } from 'react'
import { BufferAttribute, Color, PlaneGeometry } from 'three'
import type { Scene } from '@app/shared'
import { paletteOf } from './Environment.tsx'
import { heightAt } from './terrain-math.ts'
import { BIOME_COLOR, TERRAIN, TERRAIN_MESH } from './presets.ts'

export function Terrain({ scene }: { scene: Scene }) {
  const { terrain, zones, bounds, environment } = scene
  const p = paletteOf(environment)
  // Only ground zones change the mesh; key on their geometry so a new object doesn't rebuild the verts.
  const zoneKey = zones.filter((z) => z.elevation === 0).map((z) => `${z.center}:${z.radius}`).join('|')

  const geometry = useMemo(() => {
    const { segments, skirtFactor, paletteWeight, valley, peak, heightScale, edge } = TERRAIN_MESH
    const size = bounds.size * skirtFactor
    const g = new PlaneGeometry(size, size, segments, segments)
    g.rotateX(-Math.PI / 2) // now vertices are in world XZ
    const pos = g.attributes.position
    const base = new Color(BIOME_COLOR[terrain.biome]).lerp(new Color(p.ground), paletteWeight)
    const low = base.clone().multiplyScalar(valley.darken).lerp(new Color(p.accent), valley.accentMix)
    const high = base.clone().lerp(new Color(p.sky), peak.skyMix)
    const colors = new Float32Array(pos.count * 3)
    const c = new Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      let y = heightAt(x, z, terrain, zones)
      // squircle distance → rounded island; wobble from the height noise roughens the coastline
      const half = bounds.size / 2
      const d = ((x / half) ** 4 + (z / half) ** 4) ** 0.25 + (heightAt(x, z, terrain, []) / TERRAIN.maxHeight) * edge.wobble
      if (d > edge.start) {
        const k = Math.min(1, (d - edge.start) / (edge.end - edge.start))
        y = y * (1 - k) - edge.drop * k * k
      }
      pos.setY(i, y)
      const t = Math.min(1, Math.max(0, y / heightScale + 0.5))
      c.copy(low).lerp(high, t)
      colors.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain.biome, terrain.heightVariation, terrain.seed, bounds.size, p.ground, p.accent, p.sky, zoneKey])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  )
}
