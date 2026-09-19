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
