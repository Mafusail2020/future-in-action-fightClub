import { FilePlus2, X } from 'lucide-react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiGet, apiPost } from '../../api/client'
import { useChatStore } from '../../stores/chatStore'

interface CityDocRow {
  id: string
  title: string
  kind: 'profile' | 'pasted'
  created_at: string
}

/** Paste-a-report box: feeds search_city_state so the AI can cite local facts. */
export function CityDocsBox() {
  const homeCity = useChatStore((s) => s.homeCity)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const queryClient = useQueryClient()

  const docs = useQuery({
    queryKey: ['city-docs', homeCity.city, homeCity.country],
    queryFn: () =>
      apiGet<CityDocRow[]>(
        `/city-docs?city=${encodeURIComponent(homeCity.city)}&country=${encodeURIComponent(homeCity.country)}`,
      ),
    staleTime: 60_000,
  })

  const save = useMutation({
    mutationFn: () =>
      apiPost<{ id: string; chunks: number }>('/city-docs', {
        city: homeCity.city,
        country: homeCity.country,
        title: title.trim() || 'Дані про місто',
        content,
      }),
    onSuccess: () => {
      setTitle('')
      setContent('')
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['city-docs'] })
    },
  })

  const count = docs.data?.length ?? 0

  return (
    <div className="mt-1 px-3">
      {open ? (
        <form
          className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-bg-elevated p-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (content.trim().length >= 20 && !save.isPending) save.mutate()
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">
              Дані про {homeCity.city}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Закрити"
              className="chrome-btn !size-6"
            >
              <X size={13} strokeWidth={1.5} />
            </button>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Назва (звіт, стаття…)"
            aria-label="Назва документа"
            className="rounded-md border border-border-subtle bg-bg-main px-2 py-1 text-[13px] outline-none placeholder:text-text-tertiary focus:border-accent/50"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="Вставте текст про стан міста (мін. 20 символів) — радник зможе шукати й цитувати його"
            aria-label="Текст документа"
            className="resize-y rounded-md border border-border-subtle bg-bg-main px-2 py-1 text-[13px] outline-none placeholder:text-text-tertiary focus:border-accent/50"
          />
          {save.isError && (
            <p className="text-[11px] text-danger">
              Не вдалося зберегти — перевірте, що бекенд запущено
            </p>
          )}
          <button
            type="submit"
            disabled={content.trim().length < 20 || save.isPending}
            className="rounded-md bg-accent-primary-btn px-2 py-1.5 text-xs font-semibold text-ink-950 hover:bg-amber-deep disabled:opacity-40"
          >
            {save.isPending ? 'Індексуємо…' : 'Додати в базу знань'}
          </button>
        </form>
      ) : (
        <button type="button" className="nav-item !h-8 text-sm" onClick={() => setOpen(true)}>
          <FilePlus2 size={16} strokeWidth={1.5} />
          Дані про місто
          {count > 0 && (
            <span className="ml-auto rounded-full bg-accent/15 px-1.5 font-mono text-[10px] text-accent">
              {count}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
