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

export interface ChatRequestBody {
  message: string
  city?: string
  country?: string
  history: { role: 'user' | 'assistant'; content: string }[]
  limit?: number
}
