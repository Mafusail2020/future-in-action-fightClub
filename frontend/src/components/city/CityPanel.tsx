import { useEffect, useRef } from 'react'

import { useCityDetail } from '../../api/queries'
import { useMapStore } from '../../stores/mapStore'
import { EmptyState, ErrorBox, Spinner } from '../ui/Bits'
import { SolutionList } from './CaseList'

/** Fixed left panel: the selected city's implemented solutions. */
export function CityPanel() {
  const selectedCityId = useMapStore((s) => s.selectedCityId)
  const selectCity = useMapStore((s) => s.selectCity)
  const detail = useCityDetail(selectedCityId)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const city = detail.data?.city

  useEffect(() => {
    if (city) headingRef.current?.focus()
  }, [city?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectCity(null)
    }
    if (selectedCityId) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedCityId, selectCity])

  if (!selectedCityId) return null

  return (
    <aside
      aria-label={city ? `Рішення міста ${city.name}` : 'Місто'}
      className="pointer-events-auto absolute top-3 bottom-3 left-3 z-10 flex w-[340px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-line bg-ink-900/95 shadow-2xl backdrop-blur max-md:top-auto max-md:right-3 max-md:max-h-[55dvh] max-md:w-auto"
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
            {city
              ? `${city.country}${city.population ? ` · ${Math.round(city.population / 1000)} тис.` : ''}`
              : '…'}
          </p>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-lg leading-tight font-semibold outline-none"
          >
            {city?.name ?? 'Завантаження…'}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => selectCity(null)}
          aria-label="Закрити панель міста"
          className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:border-amber hover:text-paper"
        >
          Esc
        </button>
      </header>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto">
        {detail.isPending && <Spinner label="Завантажуємо рішення…" />}
        {detail.isError && (
          <ErrorBox message="Не вдалося завантажити місто." onRetry={() => detail.refetch()} />
        )}
        {detail.data?.solutions.length === 0 && (
          <EmptyState
            title="Для цього міста ще немає рішень"
            hint="База поповнюється — загляньте пізніше"
          />
        )}
        {detail.data && detail.data.solutions.length > 0 && (
          <SolutionList solutions={detail.data.solutions} />
        )}
      </div>
    </aside>
  )
}
