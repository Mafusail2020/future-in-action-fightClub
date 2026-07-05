import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { CityProfile, Match } from '../api/types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Solutions matched for this turn (arrive via the `matches` SSE event). */
  matches?: Match[]
  profile?: CityProfile
  streaming?: boolean
  error?: string
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  messages: ChatMessage[]
}

interface ChatState {
  sessions: ChatSession[]
  activeSessionId: string | null
  /** The user's home city — sent with every message so the agent matches against it. */
  homeCity: { city: string; country: string }
  chatOpen: boolean
  historyOpen: boolean
  isStreaming: boolean

  setHomeCity: (city: string, country: string) => void
  toggleChat: () => void
  toggleHistory: () => void
  newSession: () => string
  openSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  truncateFrom: (sessionId: string, from: number) => void
  appendMessage: (sessionId: string, message: ChatMessage) => void
  updateLastAssistant: (sessionId: string, patch: Partial<ChatMessage>) => void
  appendToken: (sessionId: string, text: string) => void
  setStreaming: (value: boolean) => void
}

const uuid = () => crypto.randomUUID()

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      homeCity: { city: 'Zhytomyr', country: 'Ukraine' },
      chatOpen: true,
      historyOpen: false,
      isStreaming: false,

      setHomeCity: (city, country) => set({ homeCity: { city, country } }),
      toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
      toggleHistory: () => set((s) => ({ historyOpen: !s.historyOpen })),

      newSession: () => {
        const id = uuid()
        const session: ChatSession = {
          id,
          title: 'Нова розмова',
          createdAt: Date.now(),
          messages: [],
        }
        set((s) => ({ sessions: [session, ...s.sessions], activeSessionId: id, historyOpen: false }))
        return id
      },
      openSession: (id) => set({ activeSessionId: id, historyOpen: false }),
      deleteSession: (id) =>
        set((s) => {
          const sessions = s.sessions.filter((x) => x.id !== id)
          return {
            sessions,
            activeSessionId:
              s.activeSessionId === id ? (sessions[0]?.id ?? null) : s.activeSessionId,
          }
        }),
      renameSession: (id, title) =>
        set((s) => ({
          sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x)),
        })),

      truncateFrom: (sessionId, from) =>
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === sessionId ? { ...x, messages: x.messages.slice(0, from) } : x,
          ),
        })),

      appendMessage: (sessionId, message) =>
        set((s) => ({
          sessions: s.sessions.map((x) => {
            if (x.id !== sessionId) return x
            const title =
              x.messages.length === 0 && message.role === 'user'
                ? message.content.slice(0, 48)
                : x.title
            return { ...x, title, messages: [...x.messages, message] }
          }),
        })),
      updateLastAssistant: (sessionId, patch) =>
        set((s) => ({
          sessions: s.sessions.map((x) => {
            if (x.id !== sessionId) return x
            const messages = [...x.messages]
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i].role === 'assistant') {
                messages[i] = { ...messages[i], ...patch }
                break
              }
            }
            return { ...x, messages }
          }),
        })),
      appendToken: (sessionId, text) => {
        const session = get().sessions.find((x) => x.id === sessionId)
        const last = session?.messages.at(-1)
        if (last?.role === 'assistant') {
          get().updateLastAssistant(sessionId, { content: last.content + text })
        }
      },
      setStreaming: (value) => set({ isStreaming: value }),
    }),
    {
      name: 'city-solutions-chat',
      partialize: (s) => ({
        sessions: s.sessions.map((x) => ({
          ...x,
          // never persist a mid-stream flag; it would wedge the UI on reload
          messages: x.messages.map(({ streaming: _streaming, ...m }) => m),
        })),
        activeSessionId: s.activeSessionId,
        homeCity: s.homeCity,
        chatOpen: s.chatOpen,
      }),
    },
  ),
)

/** History payload for the backend: prior completed turns, first message a user one. */
export function historyFor(session: ChatSession): { role: 'user' | 'assistant'; content: string }[] {
  const turns = session.messages
    .filter((m) => !m.streaming && !m.error && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }))
  while (turns.length > 0 && turns[0].role === 'assistant') turns.shift()
  return turns
}
