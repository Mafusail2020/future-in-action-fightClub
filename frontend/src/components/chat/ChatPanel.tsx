import { useState } from 'react'

import { useChat } from '../../hooks/useChat'
import { useChatStore } from '../../stores/chatStore'
import { Composer } from './Composer'
import { HistorySidebar } from './HistorySidebar'
import { MessageList } from './MessageList'

export function ChatPanel() {
  const { send, stop, regenerate, editAndResend } = useChat()
  const historyOpen = useChatStore((s) => s.historyOpen)
  const toggleHistory = useChatStore((s) => s.toggleHistory)
  const toggleChat = useChatStore((s) => s.toggleChat)
  const newSession = useChatStore((s) => s.newSession)

  return (
    <section
      aria-label="Чат із радником"
      className="relative flex h-full min-h-0 flex-col border-l border-line bg-ink-900"
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <button
          type="button"
          onClick={toggleHistory}
          aria-label="Історія розмов"
          aria-expanded={historyOpen}
          className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-muted hover:border-amber hover:text-paper"
        >
          ☰
        </button>
        <h1 className="font-display text-sm font-semibold tracking-wide">Радник</h1>

        <HomeCityChip />

        <button
          type="button"
          onClick={() => newSession()}
          aria-label="Нова розмова"
          className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-muted hover:border-amber hover:text-paper"
        >
          + нова
        </button>
        <button
          type="button"
          onClick={toggleChat}
          aria-label="Згорнути чат"
          className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-muted hover:border-amber hover:text-paper max-md:hidden"
        >
          »
        </button>
      </header>

      {historyOpen && (
        <div className="relative min-h-0 flex-1">
          <HistorySidebar />
        </div>
      )}
      {!historyOpen && (
        <>
          <MessageList onEdit={editAndResend} onRegenerate={regenerate} onSuggest={send} />
          <Composer onSend={send} onStop={stop} />
        </>
      )}
    </section>
  )
}

/** The user's home city — every question is matched against it. Click to change. */
function HomeCityChip() {
  const homeCity = useChatStore((s) => s.homeCity)
  const setHomeCity = useChatStore((s) => s.setHomeCity)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const [editing, setEditing] = useState(false)
  const [city, setCity] = useState(homeCity.city)
  const [country, setCountry] = useState(homeCity.country)

  if (editing) {
    return (
      <form
        className="ml-auto flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (city.trim() && country.trim()) {
            setHomeCity(city.trim(), country.trim())
            setEditing(false)
          }
        }}
      >
        <input
          autoFocus
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          placeholder="Місто"
          aria-label="Ваше місто"
          className="w-24 rounded-md border border-amber/60 bg-ink-800 px-2 py-1 text-[11px] outline-none"
        />
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          placeholder="Країна"
          aria-label="Ваша країна"
          className="w-20 rounded-md border border-line bg-ink-800 px-2 py-1 text-[11px] outline-none focus-visible:border-amber"
        />
        <button
          type="submit"
          className="rounded-md bg-amber px-2 py-1 text-[11px] font-semibold text-ink-950"
        >
          OK
        </button>
      </form>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setCity(homeCity.city)
        setCountry(homeCity.country)
        setEditing(true)
      }}
      disabled={isStreaming}
      aria-label={`Ваше місто: ${homeCity.city}, ${homeCity.country}. Натисніть, щоб змінити`}
      className="ml-auto flex items-center gap-1.5 rounded-md border border-line bg-ink-800 px-2 py-1 text-[11px] text-muted hover:border-amber hover:text-paper disabled:opacity-50"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-cyan" />
      {homeCity.city}
    </button>
  )
}
