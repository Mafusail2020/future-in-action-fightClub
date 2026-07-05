import { Check, Flag, MapPin, Star, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Layer, Marker, Source, useMap } from 'react-map-gl/maplibre'

import type { CityRef } from '../../api/types'
import { greatCircle, resolveCityRef } from '../../lib/geo'
import { useChatStore } from '../../stores/chatStore'
import type { Scene, SceneArc, SceneCallout } from '../../stores/mapScene'
import { useMapScene } from '../../stores/mapScene'

const MARK_ICONS = {
  pin: MapPin,
  star: Star,
  warning: TriangleAlert,
  check: Check,
  flag: Flag,
} as const

/** Renders the ACTIVE chat's map scene (marks, callouts, arcs, spotlight). */
export function SceneLayer() {
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const sessions = useChatStore((s) => s.sessions)
  const scene = useMapScene((s) => (activeSessionId ? s.scenes[activeSessionId] : undefined))
  const built = useMapScene((s) => (activeSessionId ? s.built[activeSessionId] : undefined))
  const rebuild = useMapScene((s) => s.rebuild)

  // Chat-bounded: entering a chat whose scene wasn't built yet (reload/first
  // open) replays its persisted visual ops.
  useEffect(() => {
    if (!activeSessionId || built) return
    const session = sessions.find((x) => x.id === activeSessionId)
    if (session) rebuild(activeSessionId, session.messages)
  }, [activeSessionId, built, sessions, rebuild])

  if (!activeSessionId || !scene) return null
  return <SceneView scene={scene} sessionId={activeSessionId} />
}

function SceneView({ scene, sessionId }: { scene: Scene; sessionId: string }) {
  const removeCallout = useMapScene((s) => s.removeCallout)
  const highlightByCity = new Map<CityRef, string>()
  for (const h of scene.highlights) {
    for (const c of h.cities) highlightByCity.set(c, h.style)
  }

  return (
    <>
      {scene.arcs.map((arc) => (
        <ArcLine key={arc.id} arc={arc} />
      ))}

      {scene.marks.map((mark) => {
        const point = resolveCityRef(mark.city)
        if (!point) return null
        const Icon = MARK_ICONS[mark.kind]
        return (
          <Marker key={mark.id} longitude={point[0]} latitude={point[1]} anchor="bottom" style={{ zIndex: 3 }}>
            <div className="marker-pop flex flex-col items-center gap-0.5">
              {mark.label && (
                <span className="max-w-40 truncate rounded border border-border-subtle bg-bg-main/90 px-1.5 py-px text-[11px] text-text-primary backdrop-blur">
                  {mark.label}
                </span>
              )}
              <Icon
                size={20}
                strokeWidth={2}
                className={mark.kind === 'warning' ? 'text-danger' : 'text-amber'}
                fill={mark.kind === 'star' ? 'currentColor' : 'none'}
              />
            </div>
          </Marker>
        )
      })}

      {[...highlightByCity.entries()].map(([city, style]) => {
        const point = resolveCityRef(city)
        if (!point) return null
        return (
          <Marker key={`hl-${city}`} longitude={point[0]} latitude={point[1]} anchor="center" style={{ zIndex: 3 }}>
            <span
              aria-hidden
              className={`block rounded-full border-2 border-amber ${
                style === 'pulse' ? 'animate-ping-slow' : style === 'glow' ? 'hl-glow' : ''
              }`}
              style={{ width: 34, height: 34 }}
            />
          </Marker>
        )
      })}

      {scene.callouts.map((callout, i) => (
        <CalloutMarker
          key={callout.id}
          callout={callout}
          stack={i}
          onClose={() => removeCallout(sessionId, callout.id)}
        />
      ))}

      <SpotlightVeil cities={scene.spotlight} />
    </>
  )
}

/** Great-circle arc that draws itself, then holds. */
function ArcLine({ arc }: { arc: SceneArc }) {
  const from = resolveCityRef(arc.from)
  const to = resolveCityRef(arc.to)
  const [progress, setProgress] = useState(0)

  const points = useMemo(
    () => (from && to ? greatCircle(from, to) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [arc.from, arc.to, !!from, !!to],
  )

  useEffect(() => {
    if (!points) return
    let raf = 0
    const started = performance.now()
    const step = (now: number) => {
      const f = Math.min((now - started) / 700, 1)
      setProgress(f)
      if (f < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [points])

  if (!points) return null
  const visible = points.slice(0, Math.max(2, Math.ceil(points.length * progress)))
  const mid = points[Math.floor(points.length / 2)]

  return (
    <>
      <Source
        id={`arc-${arc.id}`}
        type="geojson"
        data={{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: visible },
          properties: {},
        }}
      >
        <Layer
          id={`arc-line-${arc.id}`}
          type="line"
          paint={{ 'line-color': '#f5b84c', 'line-width': 2, 'line-opacity': 0.85 }}
        />
      </Source>
      {arc.label && progress >= 1 && (
        <Marker longitude={mid[0]} latitude={mid[1]} anchor="center">
          <span className="rounded border border-amber/40 bg-bg-main/90 px-1.5 py-px font-mono text-[10px] text-amber backdrop-blur">
            {arc.label}
          </span>
        </Marker>
      )}
    </>
  )
}

/** The Jarvis move: leader line grows out of the point, then the card pops. */
function CalloutMarker({
  callout,
  stack,
  onClose,
}: {
  callout: SceneCallout
  stack: number
  onClose: () => void
}) {
  const { current: map } = useMap()
  const point = resolveCityRef(callout.city)
  const [lineDrawn, setLineDrawn] = useState(false)

  // auto side: flip left when the anchor sits in the right 40% of the viewport
  const side = useMemo(() => {
    if (callout.side !== 'auto') return callout.side
    if (!map || !point) return 'right'
    const px = map.project(point)
    return px.x > map.getContainer().clientWidth * 0.6 ? 'left' : 'right'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callout.side, !!map, !!point])

  useEffect(() => {
    const t = window.setTimeout(() => setLineDrawn(true), 380)
    return () => window.clearTimeout(t)
  }, [])

  if (!point) return null
  const flip = side === 'left'
  const LINE_W = 72
  const LINE_H = 46 + stack * 10

  return (
    <Marker longitude={point[0]} latitude={point[1]} anchor="center" style={{ zIndex: 4 }}>
      <div className="relative">
        <span className="absolute -translate-x-1/2 -translate-y-1/2">
          <span className="block size-2 rounded-full bg-accent shadow-[0_0_8px_rgba(95,212,208,0.9)]" />
        </span>
        <svg
          aria-hidden
          width={LINE_W}
          height={LINE_H}
          className="absolute"
          style={{
            left: flip ? -LINE_W : 0,
            bottom: 0,
            transform: flip ? 'scaleX(-1)' : undefined,
          }}
        >
          <polyline
            points={`0,${LINE_H} ${LINE_W * 0.45},${LINE_H * 0.35} ${LINE_W},${LINE_H * 0.35}`}
            fill="none"
            stroke="#5fd4d0"
            strokeWidth="1.5"
            strokeDasharray="140"
            strokeDashoffset="140"
            style={{ animation: 'callout-line 380ms ease-out forwards' }}
          />
        </svg>
        <div
          role="note"
          aria-label={`Радник про це місце: ${callout.text}`}
          className="absolute w-56 rounded-lg border border-accent/30 bg-ink-900/95 px-3 py-2 shadow-xl backdrop-blur transition-all duration-200"
          style={{
            [flip ? 'right' : 'left']: LINE_W - 4,
            bottom: LINE_H * 0.65 - 14 + (lineDrawn ? 0 : -6),
            opacity: lineDrawn ? 1 : 0,
            pointerEvents: lineDrawn ? 'auto' : 'none',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити підказку"
            className="absolute top-1 right-1 text-text-tertiary hover:text-text-primary"
          >
            <X size={12} strokeWidth={2} />
          </button>
          <p className="pr-3 text-[12.5px] leading-snug text-text-primary">{callout.text}</p>
        </div>
      </div>
    </Marker>
  )
}

/** Dark veil over everything except the spotlighted cities. */
function SpotlightVeil({ cities }: { cities: CityRef[] | null }) {
  if (!cities) return null
  return (
    <>
      {/* the veil itself is a DOM overlay rendered by WorldMap (needs container size);
          here we lift the chosen cities above it with a glow ring */}
      {cities.map((city) => {
        const point = resolveCityRef(city)
        if (!point) return null
        return (
          <Marker key={`spot-${city}`} longitude={point[0]} latitude={point[1]} anchor="center" style={{ zIndex: 3 }}>
            <span
              aria-hidden
              className="block rounded-full"
              style={{
                width: 44,
                height: 44,
                boxShadow: '0 0 0 3px rgba(245,184,76,0.8), 0 0 30px 8px rgba(245,184,76,0.45)',
              }}
            />
          </Marker>
        )
      })}
    </>
  )
}
