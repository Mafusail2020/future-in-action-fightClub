import type { Match } from '../../api/types'
import { categoryLabel } from '../../lib/categories'
import { ukCityName } from '../../lib/cityNamesUk'
import { useMapStore } from '../../stores/mapStore'

/**
 * The signature element: a matched solution card that is the same evidence as
 * the glowing marker on the map. Hover/focus lights the marker; click opens
 * the full solution in a new tab.
 */
export function MatchCard({ match }: { match: Match }) {
  const setActiveSolution = useMapStore((s) => s.setActiveSolution)
  const activeSolutionId = useMapStore((s) => s.activeSolutionId)
  const s = match.solution
  if (!s) return null

  const isActive = activeSolutionId === match.solution_id

  return (
    <a
      href={`/solution/${s.id}`}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => setActiveSolution(match.solution_id)}
      onMouseLeave={() => setActiveSolution(null)}
      onFocus={() => setActiveSolution(match.solution_id)}
      onBlur={() => setActiveSolution(null)}
      className={`block rounded-lg border px-3 py-2 transition-colors ${
        isActive ? 'border-amber bg-amber/10' : 'border-line bg-ink-800 hover:border-amber/60'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-medium text-amber">
          {Math.round(match.score * 100)}%
        </span>
        <span className="truncate text-xs text-muted">
          {s.city ? ukCityName(s.city.name) : ''}
          {s.city ? `, ${s.city.country}` : ''}
        </span>
        <span className="ml-auto rounded border border-cyan/40 bg-cyan/10 px-1.5 py-px font-mono text-[9px] tracking-wide text-cyan uppercase">
          {categoryLabel(s.category)}
        </span>
      </div>
      <p className="mt-0.5 text-[13px] leading-snug font-medium text-paper">{s.title}</p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{match.rationale}</p>
    </a>
  )
}
