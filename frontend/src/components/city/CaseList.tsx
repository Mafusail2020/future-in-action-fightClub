import { Link } from 'react-router-dom'

import type { Solution } from '../../api/types'
import { categoryLabel } from '../../lib/categories'

/** Each solution opens its full story in the same tab. */
export function SolutionList({ solutions }: { solutions: Solution[] }) {
  return (
    <ul className="divide-y divide-line/60">
      {solutions.map((s) => (
        <li key={s.id}>
          <Link
            to={`/solution/${s.id}`}
            className="group block px-4 py-3 transition-colors hover:bg-ink-800"
          >
            <div className="flex items-center gap-2">
              <span className="rounded border border-cyan/40 bg-cyan/10 px-1.5 py-px font-mono text-[10px] tracking-wide text-cyan uppercase">
                {categoryLabel(s.category)}
              </span>
              {s.year_start && (
                <span className="font-mono text-[11px] text-faint">
                  {s.year_start}
                  {s.year_end ? `–${s.year_end}` : ''}
                </span>
              )}
              <span
                aria-hidden
                className="ml-auto text-faint transition-colors group-hover:text-amber"
              >
                →
              </span>
            </div>
            <p className="mt-1 text-sm leading-snug font-medium text-paper group-hover:text-amber">
              {s.title}
            </p>
            {s.outcome && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{s.outcome}</p>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
