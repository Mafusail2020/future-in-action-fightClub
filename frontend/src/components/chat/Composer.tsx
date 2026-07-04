import { useRef, useState } from 'react'

import { useChatStore } from '../../stores/chatStore'

export function Composer({ onSend, onStop }: { onSend: (text: string) => void; onStop: () => void }) {
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
    <div className="border-t border-line p-3">
      <div className="flex items-end gap-2 rounded-xl border border-line bg-ink-800 p-1.5 focus-within:border-amber/60">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder="Спитайте про місто… (Enter — надіслати)"
          aria-label="Повідомлення до радника"
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-faint"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Зупинити відповідь"
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-danger hover:text-danger"
          >
            ■ Стоп
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            aria-label="Надіслати повідомлення"
            className="rounded-lg bg-amber px-3 py-1.5 text-xs font-semibold text-ink-950 transition-colors hover:bg-amber-deep disabled:cursor-default disabled:opacity-40"
          >
            Надіслати
          </button>
        )}
      </div>
    </div>
  )
}
