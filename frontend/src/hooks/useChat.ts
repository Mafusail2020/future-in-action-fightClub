import { useCallback, useRef } from 'react'

import { streamChat } from '../api/stream'
import { useChatStore } from '../stores/chatStore'
import { useMapStore } from '../stores/mapStore'

/** Orchestrates one streaming turn: optimistic messages -> SSE -> stores. */
export function useChat() {
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback((text: string) => {
    const message = text.trim()
    if (!message) return
    const store = useChatStore.getState()
    if (store.isStreaming) return

    const sessionId = store.activeSessionId ?? store.newSession()
    const session = useChatStore.getState().sessions.find((s) => s.id === sessionId)
    if (!session) return

    store.appendMessage(sessionId, { id: crypto.randomUUID(), role: 'user', content: message })
    store.appendMessage(sessionId, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      streaming: true,
      tools: [],
    })
    store.setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    void streamChat(
      { session_id: session.serverSessionId, message, model: store.model },
      {
        onToken: (t) => useChatStore.getState().appendToken(sessionId, t),
        onStatus: (tool) => useChatStore.getState().appendTool(sessionId, tool),
        onFinal: (final) => {
          const chat = useChatStore.getState()
          chat.updateLastAssistant(sessionId, {
            content: final.answer,
            citations: final.citations,
            map: final.map,
            streaming: false,
          })
          chat.setStreaming(false)
          if (final.map.actions.length > 0) {
            useMapStore.getState().setChatMap(final.map)
          }
        },
        onError: (msg) => {
          const chat = useChatStore.getState()
          chat.updateLastAssistant(sessionId, { streaming: false, error: msg })
          chat.setStreaming(false)
        },
      },
      controller.signal,
    ).finally(() => {
      const chat = useChatStore.getState()
      if (chat.isStreaming) {
        // stream ended without a final/error event (e.g. user aborted)
        chat.updateLastAssistant(sessionId, { streaming: false })
        chat.setStreaming(false)
      }
    })
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /** Resend the last user message on the same server thread. */
  const regenerate = useCallback(() => {
    const store = useChatStore.getState()
    const session = store.sessions.find((s) => s.id === store.activeSessionId)
    if (!session || store.isStreaming) return
    const lastUserIndex = session.messages.findLastIndex((m) => m.role === 'user')
    if (lastUserIndex === -1) return
    const text = session.messages[lastUserIndex].content
    store.truncateFrom(session.id, lastUserIndex)
    send(text)
  }, [send])

  /**
   * Edit a past user message: history is truncated at that point and the turn
   * re-runs on a FRESH server thread (MemorySaver can't rewind) — earlier
   * context is intentionally dropped server-side.
   */
  const editAndResend = useCallback(
    (messageIndex: number, newText: string) => {
      const store = useChatStore.getState()
      const session = store.sessions.find((s) => s.id === store.activeSessionId)
      if (!session || store.isStreaming) return
      store.truncateFrom(session.id, messageIndex)
      store.resetServerThread(session.id)
      send(newText)
    },
    [send],
  )

  return { send, stop, regenerate, editAndResend }
}
