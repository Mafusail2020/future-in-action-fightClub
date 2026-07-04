import Markdown from 'react-markdown'
import { useParams } from 'react-router-dom'
import remarkGfm from 'remark-gfm'

import { useCase } from '../../api/queries'
import { DOMAIN_LABELS } from '../city/CityPanel'
import { EmptyState, ErrorBox, Spinner } from '../ui/Bits'

/** Obsidian-like reading page for one solved-problem case. Opens in its own tab. */
export function CasePage() {
  const { id } = useParams<{ id: string }>()
  const query = useCase(id)

  return (
    <div className="panel-scroll min-h-full overflow-y-auto bg-ink-950">
      <div className="mx-auto max-w-[46rem] px-5 py-10 max-md:py-6">
        {query.isPending && <Spinner label="Завантажуємо кейс…" />}
        {query.isError && (
          <ErrorBox message="Кейс не знайдено або сервер недоступний." onRetry={() => query.refetch()} />
        )}

        {query.data && (
          <article>
            <header className="mb-8 border-b border-line pb-6">
              <p className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">
                Кейс · {query.data.city.name}, {query.data.city.country}
                {query.data.city.population
                  ? ` · ${Math.round(query.data.city.population / 1000)} тис. мешканців`
                  : ''}
              </p>
              <h1 className="font-display mt-2 text-3xl leading-tight font-semibold max-md:text-2xl">
                {query.data.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded border border-cyan/40 bg-cyan/10 px-2 py-0.5 font-mono text-[11px] tracking-wide text-cyan uppercase">
                  {DOMAIN_LABELS[query.data.problem_domain] ?? query.data.problem_domain}
                </span>
                {query.data.year_start && (
                  <span className="font-mono text-xs text-muted">
                    {query.data.year_start}
                    {query.data.year_end ? `–${query.data.year_end}` : ' →'}
                  </span>
                )}
                {query.data.cost_estimate && (
                  <span className="font-mono text-xs text-muted">
                    · {query.data.cost_estimate}
                  </span>
                )}
              </div>
              {query.data.outcome && (
                <p className="mt-4 rounded-lg border border-amber/30 bg-amber/10 px-3.5 py-2.5 text-sm text-paper">
                  <span className="font-mono text-[11px] tracking-wide text-amber uppercase">
                    Результат:{' '}
                  </span>
                  {query.data.outcome}
                </p>
              )}
            </header>

            {query.data.full_text ? (
              <div className="md-body text-[15.5px] leading-relaxed">
                <Markdown remarkPlugins={[remarkGfm]}>{query.data.full_text}</Markdown>
              </div>
            ) : (
              <EmptyState title="Повний опис ще не додано" />
            )}

            {query.data.source_urls.length > 0 && (
              <footer className="mt-10 border-t border-line pt-4">
                <p className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
                  Джерела
                </p>
                <ul className="mt-2 space-y-1">
                  {query.data.source_urls.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm break-all text-amber underline underline-offset-2 hover:text-amber-deep"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </footer>
            )}
          </article>
        )}
      </div>
    </div>
  )
}
