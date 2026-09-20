import { useMemo } from 'react'
import type { Scene, Zone } from '@app/shared'
import { useLibrary } from './assets.ts'
import { InstancedModel } from './Scatter.tsx'
import { mulberry32, type Placement } from './scatter-math.ts'
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
      <mesh position={[cx, y, cz]} rotation-x={-Math.PI / 2} onClick={click} visible={ring.show}>
        <ringGeometry args={[r - ring.width, r, ring.segments]} />
        <meshBasicMaterial color={ring.color} transparent opacity={ring.opacity} depthWrite={false} />
      </mesh>
    )
  }

  return zone.platform === 'rock' ? <RockPlatform zone={zone} onClick={click} /> : <CloudPlatform zone={zone} onClick={click} />
}

type PlatformProps = { zone: Zone; onClick?: (e: { stopPropagation: () => void }) => void }

function RockPlatform({ zone, onClick: click }: PlatformProps) {
  const [cx, cz] = zone.center
  const r = zone.radius
  const { rock } = ZONE
  // no shadows: a platform 40 m up would stamp a black shape on the ground (VSM also draws receivers into the map)
  return (
      <mesh position={[cx, zone.elevation - rock.thickness / 2, cz]} onClick={click}>
        <cylinderGeometry args={[r, r * rock.taper, rock.thickness, rock.segments]} />
        <meshStandardMaterial color={rock.color} flatShading />
      </mesh>
  )
}

/** 'cloud': a bank of the cloud library model filling the zone disc, tops just above zone.elevation so snapped objects nestle in. */
function CloudPlatform({ zone, onClick }: PlatformProps) {
  const lib = useLibrary()
  const points = useMemo(() => cloudPuffs(zone), [zone.id, zone.radius, zone.elevation, zone.center[0], zone.center[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  const entry = lib[ZONE.cloud.asset]
  if (!entry) return <RockPlatform zone={zone} onClick={onClick} /> // library without a cloud model: still give the zone a floor
  return (
    <group onClick={onClick}>
      <InstancedModel url={`/assets/library/${entry.file}`} points={points} shadows={false} />
    </group>
  )
}

function cloudPuffs(zone: Zone): Placement[] {
  const { puffsPerMeter, minPuffs, minRadius, maxRadius, top, spread, asset } = ZONE.cloud
  const rand = mulberry32(seedOf(zone.id))
  const n = Math.max(minPuffs, Math.round(zone.radius * puffsPerMeter))
  const out: Placement[] = []
  const puff = (d: number, a: number, size: number) =>
    out.push({ assetId: asset, position: [zone.center[0] + d * Math.cos(a), zone.elevation + top - size, zone.center[1] + d * Math.sin(a)], rotationY: rand() * Math.PI * 2, scale: size })
  for (let i = 0; i < n; i++) {
    puff(zone.radius * spread * Math.sqrt(rand()), rand() * Math.PI * 2, zone.radius * (minRadius + rand() * (maxRadius - minRadius)) * 2)
  }
  puff(0, 0, zone.radius * maxRadius * 2) // guarantee the centre is covered
  return out
}
