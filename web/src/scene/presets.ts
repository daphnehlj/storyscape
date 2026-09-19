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
