import { ExternalLink, X } from 'lucide-react'
import { useEffect } from 'react'

import { useCityDossier } from '../../api/queries'
import type { SourceKind } from '../../api/types'
import { useChatStore } from '../../stores/chatStore'
import { useDossierStore } from '../../stores/dossierStore'

const KIND_LABEL: Record<SourceKind, string> = {
  wikidata: 'Wikidata',
  wikipedia: 'Wikipedia',
  osm: 'OpenStreetMap',
  web: 'Веб',
  ai: 'ШІ',
}

/** Full-screen encyclopedic dossier: every section, fact and source the AI has
 *  gathered about the city. Opened from the sidebar's deep-dive card. */
export function DossierPanel() {
  const open = useDossierStore((s) => s.panelOpen)
  const close = useDossierStore((s) => s.closePanel)
  const homeCity = useChatStore((s) => s.homeCity)
  const { data: dossier } = useCityDossier(homeCity.city, homeCity.country)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open || !dossier) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm md:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Досьє міста ${dossier.city}`}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-border-subtle bg-bg-sidebar shadow-2xl"
      >
        {/* Header — fixed; only the body below scrolls */}
        <div className="flex shrink-0 items-start gap-3 border-b border-border-subtle px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-[0.16em] text-accent uppercase">
              Глибоке досьє
            </p>
            <h2 className="mt-1 font-serif text-2xl leading-tight text-text-primary">
              {dossier.city}
            </h2>
            {dossier.headline && (
              <p className="mt-1 text-[13px] leading-snug text-text-secondary">{dossier.headline}</p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Закрити"
            className="chrome-btn shrink-0"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
          {/* Facts */}
          {dossier.facts.length > 0 && (
            <section>
              <SectionLabel>Ключові дані</SectionLabel>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {dossier.facts.map((f, i) => (
                  <div key={i} className="rounded-xl border border-border-subtle bg-bg-elevated/50 p-2.5">
                    <p className="text-[10px] tracking-wide text-text-tertiary uppercase">{f.label}</p>
                    <p className="mt-0.5 text-[13px] font-semibold text-text-primary">{f.value}</p>
                    {f.url ? (
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-block font-mono text-[9.5px] text-accent hover:underline"
                      >
                        {f.source} ↗
                      </a>
                    ) : (
                      <p className="mt-0.5 font-mono text-[9.5px] text-text-tertiary">{f.source}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sections */}
          {dossier.sections.length > 0 && (
            <section>
              <SectionLabel>Аналіз за напрямами</SectionLabel>
              <div className="flex flex-col gap-3">
                {dossier.sections.map((s) => (
                  <article
                    key={s.key}
                    className="rounded-xl border border-border-subtle bg-bg-elevated/40 p-3.5"
                  >
                    <h3 className="mb-1 text-[14px] font-semibold text-text-primary">{s.title}</h3>
                    <p className="text-[13px] leading-relaxed text-text-secondary">{s.body}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Sources */}
          {dossier.sources.length > 0 && (
            <section>
              <SectionLabel>Джерела</SectionLabel>
              <ol className="flex flex-col gap-1">
                {dossier.sources.map((src) => (
                  <li key={src.id} className="flex items-baseline gap-2 text-[12px]">
                    <span className="font-mono text-[10px] text-text-tertiary">{src.id}</span>
                    <span className="rounded border border-border-subtle px-1 text-[9px] text-text-tertiary">
                      {KIND_LABEL[src.kind] ?? src.kind}
                    </span>
                    {src.url ? (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                      >
                        {src.title}
                        <ExternalLink size={11} strokeWidth={1.75} />
                      </a>
                    ) : (
                      <span className="text-text-secondary">{src.title}</span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <p className="text-[10.5px] text-text-tertiary">
            Зібрано з відкритих даних (Wikidata, OpenStreetMap, Wikipedia) та веб-пошуку в реальному
            часі, синтезовано ШІ.
          </p>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[10px] tracking-[0.14em] text-text-tertiary uppercase">
      {children}
    </p>
  )
}
