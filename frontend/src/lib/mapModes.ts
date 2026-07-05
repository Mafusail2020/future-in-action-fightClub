import type { ExpressionSpecification } from 'maplibre-gl'

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
