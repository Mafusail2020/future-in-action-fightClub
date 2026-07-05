import Markdown from 'react-markdown'
import { useParams } from 'react-router-dom'
import remarkGfm from 'remark-gfm'

import { useSolution } from '../../api/queries'
import { categoryLabel } from '../../lib/categories'
import { ErrorBox, Spinner } from '../ui/Bits'

/** Reading page for one solution. Opens in its own tab. */
export function SolutionPage() {
  const { id } = useParams<{ id: string }>()
  const query = useSolution(id)
  const s = query.data

  return (
    <div className="panel-scroll min-h-full overflow-y-auto bg-ink-950">
      <div className="mx-auto max-w-[46rem] px-5 py-10 max-md:py-6">
        {query.isPending && <Spinner label="Завантажуємо рішення…" />}
        {query.isError && (
          <ErrorBox
            message="Рішення не знайдено або сервер недоступний."
            onRetry={() => query.refetch()}
          />
        )}

        {s && (
          <article>
            <header className="mb-8 border-b border-line pb-6">
              <p className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">
                Рішення · {s.city?.name ?? '—'}
                {s.city ? `, ${s.city.country}` : ''}
                {s.city?.population
                  ? ` · ${Math.round(s.city.population / 1000)} тис. мешканців`
                  : ''}
              </p>
              <h1 className="font-display mt-2 text-3xl leading-tight font-semibold max-md:text-2xl">
                {s.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded border border-cyan/40 bg-cyan/10 px-2 py-0.5 font-mono text-[11px] tracking-wide text-cyan uppercase">
                  {categoryLabel(s.category)}
                </span>
                {s.year_start && (
                  <span className="font-mono text-xs text-muted">
                    {s.year_start}
                    {s.year_end ? `–${s.year_end}` : ' →'}
                  </span>
                )}
                {s.cost && <span className="font-mono text-xs text-muted">· {s.cost}</span>}
              </div>
              {s.outcome && (
                <p className="mt-4 rounded-lg border border-amber/30 bg-amber/10 px-3.5 py-2.5 text-sm text-paper">
                  <span className="font-mono text-[11px] tracking-wide text-amber uppercase">
                    Результат:{' '}
                  </span>
                  {s.outcome}
                </p>
              )}
            </header>

            <section className="md-body text-[15.5px] leading-relaxed">
              <h2>Проблема</h2>
              <Markdown remarkPlugins={[remarkGfm]}>{s.problem}</Markdown>
              <h2>Що зробили</h2>
              <Markdown remarkPlugins={[remarkGfm]}>{s.solution}</Markdown>
            </section>

            {s.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-1.5">
                {s.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] text-muted"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {s.source_urls.length > 0 && (
              <footer className="mt-10 border-t border-line pt-4">
                <p className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
                  Джерела
                </p>
                <ul className="mt-2 space-y-1">
                  {s.source_urls.map((url) => (
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
