import { Marker, useMap } from 'react-map-gl/maplibre'

import { useMapStore } from '../../stores/mapStore'

/**
 * Matched solutions from the latest chat turn, as glowing markers on their
 * cities. A match card hovered in the chat lights its marker — the chat
 * shortlist and the map are the same evidence.
 */
export function MatchMarkers() {
  const matches = useMapStore((s) => s.matches)
  const activeSolutionId = useMapStore((s) => s.activeSolutionId)
  const { current: map } = useMap()

  return (
    <>
      {matches.map((match) => {
        const city = match.solution?.city
        if (!city) return null
        const isActive = activeSolutionId === match.solution_id
        return (
          <Marker key={match.solution_id} longitude={city.lng} latitude={city.lat} anchor="bottom">
            <button
              type="button"
              aria-label={`Рішення: ${match.solution!.title} — ${city.name}`}
              data-active={isActive}
              onClick={() => map?.flyTo({ center: [city.lng, city.lat], zoom: 6, duration: 1200 })}
              className={`flex flex-col items-center transition-transform ${
                isActive ? 'scale-125' : ''
              }`}
            >
              <span
                className={`rounded border px-1.5 py-px font-mono text-[10px] whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-amber bg-amber text-ink-950'
                    : 'border-amber/50 bg-ink-900/90 text-amber'
                }`}
              >
                {Math.round(match.score * 100)}%
              </span>
              <span
                aria-hidden
                className={`mt-0.5 size-2.5 rounded-full bg-amber ${
                  isActive ? '' : 'animate-pulse-soft'
                }`}
                style={{ boxShadow: '0 0 8px rgba(245, 184, 76, 0.9)' }}
              />
            </button>
          </Marker>
        )
      })}
    </>
  )
}
