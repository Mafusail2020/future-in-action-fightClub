import { useEffect, useMemo, useRef, useState } from 'react'
import { Marker, useMap } from 'react-map-gl/maplibre'
import Supercluster from 'supercluster'

import { useCities } from '../../api/queries'
import type { City } from '../../api/types'
import { useHomeCityRecord } from '../../hooks/useHomeCity'
import { ukCityName } from '../../lib/cityNamesUk'
import { useMapStore } from '../../stores/mapStore'

/** Bolt-Food-style clustering: below this zoom nearby cities group into bubbles. */
const CLUSTER_MAX_ZOOM = 7
const CLUSTER_RADIUS = 60
const FLY_MS = 400
const GHOST_FADE_DELAY_MS = 220 // ghosts stay solid while flying, fade near the end

type Feature = Supercluster.ClusterFeature<{ city: City }> | Supercluster.PointFeature<{ city: City }>

interface Snapshot {
  key: string
  lng: number
  lat: number
  /** City ids inside this feature (single id for a plain city marker). */
  ids: Set<string>
}

interface Ghost extends Snapshot {
  /** Screen-space delta towards the feature this one merged into (px). */
  dx: number
  dy: number
}

const featureKey = (f: Feature) =>
  'cluster' in f.properties && f.properties.cluster
    ? `cluster-${f.properties.cluster_id}`
    : `city-${(f.properties as { city: City }).city.id}`

export function CityMarkers() {
  const { data: cities } = useCities()
  const { current: map } = useMap()
  const selectedCityId = useMapStore((s) => s.selectedCityId)
  const selectCity = useMapStore((s) => s.selectCity)
  const { record: homeRecord } = useHomeCityRecord()
  const [viewKey, setViewKey] = useState(0)
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  /** key -> screen-space offset the entering marker flies in from. */
  const [enterFrom, setEnterFrom] = useState<Map<string, { dx: number; dy: number }>>(new Map())
  const prevRef = useRef<Snapshot[]>([])

  useEffect(() => {
    if (!map) return
    const bump = () => setViewKey((k) => k + 1)
    map.on('zoomend', bump)
    map.on('moveend', bump)
    return () => {
      map.off('zoomend', bump)
      map.off('moveend', bump)
    }
  }, [map])

  // Only cities that actually HAVE solutions get the clickable tag; rows that
  // exist merely as map-layer hosts (e.g. the user's home city) keep their
  // ordinary base-map label instead.
  const taggedCities = useMemo(
    () => (cities ?? []).filter((c) => (c.solution_count ?? 0) > 0 && c.id !== homeRecord?.id),
    [cities, homeRecord?.id],
  )

  const index = useMemo(() => {
    const sc = new Supercluster<{ city: City }>({
      radius: CLUSTER_RADIUS,
      maxZoom: CLUSTER_MAX_ZOOM,
    })
    sc.load(
      taggedCities.map((city) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [city.lng, city.lat] },
        properties: { city },
      })),
    )
    return sc
  }, [taggedCities])

  const features = useMemo(() => {
    if (!taggedCities.length) return []
    const zoom = Math.floor(map?.getZoom() ?? 3)
    return index.getClusters([-180, -85, 180, 85], zoom) as Feature[]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, taggedCities, map, viewKey])

  // Merge/split choreography: entering features fly in from the feature they
  // split out of; exiting ones become ghosts flying into the feature that
  // swallowed them, then evaporate.
  useEffect(() => {
    if (!map) return
    const snapshot = (f: Feature): Snapshot => {
      const [lng, lat] = f.geometry.coordinates
      const ids =
        'cluster' in f.properties && f.properties.cluster
          ? new Set(
              index
                .getLeaves(f.properties.cluster_id, Infinity)
                .map((leaf) => (leaf.properties as { city: City }).city.id),
            )
          : new Set([(f.properties as { city: City }).city.id])
      return { key: featureKey(f), lng, lat, ids }
    }

    const next = features.map(snapshot)
    const prev = prevRef.current
    prevRef.current = next
    if (prev.length === 0 || !map) return

    const nextKeys = new Set(next.map((s) => s.key))
    const prevKeys = new Set(prev.map((s) => s.key))
    const overlaps = (a: Snapshot, b: Snapshot) => {
      for (const id of a.ids) if (b.ids.has(id)) return true
      return false
    }
    const deltaPx = (from: Snapshot, to: Snapshot) => {
      const a = map.project([from.lng, from.lat])
      const b = map.project([to.lng, to.lat])
      return { dx: a.x - b.x, dy: a.y - b.y }
    }

    // Entering: fly in from the vanished feature that contained them.
    const entering = new Map<string, { dx: number; dy: number }>()
    for (const feat of next) {
      if (nextKeys.has(feat.key) && prevKeys.has(feat.key)) continue
      const source = prev.find((p) => !nextKeys.has(p.key) && overlaps(p, feat))
      if (source) entering.set(feat.key, deltaPx(source, feat))
    }
    setEnterFrom(entering)

    // Exiting: fly towards the surviving/new feature that absorbed them.
    const exiting: Ghost[] = []
    for (const p of prev) {
      if (nextKeys.has(p.key)) continue
      const target = next.find((n) => overlaps(p, n))
      if (!target) continue
      const { dx, dy } = deltaPx(target, p) // target position relative to ghost
      exiting.push({ ...p, dx, dy })
    }
    setGhosts(exiting)
    const timer = window.setTimeout(() => setGhosts([]), FLY_MS + GHOST_FADE_DELAY_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, index, map])

  const homeIsSolutionCity = !!homeRecord && (homeRecord.solution_count ?? 0) > 0

  return (
    <>
      {homeIsSolutionCity && (
        <Marker
          longitude={homeRecord.lng}
          latitude={homeRecord.lat}
          anchor="center"
          style={{ zIndex: 0 }}
        >
          <span
            aria-hidden
            style={{
              fontFamily: "'Noto Sans', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              color: '#6d81a3',
              textShadow: '0 0 3px #0b1220, 0 0 3px #0b1220',
              pointerEvents: 'none',
            }}
          >
            {ukCityName(homeRecord.name)}
          </span>
        </Marker>
      )}
      {ghosts.map((ghost) => (
        <Marker key={`ghost-${ghost.key}`} longitude={ghost.lng} latitude={ghost.lat} anchor="center">
          <GhostDot dx={ghost.dx} dy={ghost.dy} count={ghost.ids.size} />
        </Marker>
      ))}

      {features.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates
        const key = featureKey(feature)
        const from = enterFrom.get(key)

        if ('cluster' in feature.properties && feature.properties.cluster) {
          const { cluster_id, point_count: count } = feature.properties
          const size = count >= 8 ? 48 : count >= 4 ? 40 : 32
          return (
            <Marker key={key} longitude={lng} latitude={lat} anchor="center">
              <FlyIn from={from}>
                <button
                  type="button"
                  aria-label={`Група з ${count} міст — натисніть, щоб наблизити`}
                  title={`${count} міст`}
                  onClick={() => {
                    const expansionZoom = Math.min(
                      index.getClusterExpansionZoom(cluster_id),
                      CLUSTER_MAX_ZOOM + 1,
                    )
                    map?.flyTo({ center: [lng, lat], zoom: expansionZoom + 0.3, duration: 1200 })
                  }}
                  style={{ width: size, height: size, background: '#f5b84c' }}
                  className="flex items-center justify-center rounded-full font-display text-sm font-semibold text-black shadow-lg transition-transform hover:scale-110"
                >
                  {count}
                </button>
              </FlyIn>
            </Marker>
          )
        }

        const city = (feature.properties as { city: City }).city
        return (
          <Marker key={key} longitude={city.lng} latitude={city.lat} anchor="center">
            <FlyIn from={from}>
              <button
                type="button"
                className="city-marker"
                data-selected={selectedCityId === city.id}
                aria-label={`${ukCityName(city.name)}, ${city.country}: рішень — ${city.solution_count ?? 0}`}
                aria-pressed={selectedCityId === city.id}
                onClick={() => {
                  selectCity(city.id)
                  map?.flyTo({ center: [city.lng, city.lat], zoom: 6.5, duration: 1600 })
                }}
              >
                <span className="dot" aria-hidden />
                {ukCityName(city.name)}
                <span className="count">{city.solution_count ?? 0}</span>
              </button>
            </FlyIn>
          </Marker>
        )
      })}
    </>
  )
}

/** Starts offset by `from` (the parent it split out of) and glides to rest. */
function FlyIn({ from, children }: { from?: { dx: number; dy: number }; children: React.ReactNode }) {
  const [settled, setSettled] = useState(!from)

  useEffect(() => {
    if (!from) return
    const raf = requestAnimationFrame(() => setSettled(true))
    return () => cancelAnimationFrame(raf)
  }, [from])

  return (
    <div
      style={{
        transform: settled || !from ? 'translate(0, 0)' : `translate(${from.dx}px, ${from.dy}px)`,
        transition: `transform ${FLY_MS}ms cubic-bezier(0.22, 0.9, 0.35, 1)`,
      }}
    >
      {children}
    </div>
  )
}

/** A leaving marker: shrinks and flies into the feature that absorbed it. */
function GhostDot({ dx, dy, count }: { dx: number; dy: number; count: number }) {
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setGone(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      aria-hidden
      style={{
        // dx/dy point from this ghost towards its absorber (target - ghost).
        transform: gone ? `translate(${dx}px, ${dy}px) scale(0.3)` : 'translate(0, 0) scale(1)',
        opacity: gone ? 0 : 0.9,
        // Fly the full distance visibly; only fade once the flight is nearly over.
        transition: `transform ${FLY_MS}ms cubic-bezier(0.5, 0, 0.75, 1), opacity ${FLY_MS - GHOST_FADE_DELAY_MS}ms ease ${GHOST_FADE_DELAY_MS}ms`,
        width: count > 1 ? 32 : 14,
        height: count > 1 ? 32 : 14,
        background: '#f5b84c',
        borderRadius: 999,
      }}
    />
  )
}
