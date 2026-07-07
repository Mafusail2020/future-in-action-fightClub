import { CarFront, Flame, Ghost, Shield, Sparkles } from 'lucide-react'
import { useMemo } from 'react'

import { useChat } from '../../hooks/useChat'
import { useChatStore } from '../../stores/chatStore'
import { ChatsView } from './ChatsView'
import { Composer } from './Composer'
import { MessageList } from './MessageList'

const GREETINGS = [
  'Вітаю',
  'З поверненням',
  'Що досліджуємо сьогодні?',
  'Чим допомогти вашому місту?',
  'Готовий шукати рішення',
]

const PILLS = [
  { icon: CarFront, label: 'Затори', question: 'Як інші міста боролися з заторами?' },
  { icon: Flame, label: 'Опалення', question: 'Що робили міста з модернізацією опалення?' },
  { icon: Shield, label: 'Безпека', question: 'Покажи рішення з безпеки для середнього міста' },
  {
    icon: Sparkles,
    label: 'Підібрати рішення',
    question: 'Які рішення підійдуть моєму місту найбільше?',
  },
]

/** Main canvas: serif greeting + centered composer when empty; docked composer in conversation. */
export function ChatCanvas() {
  const { send, stop, regenerate, editAndResend } = useChat()
  const newSession = useChatStore((s) => s.newSession)
  const canvasView = useChatStore((s) => s.canvasView)
  const session = useChatStore((s) => s.sessions.find((x) => x.id === s.activeSessionId))
  const isEmpty = !session || session.messages.length === 0
  // One random greeting per visit to the empty screen (stable while typing).
  const greeting = useMemo(
    () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.id],
  )

  const cornerButton = (
    <button
      type="button"
      onClick={() => newSession()}
      aria-label="Нова приватна розмова"
      title="Новий чат"
      className="chrome-btn absolute top-4 right-4 z-10"
    >
      <Ghost size={18} strokeWidth={1.5} />
    </button>
  )

  if (canvasView === 'chats') {
    return <ChatsView />
  }

  if (isEmpty) {
    return (
      <div className="relative h-full min-h-0 overflow-y-auto">
        {cornerButton}
        <div className="mx-auto w-full max-w-[760px] px-6 pt-[22vh] max-md:pt-[14vh] @max-md/chat:px-4">
          <h1
            className="greeting-in font-serif flex items-center justify-center text-center font-normal text-text-primary"
            style={{ fontSize: 'clamp(1.9rem, 6.5cqi, 3.25rem)', lineHeight: 1.1 }}
          >
            {greeting}
          </h1>

          <div className="composer-in mt-10">
            <Composer onSend={send} onStop={stop} />
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {PILLS.map(({ icon: Icon, label, question }) => (
              <button
                key={label}
                type="button"
                onClick={() => send(question)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-elevated/50 px-3 text-[13px] whitespace-nowrap text-text-secondary transition-colors hover:border-text-tertiary hover:bg-bg-elevated"
              >
                <Icon size={14} strokeWidth={1.5} />
                {label}
              </button>
            ))}
          </div>

          <p className="mt-6 text-center text-[13px] text-text-tertiary">
            Знайду перевірені рішення інших міст і покажу їх на мапі
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-6 pt-6 pb-40 @max-md/chat:px-4">
          <MessageList onEdit={editAndResend} onRegenerate={regenerate} />
        </div>
      </div>

      {/* Docked composer with a fade so messages scroll "under" it */}
      <div className="pointer-events-none absolute right-0 bottom-0 left-0 bg-gradient-to-t from-bg-main via-bg-main/85 to-transparent pt-10">
        <div className="pointer-events-auto mx-auto w-full max-w-[760px] px-6 pb-6 @max-md/chat:px-4 @max-md/chat:pb-3">
          <Composer onSend={send} onStop={stop} docked />
        </div>
      </div>
    </div>
  )
}
