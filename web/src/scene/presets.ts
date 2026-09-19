/**
 * Every tunable visual constant in the renderer (CLAUDE.md: no numeric literals in rendering code).
 * Tuning pass = edit this file only.
 */

export const CAMERA = { position: [0, 60, 140] as [number, number, number], fov: 50, near: 0.5, far: 2000 }

export const POST = {
  resolutionScale: 0.5,
  bloom: { luminanceThreshold: 0.85, luminanceSmoothing: 0.2, intensity: 0.6 },
  vignette: { offset: 0.3, darkness: 0.5 },
}

export const TERRAIN = {
  maxHeight: 25, // meters at heightVariation = 1
  baseFrequency: 1 / 40,
  octaves: 4,
}

export const BIOME_COLOR = {
  grassland: '#6f9e4c', forest: '#3f7a3a', desert: '#d9b46a', snow: '#e6ecf1', swamp: '#5d6b3a', beach: '#e2d3a1',
} as const

export const TERRAIN_MESH = {
  segments: 128,
  paletteTint: 0.3, // how much palette[1] pulls the biome colour
  shade: { min: 0.85, range: 0.15, heightScale: 20 }, // darker valleys, lighter peaks
}

export const WATER = {
  fallbackColor: '#5aa0c8',
  sizeFactor: 1.2, // plane overhangs the terrain so edges never show
  opacity: 0.8, roughness: 0.15, metalness: 0.1,
}

// dir = direction the sun sits in (scaled by world size). Dawn/dusk = low warm sun = the showcase look.
export const SUN = {
  dawn:  { dir: [1, 0.25, -0.6],  color: '#ffb070', intensity: 2.2, ambient: 0.6 },
  day:   { dir: [0.5, 1, 0.3],    color: '#fff4e0', intensity: 2.6, ambient: 0.8 },
  dusk:  { dir: [-1, 0.2, 0.5],   color: '#ff8a5a', intensity: 2.0, ambient: 0.5 },
  night: { dir: [0.3, 0.6, -0.4], color: '#8fa3e0', intensity: 0.35, ambient: 0.15 },
} as const

export const ATMOSPHERE = {
  defaultPalette: ['#e8b86d', '#7a9a4a', '#c9d6e8'],
  horizon: { whiten: 0.35, nightDim: 0.3 },
  zenith: { deep: '#1a2540', dayMix: 0.25, nightMix: 0.85 },
  fog: { base: 0.0005, perDensity: 0.005, weatherFog: 0.004 }, // exp2: ~13% haze at 150m for density 0.4
  shadow: { mapSize: 2048, bias: -0.0005, near: 1, farFactor: 3 },
  skyDome: { scaleFactor: 4, stops: [0, 0.45, 0.55, 1] },
  sparkles: { count: 300, height: 60, y: 30, size: 3, speed: 0.3 },
}

export const ZONE = {
  ring: { lift: 0.3, width: 0.6, segments: 48, color: '#ffffff', opacity: 0.15 },
  rock: { thickness: 6, taper: 0.6, segments: 12, color: '#6b6f7a' },
  cloud: { sink: 4, height: 6, segments: 60, volumeFactor: 0.6, fadeFactor: 8, limit: 400, color: '#ffffff' },
}

export const SCATTER = {
  centerClearance: 3, // metres kept free at the zone center
  objectClearance: 1.5, // extra metres around each placed object (added to size/2)
  maxTriesFactor: 10, // give up after count * this attempts
}
