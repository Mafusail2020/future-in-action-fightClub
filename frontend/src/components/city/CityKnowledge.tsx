import { ChevronDown, Sparkles } from 'lucide-react'
import { useState } from 'react'

import { useCityProfile } from '../../api/queries'
import type { CityProfile } from '../../api/types'
import { categoryLabel } from '../../lib/categories'
import { useChatStore } from '../../stores/chatStore'

const TIER_LABEL: Record<string, string> = {
  small: 'мале місто',
  'mid-size': 'середнє місто',
  large: 'велике місто',
  metropolis: 'мегаполіс',
}

/** Everything the AI holds on the user's home city, shown by default in the
 *  sidebar so the knowledge behind its answers is visible — not hidden until a
 *  chat turn. Sits directly above the "Дані про місто" report box. */
export function CityKnowledge() {
  const homeCity = useChatStore((s) => s.homeCity)
  const [open, setOpen] = useState(false)
  const { data, isLoading, isError } = useCityProfile(homeCity.city, homeCity.country)

  if (isError) return null

  return (
    <div className="mt-2 px-3">
      <div className="rounded-xl border border-border-subtle bg-bg-elevated/50">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left"
        >
          <Sparkles size={13} strokeWidth={1.75} className="text-accent" />
          <span className="text-xs font-medium text-text-secondary">
            Що радник знає про місто
          </span>
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={`ml-auto text-text-tertiary transition-transform ${open ? '' : '-rotate-90'}`}
          />
        </button>

        {open && (
          <div className="flex flex-col gap-2.5 px-2.5 pb-2.5">
            {isLoading ? (
              <Skeleton />
            ) : data ? (
              <Profile profile={data} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function Profile({ profile }: { profile: CityProfile }) {
  const meta: [string, string | null][] = [
    ['Регіон', profile.region],
    ['Розмір', profile.population_tier ? (TIER_LABEL[profile.population_tier] ?? profile.population_tier) : null],
    ['Клімат', profile.climate],
    ['Забудова', profile.density],
    ['Економіка', profile.economy],
  ]
  const rows = meta.filter(([, v]) => v)

  return (
    <>
      {profile.summary && (
        <p className="text-[12.5px] leading-relaxed text-text-secondary">{profile.summary}</p>
      )}

      {rows.length > 0 && (
        <dl className="flex flex-col gap-1 border-t border-border-subtle pt-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-[12px]">
              <dt className="w-[68px] shrink-0 text-text-tertiary">{k}</dt>
              <dd className="text-text-secondary">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {profile.problem_domains.length > 0 && (
        <div className="border-t border-border-subtle pt-2">
          <p className="mb-1.5 font-mono text-[10px] tracking-[0.12em] text-text-tertiary uppercase">
            Проблемні напрями
          </p>
          <div className="flex flex-wrap gap-1">
            {profile.problem_domains.map((d) => (
              <span
                key={d}
                className="rounded-full border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[10.5px] text-accent"
              >
                {categoryLabel(d)}
              </span>
            ))}
          </div>
        </div>
      )}

      {profile.notable_challenges.length > 0 && (
        <div className="border-t border-border-subtle pt-2">
          <p className="mb-1.5 font-mono text-[10px] tracking-[0.12em] text-text-tertiary uppercase">
            Ключові виклики
          </p>
          <ul className="flex flex-col gap-1">
            {profile.notable_challenges.map((c, i) => (
              <li key={i} className="flex gap-1.5 text-[12px] text-text-secondary">
                <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-amber/70" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="border-t border-border-subtle pt-2 text-[10.5px] leading-snug text-text-tertiary">
        Згенеровано ШІ-аналізом міста. Додайте звіти нижче, щоб уточнити й дати радникові джерела для
        цитування.
      </p>
    </>
  )
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-1.5" aria-hidden>
      {[92, 100, 74].map((w, i) => (
        <div
          key={i}
          className="animate-pulse-soft h-2.5 rounded bg-bg-main"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  )
}
