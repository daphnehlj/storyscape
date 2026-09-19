import { GradientTexture, Sparkles } from '@react-three/drei'
import { BackSide, Color } from 'three'
import type { Scene } from '@app/shared'
import { ATMOSPHERE, SUN } from './presets.ts'
import type { Palette } from './procedural.ts'

type Env = Scene['environment']

const mix = (a: string, b: string, t: number, mul = 1) =>
  '#' + new Color(a).lerp(new Color(b), t).multiplyScalar(mul).getHexString()

const HSL = { h: 0, s: 0, l: 0 }
/** Keep an agent-picked colour inside a range that lights well. */
function tame(hex: string): string {
  const { minLightness, maxLightness, maxSaturation } = ATMOSPHERE.paletteClamp
  const c = new Color(hex).getHSL(HSL)
  return '#' + new Color().setHSL(c.h, Math.min(c.s, maxSaturation), Math.min(maxLightness, Math.max(minLightness, c.l))).getHexString()
}

/** palette: [0] sky/horizon, [1] ground, [2] accent/zenith. Falls back to the time-of-day default. */
export function paletteOf(env: Env): Palette {
  const d = ATMOSPHERE.defaultPalette[env.timeOfDay]
  const p = env.palette ?? d
  return { sky: tame(p[0] ?? d[0]), ground: tame(p[1] ?? p[0] ?? d[1]), accent: tame(p[2] ?? p[0] ?? d[2]) }
}

/** Every atmospheric color comes from the palette. */
export function atmosphere(env: Env) {
  const A = ATMOSPHERE
  const p = paletteOf(env)
  const night = env.timeOfDay === 'night'
  return {
    sun: SUN[env.timeOfDay],
    ground: p.ground,
    horizon: mix(p.sky, '#ffffff', A.horizon.whiten, night ? A.horizon.nightDim : 1),
    zenith: mix(p.accent, A.zenith.deep, night ? A.zenith.nightMix : A.zenith.dayMix),
    fog: A.fog.base + env.fogDensity * A.fog.perDensity + (env.weather === 'fog' ? A.fog.weatherFog : 0),
  }
}

export function Environment({ scene }: { scene: Scene }) {
  const env = scene.environment
  const size = scene.bounds.size
  const a = atmosphere(env)
  const { shadow, skyDome, sunDisc, sparkles } = ATMOSPHERE
  const sunPos = a.sun.dir.map((v) => v * size) as [number, number, number]
  const discPos = a.sun.dir.map((v) => v * size * sunDisc.distanceFactor) as [number, number, number]
  const disc = new Color(a.sun.color).multiplyScalar(sunDisc.brightness)
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
        shadow-radius={shadow.radius}
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
      {/* the sun itself: over-bright so bloom gives it a halo */}
      <mesh position={discPos}>
        <sphereGeometry args={[size * sunDisc.radiusFactor, 16, 12]} />
        <meshBasicMaterial color={disc} toneMapped={false} fog={false} />
      </mesh>
      {/* floating light motes */}
      <Sparkles count={sparkles.count} scale={[size, sparkles.height, size]} position-y={sparkles.y} size={sparkles.size} speed={sparkles.speed} color={a.horizon} />
    </>
  )
}
