import { ArrowUp, Check, ChevronDown, Plus, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useChatStore } from '../../stores/chatStore'

const MODELS = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5', hint: 'збалансована' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8', hint: 'найрозумніша' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', hint: 'найшвидша' },
]

/** Claude-style composer card: textarea zone on top, toolbar row below. ≤150px collapsed. */
export function Composer({
  onSend,
  onStop,
  docked = false,
}: {
  onSend: (text: string) => void
  onStop: () => void
  docked?: boolean
}) {
  const [text, setText] = useState('')
  const isStreaming = useChatStore((s) => s.isStreaming)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    if (!text.trim() || isStreaming) return
    onSend(text)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  return (
    <div
      className={`flex flex-col border border-border-subtle bg-bg-elevated shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-colors focus-within:border-text-tertiary ${
        docked ? 'rounded-2xl' : 'rounded-3xl'
      }`}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        rows={1}
        placeholder="Спитайте про місто…"
        aria-label="Повідомлення до радника"
        className="max-h-[200px] min-h-[56px] flex-1 resize-none bg-transparent px-5 pt-[18px] pb-1 text-[17px] outline-none placeholder:text-text-tertiary @max-md/chat:px-4 @max-md/chat:text-base"
      />

      <div className="flex h-[52px] items-center justify-between px-3 pt-2 pb-3">
        <button
          type="button"
          aria-label="Додати файл — скоро"
          title="Додати файл — скоро"
          className="chrome-btn !size-9 !rounded-full"
        >
          <Plus size={20} strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-3">
          <ModelSelect />

          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Зупинити відповідь"
              title="Зупинити"
              className="flex size-9 items-center justify-center rounded-full border border-border-subtle text-text-secondary transition-colors hover:border-danger hover:text-danger"
            >
              <Square size={13} strokeWidth={2} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim()}
              aria-label="Надіслати повідомлення"
              title="Enter — надіслати"
              className="flex size-9 items-center justify-center rounded-full bg-accent-primary-btn text-ink-950 transition-all hover:bg-amber-deep disabled:cursor-default disabled:opacity-35"
            >
              <ArrowUp size={18} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Working model picker — the chosen Claude model is sent with every message. */
function ModelSelect() {
  const model = useChatStore((s) => s.model)
  const setModel = useChatStore((s) => s.setModel)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const current = MODELS.find((m) => m.id === model) ?? MODELS[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`Модель: Claude ${current.label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={isStreaming}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="flex items-center gap-1 px-2 text-sm text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
      >
        Claude <span className="text-text-tertiary">{current.label}</span>
        <ChevronDown size={14} strokeWidth={1.5} className="text-text-tertiary" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Вибір моделі"
          className="absolute right-0 bottom-9 z-20 w-52 overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated py-1 shadow-xl"
        >
          {MODELS.map((m) => (
            <li key={m.id} role="option" aria-selected={m.id === current.id}>
              <button
                type="button"
                onClick={() => {
                  setModel(m.id)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-bg-main hover:text-text-primary"
              >
                <span className="flex-1">
                  Claude {m.label}
                  <span className="block text-[11px] text-text-tertiary">{m.hint}</span>
                </span>
                {m.id === current.id && <Check size={15} strokeWidth={2} className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
