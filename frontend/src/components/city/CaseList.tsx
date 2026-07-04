import type { CaseSummaryOut } from '../../api/types'
import { DOMAIN_LABELS } from './CityPanel'

/** Each case opens its full story in a separate browser tab (like a note in Obsidian). */
export function CaseList({ cases }: { cases: CaseSummaryOut[] }) {
  return (
    <ul className="divide-y divide-line/60">
      {cases.map((c) => (
        <li key={c.id}>
          <a
            href={`/case/${c.id}`}
            target="_blank"
            rel="noreferrer"
            className="group block px-4 py-3 transition-colors hover:bg-ink-800"
          >
            <div className="flex items-center gap-2">
              <span className="rounded border border-cyan/40 bg-cyan/10 px-1.5 py-px font-mono text-[10px] tracking-wide text-cyan uppercase">
                {DOMAIN_LABELS[c.problem_domain] ?? c.problem_domain}
              </span>
              {c.year_start && (
                <span className="font-mono text-[11px] text-faint">
                  {c.year_start}
                  {c.year_end ? `–${c.year_end}` : ''}
                </span>
              )}
              <span
                aria-hidden
                className="ml-auto text-faint transition-colors group-hover:text-amber"
              >
                ↗
              </span>
            </div>
            <p className="mt-1 text-sm leading-snug font-medium text-paper group-hover:text-amber">
              {c.title}
            </p>
            {c.outcome && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{c.outcome}</p>}
          </a>
        </li>
      ))}
    </ul>
  )
}
