import { MessageSquare, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { useChatStore } from '../../stores/chatStore'

/** Full chats list in the canvas — opened by the sidebar «Чати» nav item. */
export function ChatsView() {
  const sessions = useChatStore((s) => s.sessions)
  const openSession = useChatStore((s) => s.openSession)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const setCanvasView = useChatStore((s) => s.setCanvasView)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  // Match against titles AND message text, so old conversations are findable.
  const q = query.trim().toLowerCase()
  const visible = q
    ? sessions.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.messages.some((m) => m.content.toLowerCase().includes(q)),
      )
    : sessions

  return (
    <div className="panel-scroll h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-6 py-12 max-md:px-4 max-md:py-8">
        <h1 className="font-serif text-3xl text-text-primary">Ваші чати</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          {sessions.length > 0
            ? `${sessions.length} розмов — зберігаються локально у вашому браузері`
            : 'Розмов ще не було'}
        </p>

        {sessions.length > 0 && (
          <div className="relative mt-6">
            <Search
              size={16}
              strokeWidth={1.5}
              aria-hidden
              className="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              placeholder="Пошук у назвах і повідомленнях…"
              aria-label="Пошук чатів"
              className="w-full rounded-[10px] border border-border-subtle bg-bg-elevated py-2 pr-3 pl-9 text-[15px] outline-none placeholder:text-text-tertiary focus:border-text-tertiary"
            />
          </div>
        )}

        {q && visible.length === 0 && (
          <p className="mt-8 text-center text-sm text-text-tertiary">
            Нічого не знайдено за «{query.trim()}»
          </p>
        )}

        <ul className="mt-4 flex flex-col gap-1">
          {visible.map((session) => (
            <li key={session.id} className="group relative">
              <button
                type="button"
                onClick={() => {
                  openSession(session.id)
                  setCanvasView('chat')
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left transition-colors hover:border-border-subtle hover:bg-bg-elevated"
              >
                <MessageSquare
                  size={18}
                  strokeWidth={1.5}
                  className="shrink-0 text-text-tertiary"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-text-primary">
                    {session.title}
                  </span>
                  <span className="block text-xs text-text-tertiary">
                    {new Date(session.createdAt).toLocaleDateString('uk-UA', {
                      day: 'numeric',
                      month: 'long',
                    })}{' '}
                    · {Math.ceil(session.messages.length / 2)} пит.
                  </span>
                </span>
              </button>

              {confirmingId === session.id ? (
                <span className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2 rounded-lg bg-bg-elevated px-2 py-1">
                  <span className="text-xs text-text-secondary">Видалити?</span>
                  <button
                    type="button"
                    onClick={() => deleteSession(session.id)}
                    className="rounded-md bg-danger/20 px-2 py-0.5 text-xs font-medium text-danger hover:bg-danger/30"
                  >
                    Так
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setConfirmingId(null)}
                    onBlur={() => setConfirmingId(null)}
                    className="rounded-md px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary"
                  >
                    Ні
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={`Видалити «${session.title}»`}
                  onClick={() => setConfirmingId(session.id)}
                  className="chrome-btn absolute top-1/2 right-3 hidden -translate-y-1/2 group-focus-within:flex group-hover:flex hover:!text-danger"
                >
                  <Trash2 size={16} strokeWidth={1.5} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
