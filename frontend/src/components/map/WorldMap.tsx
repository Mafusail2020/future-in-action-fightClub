import { useEffect, useRef } from 'react'
import Map, { type MapRef } from 'react-map-gl/maplibre'

import { mapStyle } from '../../lib/mapStyle'
import { useMapStore } from '../../stores/mapStore'
import { ChatLayers } from './ChatLayers'
import { CityMarkers } from './CityMarkers'

/** Starts wide enough to show the globe with the whole cities cluster. */
const INITIAL_VIEW = { longitude: 26.5, latitude: 50.4, zoom: 3.4 }

export function WorldMap() {
  const mapRef = useRef<MapRef>(null)
  const flyTo = useMapStore((s) => s.flyTo)
  const consumeFlyTo = useMapStore((s) => s.consumeFlyTo)

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

  return (
    <Map
      ref={mapRef}
      initialViewState={INITIAL_VIEW}
      mapStyle={mapStyle}
      attributionControl={{ compact: true }}
      style={{ width: '100%', height: '100%', background: '#060d1a' }}
    >
      <ChatLayers />
      <CityMarkers />
    </Map>
  )
}
