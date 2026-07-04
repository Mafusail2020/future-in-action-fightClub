/** Mirrors of backend/app/schemas — keep in sync by hand. */

import type { FeatureCollection, Geometry } from 'geojson'

export interface CityOut {
  id: string
  slug: string | null
  name: string
  country: string
  lat: number | null
  lng: number | null
  population: number | null
  case_count: number
}

export interface CaseSummaryOut {
  id: string
  title: string
  problem_domain: string
  year_start: number | null
  year_end: number | null
  outcome: string | null
}

export interface CaseDetailOut extends CaseSummaryOut {
  problem_summary: string | null
  solution_summary: string | null
  cost_estimate: string | null
  source_urls: string[]
  full_text: string | null
  city: { id: string; name: string; country: string; population: number | null }
}

export interface RaionOut {
  id: string
  slug: string
  name_uk: string
  name_en: string | null
  centroid_lat: number | null
  centroid_lng: number | null
  boundary_geojson: Geometry | null
  population: number | null
}

export interface Citation {
  n: number
  chunk_id: string
  source_type: 'document' | 'digest' | 'metric' | 'feature' | 'solution_case'
  title: string
  url: string | null
  snippet: string
  raion: string | null
  city: string | null
  published_at: string | null
}

export interface MapAction {
  type: 'highlight_raion' | 'point'
  label: string
  geojson: FeatureCollection
  citation_ns: number[]
}

export interface Viewport {
  center: [number, number] // [lng, lat]
  zoom: number
}

export interface MapPayload {
  actions: MapAction[]
  viewport: Viewport
}

export type ModelAlias = 'sonnet' | 'haiku'

export interface ChatFinal {
  session_id: string
  answer: string
  citations: Citation[]
  map: MapPayload
  meta: { latency_ms: number; model: ModelAlias }
}

export type StreamEvent =
  | { event: 'token'; data: { text: string } }
  | { event: 'status'; data: { tool: string } }
  | { event: 'final'; data: ChatFinal }
  | { event: 'error'; data: { session_id: string; message: string } }
