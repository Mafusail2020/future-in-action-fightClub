import { create } from 'zustand'

import type { Match } from '../api/types'

interface MapState {
  selectedCityId: string | null
  /** Matches from the latest chat turn — rendered as glowing markers on the map. */
  matches: Match[]
  /** solution_id being hovered/focused in the chat match cards — its marker lights up. */
  activeSolutionId: string | null
  /** One-shot fly-to request, consumed by WorldMap. */
  flyTo: { center: [number, number]; zoom: number; key: number } | null
  /** One-shot fit-bounds request ([lng,lat] pairs), consumed by WorldMap. */
  fitTo: { points: [number, number][]; key: number } | null

  selectCity: (id: string | null) => void
  setMatches: (matches: Match[]) => void
  setActiveSolution: (id: string | null) => void
  requestFlyTo: (center: [number, number], zoom: number) => void
  consumeFlyTo: () => void
  consumeFitTo: () => void
}

export const useMapStore = create<MapState>((set) => ({
  selectedCityId: null,
  matches: [],
  activeSolutionId: null,
  flyTo: null,
  fitTo: null,

  selectCity: (id) => set({ selectedCityId: id }),
  setMatches: (matches) => {
    const points = matches
      .filter((m) => m.solution?.city)
      .map((m) => [m.solution!.city!.lng, m.solution!.city!.lat] as [number, number])
    set({
      matches,
      ...(points.length > 0 ? { fitTo: { points, key: Date.now() } } : {}),
    })
  },
  setActiveSolution: (id) => set({ activeSolutionId: id }),
  requestFlyTo: (center, zoom) => set({ flyTo: { center, zoom, key: Date.now() } }),
  consumeFlyTo: () => set({ flyTo: null }),
  consumeFitTo: () => set({ fitTo: null }),
}))
