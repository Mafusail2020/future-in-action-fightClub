import { Check, FileText, Loader2, Sparkles, Telescope } from 'lucide-react'

import { useCityDossier } from '../../api/queries'
import { useDeepDive } from '../../hooks/useDeepDive'
import { useChatStore } from '../../stores/chatStore'
import { useDossierStore } from '../../stores/dossierStore'

const PHASES = [
  { label: 'Відкриті дані · Wikidata · OSM', match: 'opendata' },
  { label: 'Веб-пошук у реальному часі', match: 'web' },
  { label: 'Синтез 20-розділового аналізу', match: 'synth' },
  { label: 'Індексація для пошуку', match: 'ingest' },
] as const

function phaseIndex(stage: string): number {
  const key = stage.split(':')[0]
  const i = PHASES.findIndex((p) => p.match === key)
  return i === -1 ? 0 : i
}

/** Sidebar control for the deep city dossier: shows what's cached, launches the
 *  live deep-dive, and plays the research-in-progress theater. */
export function DeepDiveCard() {
  const homeCity = useChatStore((s) => s.homeCity)
  const { data: dossier } = useCityDossier(homeCity.city, homeCity.country)
  const status = useDossierStore((s) => s.status)
  const stage = useDossierStore((s) => s.stage)
  const found = useDossierStore((s) => s.found)
  const error = useDossierStore((s) => s.error)
  const openPanel = useDossierStore((s) => s.openPanel)
  const { start } = useDeepDive()

  const run = () => start(homeCity.city, homeCity.country)

  if (status === 'running') {
    const active = phaseIndex(stage)
    return (
      <div className="mt-2 px-3">
        <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-accent">
            <Telescope size={14} strokeWidth={1.75} className="animate-pulse-soft" />
            Глибокий аналіз: {homeCity.city}
          </p>
          <ul className="flex flex-col gap-1.5">
            {PHASES.map((p, i) => {
              const done = i < active || (status === 'running' && stage.endsWith(':done') && i <= active)
              const isActive = i === active && !done
              return (
                <li key={p.match} className="flex items-center gap-2 text-[12px]">
                  {done ? (
                    <Check size={13} className="text-emerald-400" strokeWidth={2.5} />
                  ) : isActive ? (
                    <Loader2 size={13} className="animate-spin text-accent" strokeWidth={2} />
                  ) : (
                    <span className="size-1.5 rounded-full bg-text-tertiary/40" />
                  )}
                  <span className={done ? 'text-text-tertiary line-through' : isActive ? 'text-text-primary' : 'text-text-tertiary'}>
                    {p.label}
                    {p.match === 'web' && found > 0 && (
                      <span className="ml-1 text-accent">· {found} джерел</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    )
  }

  if (dossier && (dossier.sections.length > 0 || dossier.facts.length > 0)) {
    return (
      <div className="mt-2 px-3">
        <button
          type="button"
          onClick={openPanel}
          className="group w-full rounded-xl border border-border-subtle bg-bg-elevated/50 p-3 text-left transition-colors hover:border-accent/40"
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
            <FileText size={14} strokeWidth={1.75} className="text-accent" />
            Глибоке досьє міста
            <span className="ml-auto text-[11px] font-normal text-accent group-hover:underline">
              Відкрити ↗
            </span>
          </p>
          {dossier.headline && (
            <p className="mt-1.5 line-clamp-3 text-[12px] leading-snug text-text-secondary">
              {dossier.headline}
            </p>
          )}
        </button>
        <button
          type="button"
          onClick={run}
          className="mt-1 w-full text-center font-mono text-[10.5px] text-text-tertiary hover:text-accent"
        >
          ↻ Оновити аналіз
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 px-3">
      <button
        type="button"
        onClick={run}
        className="flex w-full items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-left transition-colors hover:bg-accent/15"
      >
        <Sparkles size={16} strokeWidth={1.75} className="shrink-0 text-accent" />
        <span>
          <span className="block text-[13px] font-semibold text-text-primary">
            Глибокий аналіз міста
          </span>
          <span className="block text-[11px] text-text-tertiary">
            Wikidata · OSM · веб-пошук у реальному часі
          </span>
        </span>
      </button>
      {error && <p className="mt-1 px-1 text-[11px] text-danger">{error}</p>}
    </div>
  )
}
