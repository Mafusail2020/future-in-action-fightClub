import { useEffect, useRef, useState } from 'react'

import type { ChatMessage } from '../../stores/chatStore'
import { useChatStore } from '../../stores/chatStore'
import { AssistantMarkdown } from './Message'

const TOOL_LABELS: Record<string, string> = {
  problems_search: 'шукає дані про місто',
  raion_stats: 'дивиться показники',
  geo_lookup: 'шукає об’єкти на мапі',
  solutions_search: 'шукає кейси інших міст',
}

const SUGGESTIONS = [
  'Які проблеми з дорогами у Крошні?',
  'Порівняй Богунію та Центр за комерцією',
  'Яка якість повітря в місті зараз?',
  'Як інші міста вирішували проблему ям на дорогах?',
]

export function MessageList({
  onEdit,
  onRegenerate,
  onSuggest,
}: {
  onEdit: (index: number, text: string) => void
  onRegenerate: () => void
  onSuggest: (text: string) => void
}) {
  const session = useChatStore((s) => s.sessions.find((x) => x.id === s.activeSessionId))
  const isStreaming = useChatStore((s) => s.isStreaming)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  const messages = session?.messages ?? []
  const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant')

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length, messages.at(-1)?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-8">
        <p className="font-display text-center text-base text-muted">
          Спитайте про стан міста — відповім із джерелами й покажу на мапі
        </p>
        <div className="flex w-full max-w-sm flex-col gap-2">
          {SUGGESTIONS.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => onSuggest(text)}
              className="rounded-lg border border-line bg-ink-800 px-3 py-2 text-left text-[13px] text-paper transition-colors hover:border-amber"
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-label="Повідомлення розмови"
      className="panel-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4"
    >
      <div className="flex flex-col gap-4">
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
      </div>
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
        <div className="ml-8 rounded-xl border border-amber/50 bg-ink-700 p-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            aria-label="Редагувати повідомлення"
            className="w-full resize-y bg-transparent px-1.5 py-1 text-sm outline-none"
          />
          <div className="flex justify-end gap-2 px-1 pb-1">
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-xs text-muted hover:text-paper"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={onSubmitEdit}
              disabled={!draft.trim()}
              className="rounded-md bg-amber px-2.5 py-1 text-xs font-semibold text-ink-950 hover:bg-amber-deep disabled:opacity-50"
            >
              Надіслати знову
            </button>
          </div>
          <p className="px-1.5 pb-1 text-[11px] text-faint">
            Редагування обриває розмову з цього місця й починає новий контекст
          </p>
        </div>
      )
    }
    return (
      <div className="group relative ml-8">
        <div className="rounded-xl rounded-br-sm border border-line bg-ink-700 px-3.5 py-2.5 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
        {!streamingNow && (
          <button
            type="button"
            onClick={onStartEdit}
            aria-label="Редагувати це повідомлення"
            className="absolute -bottom-2.5 right-2 rounded border border-line bg-ink-800 px-1.5 py-0.5 text-[10px] text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-paper"
          >
            редагувати
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="mr-2">
      {(message.tools ?? []).length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5" aria-label="Використані інструменти">
          {message.tools!.map((tool) => (
            <span
              key={tool}
              className="rounded border border-cyan/35 bg-cyan/10 px-1.5 py-px font-mono text-[10px] text-cyan"
            >
              {TOOL_LABELS[tool] ?? tool}
            </span>
          ))}
        </div>
      )}

      {message.content ? (
        <AssistantMarkdown content={message.content} citations={message.citations} />
      ) : message.streaming ? (
        <p className="animate-pulse-soft text-sm text-muted">Думаю…</p>
      ) : null}

      {message.streaming && message.content && (
        <span aria-hidden className="animate-pulse-soft ml-0.5 text-amber">
          ▍
        </span>
      )}

      {message.error && (
        <div className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2">
          <p className="text-xs text-danger">{message.error}</p>
          <button
            type="button"
            onClick={onRegenerate}
            className="mt-1 text-xs font-medium text-paper underline underline-offset-2 hover:text-amber"
          >
            Повторити
          </button>
        </div>
      )}

      {isLastAssistant && !message.streaming && !message.error && !streamingNow && (
        <button
          type="button"
          onClick={onRegenerate}
          className="mt-1.5 font-mono text-[11px] text-faint hover:text-amber"
        >
          ↻ згенерувати ще раз
        </button>
      )}
    </div>
  )
}
