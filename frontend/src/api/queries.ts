import { useQuery } from '@tanstack/react-query'

import { apiGet } from './client'
import type { CategoryOption, City, CityDetail, Solution } from './types'

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
