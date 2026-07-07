import type { ExpressionSpecification } from 'maplibre-gl'

import { Delaunay } from 'd3-delaunay'
import type { FeatureCollection } from 'geojson'
import polygonClipping from 'polygon-clipping'

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

export interface DensityMosaic {
  /** Voronoi cells (clipped to the boundary), each with `color` and a random
   *  `delay` 0..1 that staggers its fade-in. Fully vector -> crisp at any zoom. */
  cells: FeatureCollection
  /** Boundary rings used for clipping (real admin border or hull). */
  rings: [number, number][][]
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
 * tagged `_boundary`, hull fallback) is sliced into irregular ~650 m cells,
 * each clipped to the boundary and flat-colored by the interpolated density.
 * Fully vector (no raster) -> crisp at any zoom, and each cell carries a random
 * `delay` so the frontend can stagger a fade-in.
 */
export function densityMosaic(fc: AnyFC, valueProp: string): DensityMosaic | null {
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

  // Boundary as polygon-clipping geometry (each ring an outer polygon).
  // The whole boundary as ONE MultiPolygon (each ring an outer polygon) — the
  // city can be several disjoint parts, so clip against their UNION, not each.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boundaryMP: any = rings.map((ring) => {
    const r = ring.map((p) => [p[0], p[1]])
    if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0])
    return [r]
  })

  const voronoi = Delaunay.from(seeds).voronoi([minX, minY, maxX, maxY])
  const features: FeatureCollection['features'] = []
  for (let i = 0; i < seeds.length; i++) {
    const cell = voronoi.cellPolygon(i)
    if (!cell) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cellPoly: any = [cell.map((p) => [p[0], p[1]])]
    const [r, g, b] = rampColor(idw(seeds[i][0], seeds[i][1]))
    const color = `rgb(${r}, ${g}, ${b})`
    const delay = Math.round(rand() * 1000) / 1000

    // Clip the cell to the boundary — correct across concave notches.
    let clipped: number[][][][] = []
    try {
      clipped = polygonClipping.intersection(cellPoly, boundaryMP) as unknown as number[][][][]
    } catch {
      clipped = []
    }
    for (const poly of clipped) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: poly },
        properties: { color, delay },
      })
    }
  }
  if (!features.length) return null

  return {
    cells: { type: 'FeatureCollection', features },
    rings: rings as [number, number][][],
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
