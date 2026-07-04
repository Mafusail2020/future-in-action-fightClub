import { useState } from 'react'

import { useChatStore } from '../../stores/chatStore'

export function HistorySidebar() {
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const openSession = useChatStore((s) => s.openSession)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const renameSession = useChatStore((s) => s.renameSession)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  return (
    <nav
      aria-label="Історія розмов"
      className="panel-scroll absolute inset-0 z-20 overflow-y-auto bg-ink-900/97 p-3 backdrop-blur"
    >
      {sessions.length === 0 && (
        <p className="px-2 py-6 text-center text-sm text-muted">Розмов ще не було</p>
      )}
      <ul className="flex flex-col gap-1">
        {sessions.map((session) => (
          <li key={session.id} className="group relative">
            {renamingId === session.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  renameSession(session.id, draft.trim() || session.title)
                  setRenamingId(null)
                }}
                className="flex gap-1.5"
              >
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
                  aria-label="Нова назва розмови"
                  className="w-full rounded-lg border border-amber/60 bg-ink-800 px-2.5 py-1.5 text-sm outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-amber px-2 text-xs font-semibold text-ink-950"
                >
                  OK
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openSession(session.id)}
                  aria-current={session.id === activeSessionId ? 'true' : undefined}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    session.id === activeSessionId
                      ? 'bg-ink-700 text-paper'
                      : 'text-muted hover:bg-ink-800 hover:text-paper'
                  }`}
                >
                  <span className="line-clamp-1">{session.title}</span>
                  <span className="font-mono text-[10px] text-faint">
                    {new Date(session.createdAt).toLocaleDateString('uk-UA')} ·{' '}
                    {Math.ceil(session.messages.length / 2)} пит.
                  </span>
                </button>
                <span className="absolute top-1.5 right-1.5 hidden gap-1 group-focus-within:flex group-hover:flex">
                  <button
                    type="button"
                    aria-label={`Перейменувати розмову «${session.title}»`}
                    onClick={() => {
                      setRenamingId(session.id)
                      setDraft(session.title)
                    }}
                    className="rounded border border-line bg-ink-800 px-1.5 py-0.5 text-[10px] text-muted hover:text-paper"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    aria-label={`Видалити розмову «${session.title}»`}
                    onClick={() => deleteSession(session.id)}
                    className="rounded border border-line bg-ink-800 px-1.5 py-0.5 text-[10px] text-muted hover:border-danger hover:text-danger"
                  >
                    ✕
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
