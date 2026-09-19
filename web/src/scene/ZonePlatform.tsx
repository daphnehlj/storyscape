import { useEffect, useMemo } from 'react'
import type { Scene, Zone } from '@app/shared'
import { paletteOf } from './Environment.tsx'
import { cloudBank } from './procedural.ts'
import { heightAt } from './terrain-math.ts'
import { ZONE } from './presets.ts'

type Props = { zone: Zone; scene: Scene; onSelect?: (z: Zone) => void }

const seedOf = (id: string) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0)

export function ZonePlatform({ zone, scene, onSelect }: Props) {
  const [cx, cz] = zone.center
  const r = zone.radius
  const click = onSelect && ((e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect(zone) })

  if (zone.elevation === 0) {
    const { ring } = ZONE
    const y = heightAt(cx, cz, scene.terrain, scene.zones) + ring.lift
    return (
      <mesh position={[cx, y, cz]} rotation-x={-Math.PI / 2} onClick={click}>
        <ringGeometry args={[r - ring.width, r, ring.segments]} />
        <meshBasicMaterial color={ring.color} transparent opacity={ring.opacity} depthWrite={false} />
      </mesh>
    )
  }

  if (zone.platform === 'rock') {
    const { rock } = ZONE
    return (
      <mesh position={[cx, zone.elevation - rock.thickness / 2, cz]} onClick={click} castShadow receiveShadow>
        <cylinderGeometry args={[r, r * rock.taper, rock.thickness, rock.segments]} />
        <meshStandardMaterial color={rock.color} flatShading />
      </mesh>
    )
  }

  return <CloudPlatform zone={zone} scene={scene} onClick={click} />
}

/** 'cloud': top of the bank sits at zone.elevation so snapped objects rest on it. */
function CloudPlatform({ zone, scene, onClick }: { zone: Zone; scene: Scene; onClick?: (e: { stopPropagation: () => void }) => void }) {
  const p = paletteOf(scene.environment)
  const mesh = useMemo(() => cloudBank(zone.radius, seedOf(zone.id), p), [zone.radius, zone.id, p.sky, p.ground, p.accent])
  useEffect(() => () => mesh.geometry.dispose(), [mesh])
  return (
    <group position={[zone.center[0], zone.elevation, zone.center[1]]} onClick={onClick}>
      <primitive object={mesh} receiveShadow />
    </group>
  )
}
