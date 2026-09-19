import { GradientTexture, Sparkles } from '@react-three/drei'
import { BackSide, Color } from 'three'
import type { Scene } from '@app/shared'
import { ATMOSPHERE, SUN } from './presets.ts'

type Env = Scene['environment']

const mix = (a: string, b: string, t: number, mul = 1) =>
  '#' + new Color(a).lerp(new Color(b), t).multiplyScalar(mul).getHexString()

/** Every atmospheric color comes from palette: [0] sky/horizon, [1] ground, [2] accent/zenith. */
export function atmosphere(env: Env) {
  const A = ATMOSPHERE
  const p = env.palette ?? A.defaultPalette
  const night = env.timeOfDay === 'night'
  return {
    sun: SUN[env.timeOfDay],
    ground: p[1] ?? p[0],
    horizon: mix(p[0], '#ffffff', A.horizon.whiten, night ? A.horizon.nightDim : 1),
    zenith: mix(p[2] ?? p[0], A.zenith.deep, night ? A.zenith.nightMix : A.zenith.dayMix),
    fog: A.fog.base + env.fogDensity * A.fog.perDensity + (env.weather === 'fog' ? A.fog.weatherFog : 0),
  }
}

export function Environment({ scene }: { scene: Scene }) {
  const env = scene.environment
  const size = scene.bounds.size
  const a = atmosphere(env)
  const { shadow, skyDome, sparkles } = ATMOSPHERE
  const sunPos = a.sun.dir.map((v) => v * size) as [number, number, number]
  return (
    <>
      <fogExp2 attach="fog" args={[a.horizon, a.fog]} />
      <color attach="background" args={[a.horizon]} />
      <directionalLight
        position={sunPos}
        color={a.sun.color}
        intensity={a.sun.intensity}
        castShadow
        shadow-mapSize={[shadow.mapSize, shadow.mapSize]}
        shadow-bias={shadow.bias}
        shadow-camera-left={-size / 2}
        shadow-camera-right={size / 2}
        shadow-camera-top={size / 2}
        shadow-camera-bottom={-size / 2}
        shadow-camera-near={shadow.near}
        shadow-camera-far={size * shadow.farFactor}
      />
      <hemisphereLight args={[a.zenith, a.ground, a.sun.ambient]} />
      {/* gradient sky dome; replaced by the skybox when it's ready (Task 13) */}
      <mesh scale={size * skyDome.scaleFactor}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial side={BackSide} fog={false}>
          <GradientTexture stops={skyDome.stops} colors={[a.zenith, a.horizon, a.horizon, a.zenith]} />
        </meshBasicMaterial>
      </mesh>
      {/* floating light motes */}
      <Sparkles count={sparkles.count} scale={[size, sparkles.height, size]} position-y={sparkles.y} size={sparkles.size} speed={sparkles.speed} color={a.horizon} />
    </>
  )
}
