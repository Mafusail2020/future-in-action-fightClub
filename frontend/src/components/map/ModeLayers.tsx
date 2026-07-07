import type { ExpressionSpecification } from 'maplibre-gl'
import { useEffect, useMemo, useState } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'

import { useMapLayer, useMapModes } from '../../api/queries'
import { useHomeCityRecord } from '../../hooks/useHomeCity'
import { useMapStore } from '../../stores/mapStore'
import {
  activeProp,
  densityMosaic,
  MODE_ROAD_WIDTH,
  NO_DATA_COLOR,
  rampExpression,
  revealOpacity,
  segmentizeLines,
} from '../../lib/mapModes'

/** All labels sit above the overlay: this is the first label layer in mapStyle.ts. */
const BEFORE_ID = 'place-city-labels'
const GROW_MS = 2600
const DENSITY_FADE_MS = 1500
// Portion of the timeline spent staggering cell start times; the rest is each
// cell's own fade. A cell with delay d starts at d*SPREAD and finishes by 1.
const FADE_SPREAD = 0.55

/**
 * GeoJSON overlay for the active map mode of the user's home city.
 *
 * Line modes: the full network is pre-split into ~300 m pieces; an invisible
 * circle expands from the city center for ~2 s and every piece inside it turns
 * on — the wave-of-roads reveal.
 *
 * Population density: a zoom-stable gradient — the field is rasterized once in
 * geographic space (IDW), clipped to the district union, and shown as an image
 * source with the district borders drawn on top.
 */
export function ModeLayers() {
  const mapMode = useMapStore((s) => s.mapMode)
  const trafficHour = useMapStore((s) => s.trafficHour)
  const densityOpacity = useMapStore((s) => s.densityOpacity)
  const { record: homeCity } = useHomeCityRecord()

  const modes = useMapModes(homeCity?.id ?? null)
  const descriptor = modes.data?.find((m) => m.mode === mapMode) ?? null
  const layer = useMapLayer(homeCity?.id ?? null, descriptor ? mapMode : null)

  const center = useMemo<[number, number] | null>(
    () => (homeCity ? [homeCity.lng, homeCity.lat] : null),
    [homeCity],
  )

  const [lineData, maxDist] = useMemo(() => {
    if (!layer.data || !center || descriptor?.kind !== 'line') {
      return [null, 0] as const
    }
    return segmentizeLines(layer.data.feature_collection, center)
  }, [layer.data, center, descriptor?.kind])

  const mosaic = useMemo(() => {
    if (!layer.data || descriptor?.kind !== 'polygon') return null
    return densityMosaic(layer.data.feature_collection, descriptor.value_prop)
  }, [layer.data, descriptor])

  // The expanding circle: starts INSTANTLY on activation — roads grow while the
  // camera is still flying in, so there's no dead wait. The wave runs a touch
  // longer than the ~2.2 s fly, so it's still spreading when the camera lands.
  // Replays per activation; never on hour ticks.
  const [reveal, setReveal] = useState(0)
  useEffect(() => {
    if (descriptor?.kind !== 'line' || !lineData) return
    const full = maxDist + 0.2
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReveal(full)
      return
    }
    setReveal(0)
    let raf = 0
    const started = performance.now()
    const step = (now: number) => {
      const t = Math.min((now - started) / GROW_MS, 1)
      setReveal(t * full)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptor?.mode, lineData])

  // Density fade: `heatProgress` 0->1 on activation; each cell's opacity ramps
  // from its own staggered start (delay*SPREAD) so tiles pop in randomly.
  const [heatProgress, setHeatProgress] = useState(1)
  useEffect(() => {
    if (descriptor?.kind !== 'polygon' || !mosaic) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setHeatProgress(1)
      return
    }
    setHeatProgress(0)
    let raf = 0
    const started = performance.now()
    const step = (now: number) => {
      const t = Math.min((now - started) / DENSITY_FADE_MS, 1)
      setHeatProgress(t)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptor?.mode, mosaic])

  if (!descriptor || !layer.data) return null

  if (descriptor.kind === 'polygon') {
    if (!mosaic) return null
    const fade = 1 - FADE_SPREAD
    // per-cell opacity = densityOpacity * clamp01((progress - delay*SPREAD)/fade)
    const cellOpacity: ExpressionSpecification = [
      '*',
      densityOpacity,
      [
        'max',
        0,
        ['min', 1, ['/', ['-', heatProgress, ['*', ['get', 'delay'], FADE_SPREAD]], fade]],
      ],
    ]
    return (
      <>
        {/* Fully-vector mosaic: crisp at any zoom; fill-outline-color is the grout,
            which fades per-cell together with the fill. */}
        <Source key="mode-mosaic" id="mode-mosaic-src" type="geojson" data={mosaic.cells}>
          <Layer
            id="mode-mosaic-fill"
            type="fill"
            beforeId={BEFORE_ID}
            paint={{
              'fill-color': ['get', 'color'] as unknown as string,
              'fill-opacity': cellOpacity,
              'fill-outline-color': 'rgba(11, 18, 32, 0.7)',
            }}
          />
        </Source>
        {/* One clean city border above the mosaic */}
        <Source
          key="mode-border"
          id="mode-border-src"
          type="geojson"
          data={{
            type: 'Feature',
            geometry: {
              type: 'MultiLineString',
              coordinates: mosaic.rings.map((ring) => [...ring, ring[0]]),
            },
            properties: {},
          }}
        >
          <Layer
            id="mode-border"
            type="line"
            beforeId={BEFORE_ID}
            paint={{
              'line-color': 'rgba(205, 217, 236, 0.55)',
              'line-width': 1.5,
              'line-dasharray': [3, 2],
            }}
          />
        </Source>
      </>
    )
  }

  if (!lineData) return null
  const prop = activeProp(descriptor, trafficHour)
  // Traffic features carry all 24 hours or none — h0 works as the "has data" probe.
  const dataProbe = descriptor.temporal ? `${descriptor.value_prop}0` : prop

  return (
    // Key by mode: react-map-gl cannot diff a Layer whose type flips polygon<->line.
    <Source key={`mode-${descriptor.mode}`} id="mode-src" type="geojson" data={lineData}>
      {[
        <Layer
          key="mode-roads"
          id="mode-roads"
          type="line"
          beforeId={BEFORE_ID}
          filter={['has', dataProbe]}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': rampExpression(prop),
            'line-width': MODE_ROAD_WIDTH,
            'line-opacity': revealOpacity(reveal, 0.9),
          }}
        />,
        <Layer
          key="mode-roads-nodata"
          id="mode-roads-nodata"
          type="line"
          beforeId={BEFORE_ID}
          filter={['!', ['has', dataProbe]]}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': NO_DATA_COLOR,
            'line-width': MODE_ROAD_WIDTH,
            'line-opacity': revealOpacity(reveal, 0.45),
          }}
        />,
      ]}
    </Source>
  )
}
