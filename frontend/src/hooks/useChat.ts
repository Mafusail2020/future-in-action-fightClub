import { useCallback, useRef } from 'react'

import { streamChat } from '../api/stream'
import type { MapOp } from '../api/types'
import { resolveCityRef } from '../lib/geo'
import { historyFor, useChatStore } from '../stores/chatStore'
import { useMapScene } from '../stores/mapScene'
import { useMapStore } from '../stores/mapStore'

function handleLiveMapOp(sessionId: string, op: MapOp) {
  useChatStore.getState().appendMapOp(sessionId, op)
  if (op.op === 'zoom_to') {
    const map = useMapStore.getState()
    if (Array.isArray(op.target)) {
      const points = op.target
        .map(resolveCityRef)
        .filter((p): p is [number, number] => p !== null)
      if (points.length > 1) {
        useMapStore.setState({ fitTo: { points, key: Date.now() } })
      } else if (points[0]) {
        map.requestFlyTo(points[0], op.zoom ?? 6.5)
      }
    } else {
      const point = resolveCityRef(op.target)
      if (point) map.requestFlyTo(point, op.zoom ?? (op.target === 'home' ? 10 : 6.5))
    }
    return
  }
  useMapScene.getState().applyOp(sessionId, op, true)
}

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

    const history = historyFor(session) // before appending the new message
    store.appendMessage(sessionId, { id: crypto.randomUUID(), role: 'user', content: message })
    store.appendMessage(sessionId, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      streaming: true,
    })
    store.setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller
    const { city, country } = store.homeCity

    void streamChat(
      {
        message,
        city: city || undefined,
        country: country || undefined,
        history,
        limit: 6,
        model: store.model,
      },
      {
        onMatches: ({ profile, matches }) => {
          useChatStore.getState().updateLastAssistant(sessionId, { matches, profile })
          useMapStore.getState().setMatches(matches)
        },
        onToken: (t) => useChatStore.getState().appendToken(sessionId, t),
        onMapOp: (op) => handleLiveMapOp(sessionId, op),
        onSources: (sources) =>
          useChatStore.getState().updateLastAssistant(sessionId, { sources }),
        onDone: () => {
          const chat = useChatStore.getState()
          chat.updateLastAssistant(sessionId, { streaming: false })
          chat.setStreaming(false)
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
        // aborted before done/error arrived
        chat.updateLastAssistant(sessionId, { streaming: false })
        chat.setStreaming(false)
      }
    })
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /** Resend the last user message (history is client-owned, so this is a clean re-ask). */
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

  /** Edit a past user message: truncate the local history there and resend. */
  const editAndResend = useCallback(
    (messageIndex: number, newText: string) => {
      const store = useChatStore.getState()
      const session = store.sessions.find((s) => s.id === store.activeSessionId)
      if (!session || store.isStreaming) return
      store.truncateFrom(session.id, messageIndex)
      send(newText)
    },
    [send],
  )

  return { send, stop, regenerate, editAndResend }
}
