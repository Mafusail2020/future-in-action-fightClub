import { Layer, Source } from 'react-map-gl/maplibre'

import { useMapLayer, useMapModes } from '../../api/queries'
import { useHomeCityRecord } from '../../hooks/useHomeCity'
import { useMapStore } from '../../stores/mapStore'
import { activeProp, MODE_ROAD_WIDTH, NO_DATA_COLOR, rampExpression } from '../../lib/mapModes'

/** All labels sit above the overlay: this is the first label layer in mapStyle.ts. */
const BEFORE_ID = 'place-city-labels'

/**
 * GeoJSON overlay for the active map mode of the user's home city (the one
 * typed in the sidebar). Declarative Source/Layer (SceneLayer pattern) —
 * react-map-gl owns the lifecycle; a slider tick only diffs paint into one
 * setPaintProperty call.
 */
export function ModeLayers() {
  const mapMode = useMapStore((s) => s.mapMode)
  const trafficHour = useMapStore((s) => s.trafficHour)
  const { record: homeCity } = useHomeCityRecord()

  const modes = useMapModes(homeCity?.id ?? null)
  const descriptor = modes.data?.find((m) => m.mode === mapMode) ?? null
  const layer = useMapLayer(homeCity?.id ?? null, descriptor ? mapMode : null)

  if (!descriptor || !layer.data) return null

  const prop = activeProp(descriptor, trafficHour)
  // Traffic features carry all 24 hours or none — h0 works as the "has data" probe.
  const dataProbe = descriptor.temporal ? `${descriptor.value_prop}0` : prop

  return (
    // Key by mode: react-map-gl cannot diff a Layer whose type flips polygon<->line.
    <Source
      key={`mode-${descriptor.mode}`}
      id="mode-src"
      type="geojson"
      data={layer.data.feature_collection}
    >
      {descriptor.kind === 'polygon' ? (
        <>
          <Layer
            id="mode-fill"
            type="fill"
            beforeId={BEFORE_ID}
            filter={['has', prop]}
            paint={{ 'fill-color': rampExpression(prop), 'fill-opacity': 0.3 }}
          />
          <Layer
            id="mode-fill-nodata"
            type="fill"
            beforeId={BEFORE_ID}
            filter={['!', ['has', prop]]}
            paint={{ 'fill-color': NO_DATA_COLOR, 'fill-opacity': 0.12 }}
          />
          <Layer
            id="mode-outline"
            type="line"
            beforeId={BEFORE_ID}
            paint={{ 'line-color': '#0b1220', 'line-width': 0.8, 'line-opacity': 0.5 }}
          />
        </>
      ) : (
        <>
          <Layer
            id="mode-roads"
            type="line"
            beforeId={BEFORE_ID}
            filter={['has', dataProbe]}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': rampExpression(prop),
              'line-width': MODE_ROAD_WIDTH,
              'line-opacity': 0.9,
            }}
          />
          <Layer
            id="mode-roads-nodata"
            type="line"
            beforeId={BEFORE_ID}
            filter={['!', ['has', dataProbe]]}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': NO_DATA_COLOR,
              'line-width': MODE_ROAD_WIDTH,
              'line-opacity': 0.45,
            }}
          />
        </>
      )}
    </Source>
  )
}
