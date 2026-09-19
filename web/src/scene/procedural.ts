import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, ConeGeometry, CylinderGeometry,
  IcosahedronGeometry, Mesh, MeshStandardMaterial, SphereGeometry, TubeGeometry, Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from './scatter-math.ts'
import { PROC, ZONE } from './presets.ts'

/** [0] sky/horizon, [1] ground, [2] accent — same convention as `atmosphere()`. */
export type Palette = { sky: string; ground: string; accent: string }

const MAT = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: PROC.roughness })
const CLOUD_MAT = new MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 1, emissive: '#ffffff', emissiveIntensity: PROC.cloud.glow,
})

type Paint = Color | ((x: number, y: number, z: number) => Color)

/** Vertical colour gradient: `from` at y0, `to` at y1. */
const grad = (from: Color, to: Color, y0: number, y1: number): Paint => {
  const c = new Color()
  return (_x, y) => c.copy(from).lerp(to, Math.min(1, Math.max(0, (y - y0) / (y1 - y0))))
}

/** Non-indexed copy of `g`, transformed and vertex-coloured, ready to merge. */
function part(g: BufferGeometry, color: Paint, x = 0, y = 0, z = 0, s: number | [number, number, number] = 1, ry = 0) {
  const n = g.toNonIndexed()
  g.dispose()
  if (typeof s === 'number') n.scale(s, s, s); else n.scale(...s)
  n.rotateY(ry)
  n.translate(x, y, z)
  const pos = n.attributes.position
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const c = typeof color === 'function' ? color(pos.getX(i), pos.getY(i), pos.getZ(i)) : color
    colors.set([c.r, c.g, c.b], i * 3)
  }
  n.setAttribute('color', new BufferAttribute(colors, 3))
  return n
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const m = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return m
}

const hsl = (base: string, o: { hue: number; sat: number; light: number }) => new Color(base).offsetHSL(o.hue, o.sat, o.light)

// Every builder returns a ~1-unit-tall model standing on y = 0; normalization handles the rest.

function oak(p: Palette) {
  const leaf = hsl(p.ground, PROC.foliage)
  const top = leaf.clone().offsetHSL(0, 0, PROC.foliage.topLight)
  const blobs: [number, number, number, number][] = [[0, 0.68, 0, 0.36], [0.24, 0.56, 0.1, 0.27], [-0.22, 0.6, -0.12, 0.28], [0.04, 0.54, 0.26, 0.24]]
  return merge([
    part(new CylinderGeometry(0.05, 0.09, 0.45, 6), new Color(PROC.bark), 0, 0.22, 0),
    ...blobs.map(([x, y, z, r]) => part(new IcosahedronGeometry(r, 1), grad(leaf, top, 0.3, 1.0), x, y, z)),
  ])
}

function pine(p: Palette) {
  const dark = hsl(p.ground, PROC.pine)
  const top = dark.clone().offsetHSL(0, 0, PROC.pine.topLight)
  const paint = grad(dark, top, 0.1, 1.0)
  return merge([
    part(new CylinderGeometry(0.04, 0.07, 0.4, 6), new Color(PROC.bark), 0, 0.2, 0),
    part(new ConeGeometry(0.32, 0.45, 7), paint, 0, 0.42, 0),
    part(new ConeGeometry(0.25, 0.42, 7), paint, 0, 0.66, 0, 1, 0.3),
    part(new ConeGeometry(0.17, 0.36, 7), paint, 0, 0.86, 0, 1, 0.6),
  ])
}

function bush(p: Palette) {
  const leaf = hsl(p.ground, PROC.foliage)
  const top = leaf.clone().offsetHSL(0, 0, PROC.foliage.topLight)
  const paint = grad(leaf, top, 0, 0.6)
  return merge([
    part(new IcosahedronGeometry(0.32, 1), paint, 0, 0.3, 0),
    part(new IcosahedronGeometry(0.24, 1), paint, 0.28, 0.22, 0.1),
    part(new IcosahedronGeometry(0.22, 1), paint, -0.25, 0.2, -0.15),
  ])
}

function rock(p: Palette) {
  const { base, skyMix, darkBottom, jitter } = PROC.rock
  const g = new IcosahedronGeometry(0.5, 1).toNonIndexed()
  const pos = g.attributes.position
  const v = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i))
    // hash on the position so the duplicated vertices of a non-indexed mesh move together
    const h = Math.abs(Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453) % 1
    v.multiplyScalar(1 + (h - 0.5) * jitter)
    pos.setXYZ(i, v.x, v.y * 0.7, v.z)
  }
  g.translate(0, 0.35, 0)
  const light = new Color(base).lerp(new Color(p.sky), skyMix)
  const dark = light.clone().multiplyScalar(darkBottom)
  return part(g, grad(dark, light, 0, 0.7))
}

/** A cluster of low-poly spheres, flattened underneath, white on top shading to the sky colour below. */
function puffCluster(puffs: [number, number, number, number][], p: Palette) {
  const { bottomSkyMix, flatten } = PROC.cloud
  const bottom = new Color('#ffffff').lerp(new Color(p.sky), bottomSkyMix)
  const white = new Color('#ffffff')
  const lo = Math.min(...puffs.map(([, y, , r]) => y - r))
  const hi = Math.max(...puffs.map(([, y, , r]) => y + r))
  const g = merge(puffs.map(([x, y, z, r]) => part(new SphereGeometry(r, 9, 7), grad(bottom, white, lo, hi), x, y, z)))
  const pos = g.attributes.position
  const floor = lo + (hi - lo) * flatten
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < floor) pos.setY(i, floor + (pos.getY(i) - floor) * 0.25)
  return g
}

function cloudPuff(p: Palette) {
  const g = puffCluster([[0, 0.5, 0, 0.5], [0.45, 0.42, 0.1, 0.38], [-0.45, 0.4, -0.05, 0.35], [0.15, 0.72, -0.2, 0.32], [-0.15, 0.68, 0.2, 0.3], [0.5, 0.55, -0.3, 0.25]], p)
  return g
}

/** Cloud bank for an elevated zone: fills a disc of `radius`, top surface near y = 0. Not normalized. */
export function cloudBank(radius: number, seed: number, p: Palette): Mesh {
  const { puffsPerMeter, minRadius, maxRadius, top, spread } = ZONE.cloud
  const rand = mulberry32(seed)
  const n = Math.max(6, Math.round(radius * puffsPerMeter))
  const puffs: [number, number, number, number][] = []
  for (let i = 0; i < n; i++) {
    const d = radius * spread * Math.sqrt(rand()), a = rand() * Math.PI * 2
    const r = radius * (minRadius + rand() * (maxRadius - minRadius))
    puffs.push([d * Math.cos(a), top - r, d * Math.sin(a), r])
  }
  puffs.push([0, top - radius * maxRadius, 0, radius * maxRadius]) // guarantee the centre is covered
  return new Mesh(puffCluster(puffs, p), CLOUD_MAT)
}

function beanstalk(p: Palette) {
  const { turns, radius, tube, leaves, light } = PROC.beanstalk
  const stalk = hsl(p.ground, PROC.foliage).offsetHSL(0, 0.05, light)
  const tip = stalk.clone().offsetHSL(0, 0, PROC.foliage.topLight)
  const pts: Vector3[] = []
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, a = t * turns * Math.PI * 2
    pts.push(new Vector3(Math.cos(a) * radius * (1 + 0.3 * Math.sin(t * 9)), t, Math.sin(a) * radius))
  }
  const curve = new CatmullRomCurve3(pts)
  const parts = [part(new TubeGeometry(curve, 120, tube, 6, false), grad(stalk, tip, 0, 1))]
  const leaf = hsl(p.ground, PROC.foliage)
  for (let i = 0; i < leaves; i++) {
    const t = 0.08 + (i / leaves) * 0.88
    const at = curve.getPointAt(t)
    const a = Math.atan2(at.z, at.x)
    const out = new Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.06)
    parts.push(part(new IcosahedronGeometry(0.09, 0), grad(leaf, tip, at.y - 0.05, at.y + 0.05), at.x + out.x, at.y, at.z + out.z, [1.6, 0.18, 0.8], -a))
  }
  return merge(parts)
}

export const PROCEDURAL: Record<string, (p: Palette) => BufferGeometry> = {
  oak_tree: oak, pine_tree: pine, bush, rock, cloud_puff: cloudPuff, beanstalk,
}

export function buildProcedural(id: string, p: Palette): Mesh | null {
  const build = PROCEDURAL[id]
  return build ? new Mesh(build(p), id === 'cloud_puff' ? CLOUD_MAT : MAT) : null
}
