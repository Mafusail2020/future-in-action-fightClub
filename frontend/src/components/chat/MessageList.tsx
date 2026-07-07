import { useEffect, useRef, useState } from 'react'

import type { ChatMessage } from '../../stores/chatStore'
import { useChatStore } from '../../stores/chatStore'
import { MatchCard } from './MatchCard'
import { AssistantMarkdown } from './Message'
import { ThinkingPanel } from './ThinkingPanel'

export function MessageList({
  onEdit,
  onRegenerate,
}: {
  onEdit: (index: number, text: string) => void
  onRegenerate: () => void
}) {
  const session = useChatStore((s) => s.sessions.find((x) => x.id === s.activeSessionId))
  const isStreaming = useChatStore((s) => s.isStreaming)
  const endRef = useRef<HTMLDivElement>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  const messages = session?.messages ?? []
  const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant')
  const prevCountRef = useRef(0)

  // Stick to the bottom only when the reader is already there: a brand-new
  // message always scrolls down, but streaming tokens must not yank the view
  // while the user scrolled up to read.
  useEffect(() => {
    const container = endRef.current?.closest('.panel-scroll') as HTMLElement | null
    if (!container) return
    const newMessage = messages.length !== prevCountRef.current
    prevCountRef.current = messages.length
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 140
    if (newMessage || nearBottom) {
      container.scrollTo({ top: container.scrollHeight })
    }
  }, [messages.length, messages.at(-1)?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Повідомлення розмови"
      className="flex flex-col gap-5"
    >
      {messages.map((message, index) => (
        <MessageRow
          key={message.id}
          message={message}
          isLastAssistant={index === lastAssistantIndex}
          isEditing={editingIndex === index}
          streamingNow={isStreaming}
          onStartEdit={() => {
            setEditingIndex(index)
            setDraft(message.content)
          }}
          onCancelEdit={() => setEditingIndex(null)}
          draft={draft}
          setDraft={setDraft}
          onSubmitEdit={() => {
            setEditingIndex(null)
            onEdit(index, draft)
          }}
          onRegenerate={onRegenerate}
        />
      ))}
      <div ref={endRef} />
    </div>
  )
}

function MessageRow({
  message,
  isLastAssistant,
  isEditing,
  streamingNow,
  draft,
  setDraft,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onRegenerate,
}: {
  message: ChatMessage
  isLastAssistant: boolean
  isEditing: boolean
  streamingNow: boolean
  draft: string
  setDraft: (v: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSubmitEdit: () => void
  onRegenerate: () => void
}) {
  if (message.role === 'user') {
    if (isEditing) {
      return (
        <div className="ml-12 rounded-2xl border border-accent/50 bg-bg-elevated p-2 max-md:ml-6">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            aria-label="Редагувати повідомлення"
            className="w-full resize-y bg-transparent px-2 py-1 text-[15px] outline-none"
          />
          <div className="flex justify-end gap-2 px-1 pb-1">
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={onSubmitEdit}
              disabled={!draft.trim()}
              className="rounded-[10px] bg-accent-primary-btn px-3 py-1.5 text-xs font-semibold text-ink-950 hover:bg-amber-deep disabled:opacity-50"
            >
              Надіслати знову
            </button>
          </div>
          <p className="px-2 pb-1 text-[11px] text-text-tertiary">
            Редагування обриває розмову з цього місця
          </p>
        </div>
      )
    }
    return (
      <div className="group relative ml-12 max-md:ml-6">
        <div className="rounded-2xl rounded-br-md bg-bg-elevated px-4 py-3 text-[15px] whitespace-pre-wrap">
          {message.content}
        </div>
        {!streamingNow && (
          <button
            type="button"
            onClick={onStartEdit}
            aria-label="Редагувати це повідомлення"
            className="absolute -bottom-3 right-3 rounded-lg bg-bg-elevated px-2 py-0.5 text-[11px] text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-text-primary"
          >
            редагувати
          </button>
        )}
      </div>
    )
  }

  const matches = message.matches ?? []

  return (
    <div>
      <ThinkingPanel
        thinking={message.thinking}
        tools={message.tools}
        streaming={message.streaming}
        hasAnswer={!!message.content}
      />

      {matches.length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5" aria-label="Підібрані рішення">
          <p className="font-mono text-[10px] tracking-[0.14em] text-text-tertiary uppercase">
            Підібрані рішення · {matches.length} · показані на мапі
          </p>
          {matches.map((match) => (
            <MatchCard key={match.solution_id} match={match} />
          ))}
        </div>
      )}

      {message.content ? (
        <AssistantMarkdown content={message.content} sources={message.sources} />
      ) : message.streaming && !message.thinking && (message.tools ?? []).length === 0 ? (
        <p className="animate-pulse-soft text-[15px] text-text-secondary">Аналізую…</p>
      ) : null}

      {message.streaming && message.content && (
        <span aria-hidden className="animate-pulse-soft ml-0.5 text-accent">
          ▍
        </span>
      )}

      {message.error && (
        <div className="mt-2 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5">
          <p className="text-xs text-danger">{message.error}</p>
          <button
            type="button"
            onClick={onRegenerate}
            className="mt-1 text-xs font-medium text-text-primary underline underline-offset-2 hover:text-accent"
          >
            Повторити
          </button>
        </div>
      )}

      {isLastAssistant && !message.streaming && !message.error && !streamingNow && (
        <button
          type="button"
          onClick={onRegenerate}
          className="mt-2 font-mono text-[11px] text-text-tertiary hover:text-accent"
        >
          ↻ згенерувати ще раз
        </button>
      )}
    </div>
  )
}
