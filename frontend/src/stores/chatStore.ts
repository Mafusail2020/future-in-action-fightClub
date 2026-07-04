import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Citation, MapPayload, ModelAlias } from '../api/types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  map?: MapPayload
  /** Assistant message currently being streamed. */
  streaming?: boolean
  /** Tools the agent has invoked while producing this message. */
  tools?: string[]
  error?: string
}

export interface ChatSession {
  id: string
  /** Backend thread id; regenerated when the user edits history (threads can't rewind). */
  serverSessionId: string
  title: string
  createdAt: number
  messages: ChatMessage[]
}

interface ChatState {
  sessions: ChatSession[]
  activeSessionId: string | null
  model: ModelAlias
  chatOpen: boolean
  historyOpen: boolean
  isStreaming: boolean

  setModel: (model: ModelAlias) => void
  toggleChat: () => void
  toggleHistory: () => void
  newSession: () => string
  openSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  /** Drop messages from index `from` on (for edit); returns the removed user text. */
  truncateFrom: (sessionId: string, from: number) => void
  resetServerThread: (sessionId: string) => void
  appendMessage: (sessionId: string, message: ChatMessage) => void
  updateLastAssistant: (sessionId: string, patch: Partial<ChatMessage>) => void
  appendToken: (sessionId: string, text: string) => void
  appendTool: (sessionId: string, tool: string) => void
  setStreaming: (value: boolean) => void
}

const uuid = () => crypto.randomUUID()

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      model: 'sonnet',
      chatOpen: true,
      historyOpen: false,
      isStreaming: false,

      setModel: (model) => set({ model }),
      toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
      toggleHistory: () => set((s) => ({ historyOpen: !s.historyOpen })),

      newSession: () => {
        const id = uuid()
        const session: ChatSession = {
          id,
          serverSessionId: uuid(),
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
      resetServerThread: (sessionId) =>
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === sessionId ? { ...x, serverSessionId: uuid() } : x,
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
      appendTool: (sessionId, tool) => {
        const session = get().sessions.find((x) => x.id === sessionId)
        const last = session?.messages.at(-1)
        if (last?.role === 'assistant' && !(last.tools ?? []).includes(tool)) {
          get().updateLastAssistant(sessionId, { tools: [...(last.tools ?? []), tool] })
        }
      },
      setStreaming: (value) => set({ isStreaming: value }),
    }),
    {
      name: 'zhytomyr-adviser-chat',
      partialize: (s) => ({
        sessions: s.sessions.map((x) => ({
          ...x,
          // never persist a mid-stream flag; it would wedge the UI on reload
          messages: x.messages.map(({ streaming: _streaming, ...m }) => m),
        })),
        activeSessionId: s.activeSessionId,
        model: s.model,
        chatOpen: s.chatOpen,
      }),
    },
  ),
)
