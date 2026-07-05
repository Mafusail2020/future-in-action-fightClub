import { useQuery } from '@tanstack/react-query'

import { apiGet } from './client'
import type {
  CategoryOption,
  City,
  CityDetail,
  MapLayerResponse,
  MapModeInfo,
  Solution,
} from './types'

export function useCities() {
  return useQuery({
    queryKey: ['cities'],
    queryFn: () => apiGet<City[]>('/cities'),
    staleTime: 5 * 60_000,
  })
}

/** City + all its solutions in one call — powers the click-city panel. */
export function useCityDetail(cityId: string | null) {
  return useQuery({
    queryKey: ['city', cityId],
    queryFn: () => apiGet<CityDetail>(`/cities/${cityId}`),
    enabled: cityId !== null,
  })
}

/** Full solution catalog — powers the "all problems" dialog. Fetched only when open. */
export function useSolutions(enabled: boolean) {
  return useQuery({
    queryKey: ['solutions'],
    queryFn: () => apiGet<Solution[]>('/solutions'),
    staleTime: 5 * 60_000,
    enabled,
  })
}

export function useSolution(solutionId: string | undefined) {
  return useQuery({
    queryKey: ['solution', solutionId],
    queryFn: () => apiGet<Solution>(`/solutions/${solutionId}`),
    enabled: !!solutionId,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => apiGet<CategoryOption[]>('/categories'),
    staleTime: Infinity,
  })
}

/** Overlay modes available for a city (empty list = no precomputed layers). */
export function useMapModes(cityId: string | null) {
  return useQuery({
    queryKey: ['map-modes', cityId],
    queryFn: () => apiGet<MapModeInfo[]>(`/cities/${cityId}/map-modes`),
    enabled: cityId !== null,
    staleTime: 5 * 60_000,
  })
}

/** One mode's GeoJSON. Precomputed offline -> immutable for the session;
 *  the traffic slider only swaps paint, never refetches. */
export function useMapLayer(cityId: string | null, mode: string | null) {
  return useQuery({
    queryKey: ['map-layer', cityId, mode],
    queryFn: () => apiGet<MapLayerResponse>(`/cities/${cityId}/map-modes/${mode}`),
    enabled: !!cityId && !!mode,
    staleTime: Infinity,
  })
}
