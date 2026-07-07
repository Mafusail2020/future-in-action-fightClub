import { ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { useSolutions } from '../../api/queries'
import type { Category, Solution } from '../../api/types'
import { CATEGORY_LABELS } from '../../lib/categories'
import { ukCityName } from '../../lib/cityNamesUk'
import { useMapStore } from '../../stores/mapStore'
import { EmptyState, ErrorBox, Spinner } from '../ui/Bits'

/**
 * Self-contained "Всі проблеми" trigger + dropdown: a category accordion
 * (one open at a time) listing every solution in the catalog.
 */
export function ProblemsDropdown() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Category | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const solutions = useSolutions(open)
  const selectedCityId = useMapStore((s) => s.selectedCityId)

  // The city panel covers this corner — don't leave the dropdown open under it.
  useEffect(() => {
    if (selectedCityId) setOpen(false)
  }, [selectedCityId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const groups = useMemo(() => {
    const byCategory = new Map<Category, Solution[]>()
    for (const s of solutions.data ?? []) {
      const list = byCategory.get(s.category) ?? []
      list.push(s)
      byCategory.set(s.category, list)
    }
    // Vocabulary order, empty categories skipped.
    return (Object.keys(CATEGORY_LABELS) as Category[])
      .filter((c) => byCategory.has(c))
      .map((c) => ({ category: c, items: byCategory.get(c)! }))
  }, [solutions.data])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 rounded-[10px] border border-border-subtle bg-bg-elevated/80 px-3 py-2 text-sm text-text-secondary backdrop-blur transition-colors hover:border-text-tertiary hover:text-text-primary"
      >
        Всі проблеми
        <ChevronDown
          size={18}
          strokeWidth={2}
          aria-hidden
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="panel-scroll absolute top-full left-0 z-20 mt-2 max-h-[60dvh] w-[340px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-[10px] border border-border-subtle bg-bg-elevated shadow-2xl">
          {solutions.isPending && <Spinner label="Завантажуємо каталог…" />}
          {solutions.isError && (
            <ErrorBox message="Не вдалося завантажити каталог." onRetry={() => solutions.refetch()} />
          )}
          {solutions.data?.length === 0 && (
            <EmptyState title="Каталог порожній" hint="База поповнюється — загляньте пізніше" />
          )}

          {groups.map(({ category, items }, i) => {
            const isExpanded = expanded === category
            return (
              <div
                key={category}
                className={`border-b border-border-subtle last:border-b-0 ${
                  i === 0 ? 'card-fade-in' : 'card-grow-in'
                }`}
                style={i > 0 ? { animationDelay: `${i * 55}ms` } : undefined}
              >
                {/* single child of the grid row — collapses with it while animating */}
                <div>
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : category)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-bg-main/60"
                  >
                    <span className="min-w-0 truncate rounded border border-cyan/40 bg-cyan/10 px-1.5 py-px font-mono text-[10px] tracking-wide text-cyan uppercase">
                      {CATEGORY_LABELS[category]}
                    </span>
                    <span className="ml-auto font-mono text-[11px] text-text-tertiary">
                      {items.length}
                    </span>
                    <ChevronDown
                      size={16}
                      strokeWidth={2}
                      aria-hidden
                      className={`shrink-0 text-text-tertiary transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isExpanded && (
                    <ul className="pb-1">
                      {items.map((s) => (
                        <li key={s.id}>
                          <Link
                            to={`/solution/${s.id}`}
                            className="group block px-3.5 py-2 pl-5 transition-colors hover:bg-bg-main/60"
                          >
                            <p className="text-sm leading-snug text-text-primary group-hover:text-accent">
                              {s.title}
                            </p>
                            {s.city && (
                              <p className="mt-0.5 font-mono text-[11px] text-text-tertiary">
                                {ukCityName(s.city.name)} · {s.city.country}
                              </p>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
