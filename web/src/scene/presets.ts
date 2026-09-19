/**
 * Every tunable visual constant in the renderer (CLAUDE.md: no numeric literals in rendering code).
 * Tuning pass = edit this file only.
 */

export const CAMERA = {
  position: [0, 60, 160] as [number, number, number],
  target: [0, 25, 0] as [number, number, number], // look slightly up so an elevated zone fits in frame
  fov: 50, near: 0.5, far: 2000,
}

export const POST = {
  resolutionScale: 0.5,
  bloom: { luminanceThreshold: 0.8, luminanceSmoothing: 0.3, intensity: 0.7 },
  vignette: { offset: 0.25, darkness: 0.45 },
  saturation: 0.15,
}

export const TERRAIN = {
  maxHeight: 25, // meters at heightVariation = 1
  baseFrequency: 1 / 40,
  octaves: 4,
}

export const BIOME_COLOR = {
  grassland: '#8ccf66', forest: '#5aa64e', desert: '#e8c98a', snow: '#eef3f8', swamp: '#6f8a4a', beach: '#eadfb0',
} as const

export const TERRAIN_MESH = {
  segments: 160,
  skirtFactor: 4, // mesh is this many times bounds.size so the edge is lost in fog
  paletteWeight: 0.6, // how much palette[1] pulls the biome colour
  valley: { darken: 0.78, accentMix: 0.12 }, // low ground: darker, a touch of the accent colour
  peak: { skyMix: 0.22 }, // high ground: catches the sky colour
  heightScale: 10,
  edge: { start: 1.0, end: 1.8, drop: 14, wobble: 0.35 }, // beyond bounds (fraction of half-size) the land falls away into the sea; wobble roughens the coast
}

export const WATER = {
  fallbackColor: '#5aa0c8',
  sizeFactor: 20, // past the far plane, so the sea ends in fog: must exceed TERRAIN_MESH.skirtFactor or the sunken skirt shows past the sea
  opacity: 0.75, roughness: 0.12, metalness: 0.05,
}

// dir = direction the sun sits in (scaled by world size). Dawn/dusk = low warm sun = the showcase look.
export const SUN = {
  dawn:  { dir: [1, 0.45, -0.5],  color: '#ffd9b0', intensity: 3.2, ambient: 1.1 },
  day:   { dir: [0.6, 0.8, 0.35], color: '#fff6e8', intensity: 2.6, ambient: 1.3 },
  dusk:  { dir: [-1, 0.35, 0.5],  color: '#ffb38a', intensity: 3.0, ambient: 1.0 },
  night: { dir: [0.3, 0.6, -0.4], color: '#93a8e6', intensity: 0.6, ambient: 0.35 },
} as const

export const ATMOSPHERE = {
  defaultPalette: ['#ffc7a0', '#8ccf66', '#9db8ea'],
  horizon: { whiten: 0.3, nightDim: 0.3 },
  zenith: { deep: '#1a2540', dayMix: 0.2, nightMix: 0.85 },
  fog: { base: 0.0004, perDensity: 0.004, weatherFog: 0.004 }, // exp2: ~10% haze at 150m, ~50% at 500m for density 0.25
  shadow: { mapSize: 2048, bias: -0.0005, radius: 6, near: 1, farFactor: 3 },
  skyDome: { scaleFactor: 4, stops: [0, 0.47, 0.53, 1] },
  sunDisc: { distanceFactor: 1.8, radiusFactor: 0.09, brightness: 3.5 }, // bloom does the rest
  sparkles: { count: 300, height: 60, y: 30, size: 3, speed: 0.3 },
}

export const ZONE = {
  ring: { lift: 0.3, width: 0.6, segments: 48, color: '#ffffff', opacity: 0.15 },
  rock: { thickness: 6, taper: 0.6, segments: 12, color: '#6b6f7a' },
  cloud: { puffsPerMeter: 0.8, minRadius: 0.16, maxRadius: 0.32, top: 3, spread: 0.85 }, // radii as fraction of zone radius
}

export const SCATTER = {
  centerClearance: 3, // metres kept free at the zone center
  objectClearance: 1.5, // extra metres around each placed object (added to size/2)
  maxTriesFactor: 10, // give up after count * this attempts
}

// Procedural models: colours derive from the palette so every model in a world agrees.
export const PROC = {
  roughness: 0.85,
  bark: '#6b4a34',
  foliage: { hue: 0, sat: 0.08, light: -0.06, topLight: 0.18 }, // offsetHSL from palette ground; gradient toward light at the top
  pine: { hue: -0.03, sat: 0.02, light: -0.16, topLight: 0.14 },
  rock: { base: '#8f8d96', skyMix: 0.25, darkBottom: 0.7, jitter: 0.22 },
  cloud: { bottomSkyMix: 0.45, glow: 0.35, flatten: 0.3 },
  beanstalk: { turns: 4, radius: 0.05, tube: 0.035, leaves: 11, light: -0.1 },
}
