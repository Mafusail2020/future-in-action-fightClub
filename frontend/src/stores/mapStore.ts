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
  /** Active overlay mode (null = off). Sticky across city switches; the
   *  renderer simply draws nothing when the selected city lacks the mode. */
  mapMode: string | null
  /** Hour shown by the traffic mode, 0-23. */
  trafficHour: number
  /** Density overlay opacity, 0..1. */
  densityOpacity: number

  selectCity: (id: string | null) => void
  setMatches: (matches: Match[]) => void
  setActiveSolution: (id: string | null) => void
  requestFlyTo: (center: [number, number], zoom: number) => void
  consumeFlyTo: () => void
  consumeFitTo: () => void
  setMapMode: (mode: string | null) => void
  setTrafficHour: (hour: number) => void
  setDensityOpacity: (value: number) => void
}

export const useMapStore = create<MapState>((set) => ({
  selectedCityId: null,
  matches: [],
  activeSolutionId: null,
  flyTo: null,
  fitTo: null,
  mapMode: null,
  trafficHour: 8, // morning peak reads well on first open
  densityOpacity: 0.8,

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
  setMapMode: (mode) => set({ mapMode: mode }),
  setTrafficHour: (hour) => set({ trafficHour: Math.max(0, Math.min(23, hour)) }),
  setDensityOpacity: (value) => set({ densityOpacity: Math.max(0, Math.min(1, value)) }),
}))
