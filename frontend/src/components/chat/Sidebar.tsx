import {
  ChevronDown,
  ChevronsUpDown,
  MessageSquare,
  PanelLeft,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useState } from 'react'

import { useChatStore } from '../../stores/chatStore'
import { CityAutocomplete } from './CityAutocomplete'
import { CityDocsBox } from './CityDocsBox'
import { CityKnowledge } from '../city/CityKnowledge'
import { DeepDiveCard } from '../city/DeepDiveCard'

const USER_NAME = 'User'

/** Claude-style sidebar: logotype, nav, city context, recents, account footer. */
export function Sidebar() {
  const toggleSidebar = useChatStore((s) => s.toggleSidebar)
  const newSession = useChatStore((s) => s.newSession)
  const canvasView = useChatStore((s) => s.canvasView)
  const toggleCanvasView = useChatStore((s) => s.toggleCanvasView)
  const setCanvasView = useChatStore((s) => s.setCanvasView)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  return (
    <nav
      aria-label="Навігація"
      className="flex h-full w-[288px] flex-none flex-col border-r border-border-subtle bg-bg-sidebar"
    >
      {/* 1.1 Logotype row: 56px total */}
      <div className="flex h-14 items-center justify-between pt-4 pr-3 pl-5">
        <span className="font-serif text-[26px] leading-none tracking-[-0.01em] text-text-primary">
          Радник
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            className="chrome-btn"
            aria-label="Пошук у чатах"
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((v) => !v)
              if (searchOpen) setQuery('')
            }}
          >
            <Search size={18} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="chrome-btn"
            aria-label="Згорнути бокову панель"
            onClick={toggleSidebar}
          >
            <PanelLeft size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 1.2 Primary navigation: tight 40px rows, 2px gaps */}
      <div className="mt-4 flex flex-col gap-0.5 px-3">
        <button
          type="button"
          className="nav-item"
          onClick={() => {
            newSession()
            setCanvasView('chat')
          }}
        >
          <Plus size={20} strokeWidth={1.5} />
          <span className="text-text-primary">Новий чат</span>
        </button>
        <button
          type="button"
          className="nav-item"
          data-active={canvasView === 'chats'}
          aria-pressed={canvasView === 'chats'}
          onClick={toggleCanvasView}
        >
          <MessageSquare size={20} strokeWidth={1.5} />
          Чати
        </button>
      </div>

      {/* Everything between the pinned header and footer scrolls together, so a
          tall "what the AI knows" panel never buries the chat list. */}
      <div className="panel-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
        <CitySection />
        <DeepDiveCard />
        <CityKnowledge />
        <CityDocsBox />
        <Recents searchOpen={searchOpen} query={query} setQuery={setQuery} />
      </div>
      <Footer />
    </nav>
  )
}

function CitySection() {
  const homeCity = useChatStore((s) => s.homeCity)
  const setHomeCity = useChatStore((s) => s.setHomeCity)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const [editing, setEditing] = useState(false)

  return (
    <div className="mt-6 px-3">
      <p className="mb-2 px-2 text-xs font-medium tracking-[0.05em] text-text-tertiary uppercase">
        Місто
      </p>
      {editing ? (
        <CityAutocomplete
          initialCity={homeCity.city}
          initialCountry={homeCity.country}
          onSubmit={(city, country, lat, lng) => {
            setHomeCity(city, country, lat, lng)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button
          type="button"
          className="nav-item"
          disabled={isStreaming}
          aria-label={`Ваше місто: ${homeCity.city}, ${homeCity.country}. Натисніть, щоб змінити`}
          onClick={() => setEditing(true)}
        >
          <span aria-hidden className="mx-1.5 size-1.5 rounded-full bg-accent" />
          {homeCity.city}
          <ChevronDown size={16} strokeWidth={1.5} className="ml-auto text-text-tertiary" />
        </button>
      )}
    </div>
  )
}

function Recents({
  searchOpen,
  query,
  setQuery,
}: {
  searchOpen: boolean
  query: string
  setQuery: (v: string) => void
}) {
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const openSession = useChatStore((s) => s.openSession)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const renameSession = useChatStore((s) => s.renameSession)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const visible = query.trim()
    ? sessions.filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()))
    : sessions

  return (
    <div className="mt-6 flex flex-col px-3">
      <p className="mb-2 px-2 text-xs font-medium tracking-[0.05em] text-text-tertiary uppercase">
        Останні
      </p>
      {searchOpen && (
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Пошук чатів…"
          aria-label="Пошук чатів"
          className="mx-1 mb-1.5 rounded-lg border border-border-subtle bg-bg-elevated px-2.5 py-1.5 text-sm outline-none placeholder:text-text-tertiary focus-visible:border-accent/50"
        />
      )}
      <div className="pb-2">
        {visible.length === 0 && (
          <p className="px-2 py-4 text-sm text-text-tertiary">
            {query ? 'Нічого не знайдено' : 'Розмов ще не було'}
          </p>
        )}
        <ul className="flex flex-col gap-0.5">
          {visible.map((session) => (
            <li key={session.id} className="group relative">
              {renamingId === session.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    renameSession(session.id, draft.trim() || session.title)
                    setRenamingId(null)
                  }}
                >
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
                    onBlur={() => setRenamingId(null)}
                    aria-label="Нова назва розмови"
                    className="w-full rounded-lg border border-accent/50 bg-bg-elevated px-2.5 py-1.5 text-sm outline-none"
                  />
                </form>
              ) : confirmingId === session.id ? (
                <div className="flex h-9 items-center gap-2 rounded-lg bg-bg-elevated px-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
                    Видалити чат?
                  </span>
                  <button
                    type="button"
                    // Keep focus on «Ні» so its onBlur doesn't tear down this row
                    // before the click lands (that swallowed the delete).
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      deleteSession(session.id)
                      setConfirmingId(null)
                    }}
                    className="rounded-md bg-danger/20 px-2 py-0.5 text-xs font-medium text-danger hover:bg-danger/30"
                  >
                    Так
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setConfirmingId(null)}
                    onBlur={() => setConfirmingId(null)}
                    className="rounded-md px-2 py-0.5 text-xs text-text-secondary hover:text-text-primary"
                  >
                    Ні
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="recent-item"
                    data-active={session.id === activeSessionId}
                    onClick={() => openSession(session.id)}
                  >
                    <span className="truncate">{session.title}</span>
                  </button>
                  <span className="absolute top-1/2 right-1 hidden -translate-y-1/2 gap-0.5 bg-bg-elevated group-focus-within:flex group-hover:flex">
                    <button
                      type="button"
                      aria-label={`Перейменувати «${session.title}»`}
                      className="chrome-btn !size-7"
                      onClick={() => {
                        setRenamingId(session.id)
                        setDraft(session.title)
                      }}
                    >
                      <Pencil size={13} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Видалити «${session.title}»`}
                      className="chrome-btn !size-7 hover:!text-danger"
                      onClick={() => setConfirmingId(session.id)}
                    >
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Footer() {
  const homeCity = useChatStore((s) => s.homeCity)

  return (
    <div style={{ borderTop: '1px solid rgba(141, 162, 192, 0.08)' }}>
      <div className="flex h-16 w-full items-center gap-3 px-4 transition-colors hover:bg-bg-elevated">
        <span className="flex size-9 items-center justify-center rounded-full bg-bg-elevated text-[15px] font-medium text-text-primary">
          {USER_NAME[0]}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] text-text-primary">{USER_NAME}</span>
          <span className="truncate text-xs text-text-tertiary">Радник · {homeCity.city}</span>
        </span>
        <ChevronsUpDown size={16} strokeWidth={1.5} className="ml-auto shrink-0 text-text-tertiary" />
      </div>
    </div>
  )
}
