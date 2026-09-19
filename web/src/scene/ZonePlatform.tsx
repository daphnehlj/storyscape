import { Cloud, Clouds } from '@react-three/drei'
import type { Scene, Zone } from '@app/shared'
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

  // 'cloud': top of the volume sits at zone.elevation so snapped objects rest on it
  const { cloud } = ZONE
  return (
    <group position={[cx, zone.elevation - cloud.sink, cz]} onClick={click}>
      <Clouds texture="/assets/cloud.png" limit={cloud.limit}>
        <Cloud seed={seedOf(zone.id)} segments={cloud.segments} bounds={[r, cloud.height, r]} volume={r * cloud.volumeFactor} concentrate="inside" color={cloud.color} fade={r * cloud.fadeFactor} />
      </Clouds>
    </group>
  )
}
