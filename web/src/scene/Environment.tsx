import { Environment as SkyboxEnv, GradientTexture, Sparkles } from '@react-three/drei'
import { Suspense } from 'react'
import { BackSide, Color } from 'three'
import type { Scene } from '@app/shared'
import { ATMOSPHERE, SUN } from './presets.ts'

type Env = Scene['environment']

/** [0] sky/horizon, [1] ground, [2] accent — the three colours everything atmospheric derives from. */
export type Palette = { sky: string; ground: string; accent: string }

const mix = (a: string, b: string, t: number, mul = 1) =>
  '#' + new Color(a).lerp(new Color(b), t).multiplyScalar(mul).getHexString()

/** palette: [0] sky/horizon, [1] ground, [2] accent/zenith — as sent by the agent. */
export function paletteOf(env: Env): Palette {
  const [sky, ground, accent] = env.palette
  return { sky, ground, accent }
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
  const { shadow, skyDome, sunDisc, skybox, sparkles } = ATMOSPHERE
  const sky = env.skybox?.status === 'ready' && env.skybox.url ? env.skybox.url : null
  const sunPos = a.sun.dir.map((v) => v * size) as [number, number, number]
  const discPos = a.sun.dir.map((v) => v * size * sunDisc.distanceFactor) as [number, number, number]
  const disc = new Color(a.sun.color).multiplyScalar(sunDisc.brightness)
  return (
    <>
      <fogExp2 attach="fog" args={[a.horizon, a.fog]} />
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
      {sky ? (
        // generated panorama: background + image-based lighting so models pick up its colours
        <Suspense fallback={null}>
          <SkyboxEnv files={sky} background backgroundBlurriness={skybox.backgroundBlurriness} backgroundIntensity={skybox.backgroundIntensity} environmentIntensity={skybox.environmentIntensity} />
        </Suspense>
      ) : (
        <>
          <color attach="background" args={[a.horizon]} />
          <mesh scale={size * skyDome.scaleFactor}>
            <sphereGeometry args={[1, 24, 16]} />
            <meshBasicMaterial side={BackSide} fog={false}>
              <GradientTexture stops={skyDome.stops} colors={[a.zenith, a.horizon, a.horizon, a.zenith]} />
            </meshBasicMaterial>
          </mesh>
        </>
      )}
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
