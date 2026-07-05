import { useEffect, useRef } from 'react'
import Map, { type MapRef } from 'react-map-gl/maplibre'
import type { LngLatBoundsLike } from 'maplibre-gl'

import { mapStyle } from '../../lib/mapStyle'
import { useMapStore } from '../../stores/mapStore'
import { MatchMarkers } from './ChatLayers'
import { CityMarkers } from './CityMarkers'

/** Starts wide enough to show the globe with the seeded cities. */
const INITIAL_VIEW = { longitude: 15, latitude: 48, zoom: 3.1 }

export function WorldMap() {
  const mapRef = useRef<MapRef>(null)
  const flyTo = useMapStore((s) => s.flyTo)
  const fitTo = useMapStore((s) => s.fitTo)
  const consumeFlyTo = useMapStore((s) => s.consumeFlyTo)
  const consumeFitTo = useMapStore((s) => s.consumeFitTo)

  useEffect(() => {
    if (!flyTo || !mapRef.current) return
    mapRef.current.flyTo({
      center: flyTo.center,
      zoom: flyTo.zoom,
      duration: 2200,
      essential: false, // respects prefers-reduced-motion
    })
    consumeFlyTo()
  }, [flyTo, consumeFlyTo])

  useEffect(() => {
    if (!fitTo || !mapRef.current || fitTo.points.length === 0) return
    const lngs = fitTo.points.map((p) => p[0])
    const lats = fitTo.points.map((p) => p[1])
    const bounds: LngLatBoundsLike = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ]
    mapRef.current.fitBounds(bounds, { padding: 120, maxZoom: 6, duration: 2000 })
    consumeFitTo()
  }, [fitTo, consumeFitTo])

  return (
    <Map
      ref={mapRef}
      initialViewState={INITIAL_VIEW}
      mapStyle={mapStyle}
      attributionControl={{ compact: true }}
      style={{ width: '100%', height: '100%', background: '#060d1a' }}
    >
      <CityMarkers />
      <MatchMarkers />
    </Map>
  )
}
