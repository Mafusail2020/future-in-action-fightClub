import { useChat } from '../../hooks/useChat'
import { useChatStore } from '../../stores/chatStore'
import { Composer } from './Composer'
import { HistorySidebar } from './HistorySidebar'
import { MessageList } from './MessageList'

const MODELS = [
  { value: 'sonnet', label: 'Sonnet 4.6 · точніше' },
  { value: 'haiku', label: 'Haiku 4.5 · швидше' },
] as const

export function ChatPanel() {
  const { send, stop, regenerate, editAndResend } = useChat()
  const historyOpen = useChatStore((s) => s.historyOpen)
  const toggleHistory = useChatStore((s) => s.toggleHistory)
  const toggleChat = useChatStore((s) => s.toggleChat)
  const newSession = useChatStore((s) => s.newSession)
  const model = useChatStore((s) => s.model)
  const setModel = useChatStore((s) => s.setModel)
  const isStreaming = useChatStore((s) => s.isStreaming)

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

        <select
          value={model}
          onChange={(e) => setModel(e.target.value as typeof model)}
          disabled={isStreaming}
          aria-label="Модель для відповідей"
          className="ml-auto rounded-md border border-line bg-ink-800 px-2 py-1 text-[11px] text-muted outline-none hover:text-paper focus-visible:border-amber disabled:opacity-50"
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

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
