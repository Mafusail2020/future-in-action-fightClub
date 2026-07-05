/** Mirrors of backend/app/domain/models.py — keep in sync by hand. */

export type Category =
  | 'transport'
  | 'energy'
  | 'housing'
  | 'water'
  | 'waste'
  | 'safety'
  | 'health'
  | 'environment'
  | 'digital'
  | 'governance'
  | 'economy'
  | 'climate_resilience'

export interface City {
  id: string
  name: string
  country: string
  region: string | null
  lat: number
  lng: number
  population: number | null
  area_km2: number | null
  climate: string | null
  solution_count: number | null
}

export interface Solution {
  id: string
  city_id: string
  category: Category
  title: string
  problem: string
  solution: string
  outcome: string | null
  cost: string | null
  year_start: number | null
  year_end: number | null
  source_urls: string[]
  tags: string[]
  city: City | null
}

export interface CityDetail {
  city: City
  solutions: Solution[]
}

export interface CityProfile {
  city: string
  country: string
  region: string | null
  population_tier: string | null
  climate: string | null
  density: string | null
  economy: string | null
  problem_domains: Category[]
  notable_challenges: string[]
  summary: string | null
}

export interface Match {
  solution_id: string
  score: number
  rationale: string
  adaptation_notes: string | null
  solution: Solution | null
}

export interface MatchesEvent {
  profile: CityProfile
  matches: Match[]
}

export interface CategoryOption {
  value: Category
  label: string
}

// --- RAG citations (mirror backend/app/agent/search_tools.py) -----------------

export interface RagSource {
  type: 'solution' | 'city_doc'
  title: string
  solution_id?: string
  doc_id?: string
  city?: string
  kind?: string
  url?: string | null
}

/** Label ("S1") -> source, shipped once per turn via the `sources` SSE event. */
export type SourcesMap = Record<string, RagSource>

// --- Map director ops (mirror backend/app/agent/map_ops.py) -------------------

export type CityRef = string // city id or "home"

export type MapOp =
  | { op: 'zoom_to'; target: CityRef | CityRef[]; zoom?: number }
  | { op: 'highlight'; city_ids: CityRef[]; style?: 'pulse' | 'ring' | 'glow'; duration_s?: number }
  | { op: 'mark'; city_id: CityRef; kind?: 'pin' | 'star' | 'warning' | 'check' | 'flag'; label?: string }
  | { op: 'callout'; city_id: CityRef; text: string; side?: 'auto' | 'left' | 'right' }
  | { op: 'connect'; from: CityRef; to: CityRef; label?: string }
  | { op: 'tour'; stops: { city_id: CityRef; text?: string; hold_s?: number }[]; zoom?: number }
  | { op: 'spotlight'; city_ids?: CityRef[]; off?: boolean }
  | { op: 'clear' }

export interface ChatRequestBody {
  message: string
  city?: string
  country?: string
  history: { role: 'user' | 'assistant'; content: string }[]
  limit?: number
  model?: string
}

// --- Map overlay modes (mirror backend/app/domain/{models,map_modes}.py) ------

export interface MapModeInfo {
  mode: string
  label: string
  kind: 'polygon' | 'line'
  /** Feature property with the 0..1 score; prefix ("h") for temporal modes. */
  value_prop: string
  temporal: boolean
  generated_at: string | null
}

export interface MapLayerResponse {
  mode: string
  city_id: string
  generated_at: string
  meta: Record<string, unknown>
  feature_collection: GeoJSON.FeatureCollection
}
