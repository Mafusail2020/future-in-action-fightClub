import { useQuery } from '@tanstack/react-query'

import { apiGet } from './client'
import type { CaseDetailOut, CaseSummaryOut, CityOut, RaionOut } from './types'

export function useCities() {
  return useQuery({
    queryKey: ['cities'],
    queryFn: () => apiGet<CityOut[]>('/cities'),
    staleTime: 5 * 60_000,
  })
}

export function useCityCases(cityId: string | null) {
  return useQuery({
    queryKey: ['city-cases', cityId],
    queryFn: () => apiGet<CaseSummaryOut[]>(`/cities/${cityId}/cases`),
    enabled: cityId !== null,
  })
}

export function useCase(caseId: string | undefined) {
  return useQuery({
    queryKey: ['case', caseId],
    queryFn: () => apiGet<CaseDetailOut>(`/cases/${caseId}`),
    enabled: !!caseId,
  })
}

export function useRaions() {
  return useQuery({
    queryKey: ['raions'],
    queryFn: () => apiGet<RaionOut[]>('/raions'),
    staleTime: 30 * 60_000,
  })
}
