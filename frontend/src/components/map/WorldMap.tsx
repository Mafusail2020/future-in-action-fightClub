import { useEffect, useRef } from 'react'
import Map, { type MapRef } from 'react-map-gl/maplibre'
import type { LngLatBoundsLike } from 'maplibre-gl'

import { useChatStore } from '../../stores/chatStore'
import { useTour } from '../../hooks/useTour'
import { mapStyle } from '../../lib/mapStyle'
import { loadNamePlate, loadPoiIcons, loadRoadShield } from '../../lib/poiIcons'
import { useMapScene } from '../../stores/mapScene'
import { useMapStore } from '../../stores/mapStore'
import { MatchMarkers } from './ChatLayers'
import { CityMarkers } from './CityMarkers'
import { HomeMarker } from './HomeMarker'
import { ModeLayers } from './ModeLayers'
import { SceneLayer } from './SceneLayer'

/** Starts wide enough to show the globe with the seeded cities. */
const INITIAL_VIEW = { longitude: 15, latitude: 48, zoom: 3.1 }

/** The map canvas is fixed full-viewport; sidebar and chat cover its edges.
 *  Chat-triggered camera moves pad accordingly to land in the visible window. */
function overlayPadding(sidebarOpen: boolean, chatWidth: number) {
  const narrow = window.innerWidth < 768
  return {
    top: 100,
    bottom: 100,
    left: (narrow || !sidebarOpen ? 0 : 288) + 60,
    right: (narrow ? 0 : chatWidth) + 60,
  }
}

export function WorldMap() {
  const mapRef = useRef<MapRef>(null)
  const flyTo = useMapStore((s) => s.flyTo)
  const fitTo = useMapStore((s) => s.fitTo)
  const consumeFlyTo = useMapStore((s) => s.consumeFlyTo)
  const consumeFitTo = useMapStore((s) => s.consumeFitTo)
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const chatWidth = useChatStore((s) => s.chatWidth)

  useEffect(() => {
    if (!flyTo || !mapRef.current) return
    mapRef.current.flyTo({
      center: flyTo.center,
      zoom: flyTo.zoom,
      duration: 2200,
      padding: overlayPadding(sidebarOpen, chatWidth),
      essential: false, // respects prefers-reduced-motion
    })
    consumeFlyTo()
  }, [flyTo, consumeFlyTo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fitTo || !mapRef.current || fitTo.points.length === 0) return
    const lngs = fitTo.points.map((p) => p[0])
    const lats = fitTo.points.map((p) => p[1])
    const bounds: LngLatBoundsLike = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ]
    mapRef.current.fitBounds(bounds, {
      padding: overlayPadding(sidebarOpen, chatWidth),
      maxZoom: 6,
      duration: 2000,
    })
    consumeFitTo()
  }, [fitTo, consumeFitTo]) // eslint-disable-line react-hooks/exhaustive-deps

  const tourProgress = useTour(mapRef, () => overlayPadding(sidebarOpen, chatWidth))
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const spotlightOn = useMapScene(
    (s) => !!(activeSessionId && s.scenes[activeSessionId]?.spotlight),
  )

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        mapStyle={mapStyle}
        attributionControl={{ compact: true }}
        style={{ width: '100%', height: '100%', background: '#060d1a' }}
        onLoad={() => {
          if (!mapRef.current) return
          loadPoiIcons(mapRef.current)
          loadRoadShield(mapRef.current)
          loadNamePlate(mapRef.current)
        }}
      >
        <ModeLayers />
        <CityMarkers />
        <MatchMarkers />
        <HomeMarker />
        <SceneLayer />
      </Map>

      {/* Spotlight veil: dims canvas + default-z markers; lifted markers glow above */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          zIndex: 2,
          background: 'rgba(6, 13, 26, 0.55)',
          opacity: spotlightOn ? 1 : 0,
        }}
      />

      {tourProgress && (
        <div
          role="status"
          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full border border-accent/40 bg-ink-900/90 px-3.5 py-1.5 font-mono text-xs text-accent backdrop-blur"
        >
          Тур {tourProgress.current}/{tourProgress.total} · Esc — зупинити
        </div>
      )}
    </div>
  )
}
