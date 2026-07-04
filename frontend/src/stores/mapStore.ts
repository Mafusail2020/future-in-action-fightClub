import { create } from 'zustand'

import type { MapPayload } from '../api/types'

interface MapState {
  selectedCityId: string | null
  /** Map payload of the latest answered chat turn (raion highlights, points, viewport). */
  chatMap: MapPayload | null
  /** Citation number the user is hovering/focusing — the linked map features light up. */
  activeCitation: number | null
  /** One-shot fly-to request, consumed by WorldMap. */
  flyTo: { center: [number, number]; zoom: number; key: number } | null

  selectCity: (id: string | null) => void
  setChatMap: (payload: MapPayload | null) => void
  setActiveCitation: (n: number | null) => void
  requestFlyTo: (center: [number, number], zoom: number) => void
  consumeFlyTo: () => void
}

export const useMapStore = create<MapState>((set) => ({
  selectedCityId: null,
  chatMap: null,
  activeCitation: null,
  flyTo: null,

  selectCity: (id) => set({ selectedCityId: id }),
  setChatMap: (payload) =>
    set({
      chatMap: payload,
      ...(payload
        ? { flyTo: { center: payload.viewport.center, zoom: payload.viewport.zoom, key: Date.now() } }
        : {}),
    }),
  setActiveCitation: (n) => set({ activeCitation: n }),
  requestFlyTo: (center, zoom) => set({ flyTo: { center, zoom, key: Date.now() } }),
  consumeFlyTo: () => set({ flyTo: null }),
}))
