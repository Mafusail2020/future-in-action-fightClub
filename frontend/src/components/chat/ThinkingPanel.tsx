import { Brain, ChevronDown, MapPin, MapPinned, Search, Sparkles, Building2 } from 'lucide-react'
import { useEffect, useState } from 'react'

const TOOL_META: Record<string, { label: string; icon: typeof Search }> = {
  recommend_solutions: { label: 'Підбирає рішення', icon: Sparkles },
  search_solutions: { label: 'Шукає рішення', icon: Search },
  search_city_state: { label: 'Дивиться дані міста', icon: Building2 },
  direct_map: { label: 'Малює на мапі', icon: MapPin },
  geocode_place: { label: 'Знаходить місце на мапі…', icon: MapPinned },
}

/**
 * Collapsible «Роздуми» panel: the model's streamed reasoning plus chips for
 * the tools it used. Auto-expands while streaming, collapses once the answer
 * text starts (so the answer, not the reasoning, is the focus).
 */
export function ThinkingPanel({
  thinking,
  tools,
  streaming,
  hasAnswer,
}: {
  thinking?: string
  tools?: string[]
  streaming?: boolean
  hasAnswer: boolean
}) {
  const [open, setOpen] = useState(false)
  // Auto-open while thinking with no answer yet; auto-collapse when prose starts.
  useEffect(() => {
    if (streaming && !hasAnswer) setOpen(true)
    else if (hasAnswer) setOpen(false)
  }, [streaming, hasAnswer])

  const toolList = tools ?? []
  if (!thinking && toolList.length === 0) return null

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[11px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
      >
        <Brain size={13} strokeWidth={1.75} className={streaming && !hasAnswer ? 'animate-pulse-soft' : ''} />
        {streaming && !hasAnswer ? 'Розмірковує…' : 'Роздуми'}
        {thinking && (
          <ChevronDown
            size={12}
            strokeWidth={2}
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {toolList.length > 0 && (
        <div className="mt-1.5 flex flex-col items-start gap-1.5">
          {toolList.map((name) => {
            const meta = TOOL_META[name] ?? { label: name, icon: Search }
            const Icon = meta.icon
            return (
              <span
                key={name}
                className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] text-accent"
              >
                <Icon size={11} strokeWidth={1.75} />
                {meta.label}
              </span>
            )
          })}
        </div>
      )}

      {open && thinking && (
        <div className="mt-1.5 rounded-lg border border-border-subtle bg-bg-elevated/60 px-3 py-2">
          <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap text-text-tertiary">
            {thinking}
          </p>
        </div>
      )}
    </div>
  )
}
