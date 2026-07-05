import { Check, ChevronUp, Layers } from 'lucide-react'
import { useState } from 'react'

import { useMapLayer, useMapModes } from '../../api/queries'
import { useHomeCityRecord } from '../../hooks/useHomeCity'
import { FALLBACK_MODES, formatHour, LEGEND_LABELS, NO_DATA_COLOR } from '../../lib/mapModes'
import { useChatStore } from '../../stores/chatStore'
import { useMapStore } from '../../stores/mapStore'

const RAMP_GRADIENT = 'linear-gradient(90deg, #2fbf71, #f5b84c, #e5484d)'

/**
 * Mode switcher + 24h traffic slider + legend, floating top-right of the map.
 * Layers belong to the user's HOME city (typed in the sidebar), not to the
 * map-marker selection. Always visible; cities without precomputed layers
 * get a "no data" chip.
 */
export function MapModeControls() {
  const homeCity = useChatStore((s) => s.homeCity)
  const mapMode = useMapStore((s) => s.mapMode)
  const setMapMode = useMapStore((s) => s.setMapMode)
  const trafficHour = useMapStore((s) => s.trafficHour)
  const setTrafficHour = useMapStore((s) => s.setTrafficHour)
  const requestFlyTo = useMapStore((s) => s.requestFlyTo)

  const [open, setOpen] = useState(true)
  const { record, isPending: citiesPending } = useHomeCityRecord()
  const modes = useMapModes(record?.id ?? null)
  const hasData = (modes.data?.length ?? 0) > 0
  // No precomputed layers -> still show every mode pill, just without data.
  const available = hasData ? modes.data! : FALLBACK_MODES
  const active = available.find((m) => m.mode === mapMode) ?? null
  // Shares the ModeLayers query (deduped) — here only to show the loading state.
  // Gated by hasData so dataless cities don't fire a guaranteed-404 fetch.
  const layer = useMapLayer(record?.id ?? null, hasData && active ? active.mode : null)

  const searching = citiesPending || (!!record && modes.isPending)

  const toggle = (mode: string) => {
    if (mode === mapMode) {
      setMapMode(null) // second click deselects
      return
    }
    setMapMode(mode)
    // Overlays live at street scale — jump there right away.
    const lng = homeCity.lng ?? record?.lng
    const lat = homeCity.lat ?? record?.lat
    if (lng != null && lat != null) requestFlyTo([lng, lat], 11.5)
  }

  // Collapsed: one compact reopen button. The active overlay stays on the map.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Показати шари мапи"
        className={`absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-sm backdrop-blur transition-colors ${
          mapMode
            ? 'border-accent/60 bg-accent/10 text-accent'
            : 'border-border-subtle bg-bg-elevated/80 text-text-secondary hover:border-text-tertiary hover:text-text-primary'
        }`}
      >
        <Layers size={16} strokeWidth={1.75} aria-hidden />
        Шари
      </button>
    )
  }

  return (
    <div className="absolute top-4 right-4 z-10 flex w-56 flex-col items-stretch gap-2">
      {/* Single switcher block: header + one row per mode */}
      <div className="overflow-hidden rounded-[10px] border border-border-subtle bg-bg-elevated/80 backdrop-blur">
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.14em] text-text-tertiary uppercase">
              Шари мапи
            </p>
            <p className="truncate text-sm font-medium text-text-primary">{homeCity.city}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Сховати шари мапи"
            className="chrome-btn shrink-0"
          >
            <ChevronUp size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        {searching ? (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span
              aria-hidden
              className="size-3 animate-spin rounded-full border-2 border-line border-t-amber"
            />
            <span className="text-xs text-text-secondary">Шукаємо шари…</span>
          </div>
        ) : (
          available.map((m) => {
            const selected = m.mode === mapMode
            return (
              <button
                key={m.mode}
                type="button"
                onClick={() => toggle(m.mode)}
                aria-pressed={selected}
                className={`flex w-full items-center justify-between gap-2 border-b border-border-subtle px-3 py-2.5 text-left text-sm transition-colors last:border-b-0 ${
                  selected
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-secondary hover:bg-bg-main/60 hover:text-text-primary'
                }`}
              >
                <span className="min-w-0 truncate">{m.label}</span>
                {selected && (
                  <Check size={16} strokeWidth={2.5} aria-hidden className="check-in shrink-0" />
                )}
              </button>
            )
          })
        )}
      </div>

      {/* Data remark sits under the switcher */}
      {!searching && !hasData && (
        <p className="rounded-[10px] border border-border-subtle bg-bg-elevated/80 px-3 py-1.5 text-center font-mono text-xs tracking-wide text-text-tertiary uppercase backdrop-blur">
          Немає даних для міста
        </p>
      )}

      {active && layer.isPending && (
        <div className="flex items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-elevated/80 px-3 py-1.5 backdrop-blur">
          <span
            aria-hidden
            className="size-3 animate-spin rounded-full border-2 border-line border-t-amber"
          />
          <span className="text-xs text-text-secondary">Завантажуємо шар…</span>
        </div>
      )}

      {active && layer.isError && (
        <p className="rounded-[10px] border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger backdrop-blur">
          Не вдалося завантажити шар
        </p>
      )}

      {/* 24h slider (traffic) */}
      {active?.temporal && layer.data && (
        <div className="flex items-center gap-2.5 rounded-[10px] border border-border-subtle bg-bg-elevated/80 px-3 py-2 backdrop-blur">
          <input
            type="range"
            min={0}
            max={23}
            step={1}
            value={trafficHour}
            onChange={(e) => setTrafficHour(Number(e.target.value))}
            aria-label="Година доби"
            className="w-36 accent-accent"
          />
          <span className="w-11 font-mono text-xs text-text-primary">
            {formatHour(trafficHour)}
          </span>
        </div>
      )}

      {/* Legend */}
      {active && layer.data && (
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-border-subtle bg-bg-elevated/80 px-3 py-2 backdrop-blur">
          <div className="h-2 w-36 rounded-full" style={{ background: RAMP_GRADIENT }} />
          <div className="flex justify-between font-mono text-[10px] text-text-tertiary">
            <span>{LEGEND_LABELS[active.mode]?.[0] ?? 'Менше'}</span>
            <span>{LEGEND_LABELS[active.mode]?.[1] ?? 'Більше'}</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-text-tertiary">
            <span
              aria-hidden
              className="inline-block h-2 w-4 rounded-sm"
              style={{ background: NO_DATA_COLOR, opacity: 0.6 }}
            />
            немає даних
          </div>
        </div>
      )}
    </div>
  )
}
