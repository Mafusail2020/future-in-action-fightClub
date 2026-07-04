import { useState } from 'react'

import type { Citation } from '../../api/types'
import { useMapStore } from '../../stores/mapStore'

const SOURCE_LABELS: Record<Citation['source_type'], string> = {
  document: 'Документ',
  digest: 'Дайджест',
  metric: 'Показник',
  feature: 'Об’єкт на мапі',
  solution_case: 'Кейс міста',
}

/**
 * The signature element: a citation number that is the same evidence as the
 * amber mark on the map. Hover/focus lights the linked features; click opens
 * the source card.
 */
export function CitationChip({ n, citation }: { n: number; citation?: Citation }) {
  const [open, setOpen] = useState(false)
  const setActiveCitation = useMapStore((s) => s.setActiveCitation)
  const activeCitation = useMapStore((s) => s.activeCitation)

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="cite-chip"
        data-active={activeCitation === n || open}
        aria-label={citation ? `Джерело ${n}: ${citation.title}` : `Джерело ${n}`}
        aria-expanded={open}
        onMouseEnter={() => setActiveCitation(n)}
        onMouseLeave={() => setActiveCitation(null)}
        onFocus={() => setActiveCitation(n)}
        onBlur={() => {
          setActiveCitation(null)
          setOpen(false)
        }}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
      >
        {n}
      </button>

      {open && citation && (
        <span
          role="tooltip"
          className="absolute bottom-[1.9em] left-0 z-30 block w-64 rounded-lg border border-line bg-ink-800 p-3 text-left shadow-xl"
        >
          <span className="block font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
            {SOURCE_LABELS[citation.source_type]}
            {citation.raion ? ` · ${citation.raion}` : ''}
            {citation.city ? ` · ${citation.city}` : ''}
          </span>
          <span className="mt-1 block text-xs leading-snug font-medium text-paper">
            {citation.url ? (
              <a
                href={citation.url}
                target="_blank"
                rel="noreferrer"
                className="text-amber underline underline-offset-2"
              >
                {citation.title}
              </a>
            ) : (
              citation.title
            )}
          </span>
          {citation.snippet && (
            <span className="mt-1.5 line-clamp-4 block text-[11px] leading-snug text-muted">
              {citation.snippet}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
