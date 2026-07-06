import type { ExpressionSpecification } from 'maplibre-gl'

import { Delaunay } from 'd3-delaunay'
import type { FeatureCollection } from 'geojson'

import type { MapModeInfo } from '../api/types'

/** Rendering vocabulary for map overlay modes — keeps ModeLayers dumb. */

/** Green -> amber (existing token) -> red over a 0..1 feature property. */
export function rampExpression(prop: string): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['get', prop],
    0,
    '#2fbf71',
    0.5,
    '#f5b84c',
    1,
    '#e5484d',
  ]
}

/** Features the LLM could not score render gray, never a fake color. */
export const NO_DATA_COLOR = '#64748b'

/** Property to color by right now (traffic stores h0..h23). */
export function activeProp(mode: MapModeInfo, hour: number): string {
  return mode.temporal ? `${mode.value_prop}${hour}` : mode.value_prop
}

/** Wider than the base style's roads so mode colors visually own them. */
export const MODE_ROAD_WIDTH: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  10,
  1.2,
  13,
  3,
  16,
  6,
]


// --- Root-growth reveal for line modes -----------------------------------------

const KM_PER_DEG_LAT = 110.6

function kmBetween(center: [number, number], pt: [number, number]): number {
  const kmPerDegLng = 111.3 * Math.cos((center[1] * Math.PI) / 180)
  const dx = (pt[0] - center[0]) * kmPerDegLng
  const dy = (pt[1] - center[1]) * KM_PER_DEG_LAT
  return Math.hypot(dx, dy)
}

type AnyFC = FeatureCollection

/**
 * Cut every street into ~300 m pieces, each stamped with `_dist` (km from the
 * center to the piece's midpoint). An expanding reveal radius then shows exactly
 * the pieces inside the circle — long streets appear progressively, like a wave.
 * Returns [segmented collection, max distance].
 */
export function segmentizeLines(fc: AnyFC, center: [number, number]): [AnyFC, number] {
  const SEG_KM = 0.3
  let max = 0
  const out: any[] = []

  for (const f of fc.features) {
    const geom = f.geometry as any
    const lines: number[][][] =
      geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates
    for (const line of lines) {
      let piece: number[][] = [line[0]]
      let acc = 0
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1] as [number, number]
        const b = line[i] as [number, number]
        acc += kmBetween(a, b)
        piece.push(line[i])
        if (acc >= SEG_KM || i === line.length - 1) {
          const mid = piece[Math.floor(piece.length / 2)] as [number, number]
          const dist = Math.round(kmBetween(center, mid) * 100) / 100
          max = Math.max(max, dist)
          out.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: piece },
            properties: { ...f.properties, _dist: dist },
          })
          piece = [line[i]]
          acc = 0
        }
      }
    }
  }
  return [{ type: 'FeatureCollection', features: out } as AnyFC, max]
}

/** Pieces inside the reveal radius are fully visible; a thin 150 m front softens the pop. */
export function revealOpacity(radiusKm: number, maxOpacity: number): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['get', '_dist'],
    Math.max(radiusKm - 0.15, 0),
    maxOpacity,
    Math.max(radiusKm, 0.001),
    0,
  ]
}

// --- Population gradient (zoom-stable raster) --------------------------------------

function rampColor(v: number): [number, number, number] {
  // green -> amber -> red, same stops as rampExpression
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)
  if (v <= 0.5) {
    const t = v / 0.5
    return [lerp(47, 245, t), lerp(191, 184, t), lerp(113, 76, t)]
  }
  const t = (v - 0.5) / 0.5
  return [lerp(245, 229, t), lerp(184, 72, t), lerp(76, 77, t)]
}

export interface DensityImage {
  url: string
  /** [tl, tr, br, bl] as [lng, lat] — for a MapLibre image source. */
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
  /** Convex hull of the districts — a clean approximate city border. */
  hull: [number, number][]
  /** Boundary rings actually used for clipping (real admin border or hull). */
  rings: [number, number][][]
  /** Vector mosaic grout (crisp at any zoom, replaces raster grout). */
  grout: FeatureCollection
}

/** Andrew's monotone chain. Points as [lng, lat]. */
function convexHull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: [number, number][] = []
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

/**
 * Clip segment a→b to the inside of the boundary rings. Returns the inside
 * sub-segments — correct for concave boundaries (unlike a midpoint test, which
 * drops edges whose middle bulges into a notch).
 */
function clipSegment(
  a: [number, number],
  b: [number, number],
  rings: number[][][],
  inside: (x: number, y: number) => boolean,
): [number, number][][] {
  const ts = [0, 1]
  const [ax, ay] = a
  const dx = b[0] - ax
  const dy = b[1] - ay
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [cx, cy] = ring[i]
      const ex = ring[i + 1][0] - cx
      const ey = ring[i + 1][1] - cy
      const denom = dx * ey - dy * ex
      if (Math.abs(denom) < 1e-12) continue
      const t = ((cx - ax) * ey - (cy - ay) * ex) / denom
      const u = ((cx - ax) * dy - (cy - ay) * dx) / denom
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t)
    }
  }
  ts.sort((p, q) => p - q)
  const pieces: [number, number][][] = []
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i]
    const t1 = ts[i + 1]
    if (t1 - t0 < 1e-9) continue
    const mt = (t0 + t1) / 2
    if (!inside(ax + dx * mt, ay + dy * mt)) continue
    pieces.push([
      [ax + dx * t0, ay + dy * t0],
      [ax + dx * t1, ay + dy * t1],
    ])
  }
  return pieces
}

/** Ray-cast point-in-ring. */
function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Deterministic PRNG — the mosaic must not reshuffle between renders. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Voronoi mosaic over the city: the REAL administrative boundary (feature
 * tagged `_boundary`, hull fallback) is sliced into irregular ~350 m pieces,
 * each flat-colored by the interpolated density at its seed. Rasterized once
 * in geographic space -> zoom-stable image source.
 */
export function densityImage(fc: AnyFC, valueProp: string): DensityImage | null {
  const pts: { x: number; y: number; v: number }[] = []
  const boundaryRings: number[][][] = []
  const districtPts: [number, number][] = []

  for (const f of fc.features) {
    const geom = f.geometry as any
    const polys: number[][][][] =
      geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []
    if (f.properties?._boundary) {
      for (const poly of polys) if (poly[0]) boundaryRings.push(poly[0])
      continue
    }
    for (const poly of polys) {
      for (const ring of poly) for (const pt of ring) districtPts.push(pt as [number, number])
    }
    const v = f.properties?.[valueProp]
    if (typeof v !== 'number') continue
    let sx = 0
    let sy = 0
    let n = 0
    const scan = (coords: any): void => {
      if (typeof coords[0] === 'number') {
        sx += coords[0]
        sy += coords[1]
        n += 1
      } else {
        for (const c of coords) scan(c)
      }
    }
    scan(geom.coordinates)
    if (n) pts.push({ x: sx / n, y: sy / n, v })
  }
  if (!pts.length) return null

  // Real admin boundary, else districts' hull.
  const rings = boundaryRings.length ? boundaryRings : [convexHull(districtPts)]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  const padX = (maxX - minX) * 0.03
  const padY = (maxY - minY) * 0.03
  minX -= padX; maxX += padX; minY -= padY; maxY += padY

  const midLat = (minY + maxY) / 2
  const kmX = 111.3 * Math.cos((midLat * Math.PI) / 180)
  const widthKm = (maxX - minX) * kmX
  const heightKm = (maxY - minY) * KM_PER_DEG_LAT

  // ~650 m cells, jittered grid seeds, only inside the boundary.
  const CELL_KM = 0.65
  const cols = Math.max(8, Math.round(widthKm / CELL_KM))
  const rows = Math.max(8, Math.round(heightKm / CELL_KM))
  const rand = mulberry32(1337)
  const seeds: [number, number][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = minX + ((c + 0.2 + rand() * 0.6) / cols) * (maxX - minX)
      const y = minY + ((r + 0.2 + rand() * 0.6) / rows) * (maxY - minY)
      if (rings.some((ring) => inRing(x, y, ring))) seeds.push([x, y])
    }
  }
  if (seeds.length < 3) return null

  const idw = (x: number, y: number): number => {
    let sw = 0
    let swv = 0
    for (const p of pts) {
      const dx = (x - p.x) * kmX
      const dy = (y - p.y) * KM_PER_DEG_LAT
      const d2 = dx * dx + dy * dy + 0.03
      const w = 1 / (d2 * d2)
      sw += w
      swv += w * p.v
    }
    return Math.max(0, Math.min(1, swv / sw))
  }

  const W = 2048
  const H = Math.round((W * heightKm) / widthKm)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const toPx = ([x, y]: number[]): [number, number] => [
    ((x - minX) / (maxX - minX)) * W,
    ((maxY - y) / (maxY - minY)) * H,
  ]

  // Raster holds only the smooth color FILL. The mosaic grout is emitted as
  // vector geometry (below) so tile edges stay crisp at any zoom.
  const inAnyRing = (x: number, y: number) => rings.some((ring) => inRing(x, y, ring))
  const seg: number[][][] = []
  const seen = new Set<string>()

  const voronoi = Delaunay.from(seeds).voronoi([minX, minY, maxX, maxY])
  for (let i = 0; i < seeds.length; i++) {
    const cell = voronoi.cellPolygon(i)
    if (!cell) continue
    const [r, g, b] = rampColor(idw(seeds[i][0], seeds[i][1]))
    ctx.beginPath()
    cell.forEach((pt, j) => {
      const [cx, cy] = toPx(pt)
      if (j === 0) ctx.moveTo(cx, cy)
      else ctx.lineTo(cx, cy)
    })
    ctx.closePath()
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.72)`
    ctx.fill()

    // Vector grout: each cell edge once (dedup shared edges), clipped to the
    // boundary so it stays inside even across concave notches.
    for (let j = 0; j < cell.length - 1; j++) {
      const a = cell[j] as [number, number]
      const b2 = cell[j + 1] as [number, number]
      const ka = `${a[0].toFixed(5)},${a[1].toFixed(5)}`
      const kb = `${b2[0].toFixed(5)},${b2[1].toFixed(5)}`
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      if (seen.has(key)) continue
      seen.add(key)
      for (const piece of clipSegment(a, b2, rings, inAnyRing)) seg.push(piece)
    }
  }

  // Clip the fill to the real boundary.
  ctx.globalCompositeOperation = 'destination-in'
  ctx.beginPath()
  for (const ring of rings) {
    ring.forEach((pt, i) => {
      const [cx, cy] = toPx(pt)
      if (i === 0) ctx.moveTo(cx, cy)
      else ctx.lineTo(cx, cy)
    })
    ctx.closePath()
  }
  ctx.fill()

  return {
    url: canvas.toDataURL('image/png'),
    coordinates: [
      [minX, maxY],
      [maxX, maxY],
      [maxX, minY],
      [minX, minY],
    ],
    hull: rings[0] as [number, number][],
    rings: rings as [number, number][][],
    grout: {
      type: 'FeatureCollection',
      features: seg.map((s) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: s },
        properties: {},
      })),
    } as FeatureCollection,
  }
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

/** Legend end labels per mode kind of scale. */
export const LEGEND_LABELS: Record<string, [string, string]> = {
  population_density: ['Менше', 'Більше'],
  road_condition: ['Добрий', 'Поганий'],
  traffic: ['Вільно', 'Затор'],
}

/** Static fallback mirroring backend MODE_DESCRIPTORS — lets the switcher
 *  render fully even for cities with no precomputed layers yet. */
export const FALLBACK_MODES: MapModeInfo[] = [
  {
    mode: 'population_density',
    label: 'Щільність населення',
    kind: 'polygon',
    value_prop: 'density',
    temporal: false,
    generated_at: null,
  },
  {
    mode: 'road_condition',
    label: 'Стан доріг',
    kind: 'line',
    value_prop: 'condition',
    temporal: false,
    generated_at: null,
  },
  {
    mode: 'traffic',
    label: 'Трафік за годинами',
    kind: 'line',
    value_prop: 'h',
    temporal: true,
    generated_at: null,
  },
]
