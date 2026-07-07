import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { CityProfile, MapOp, Match, SourcesMap } from '../api/types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Solutions matched for this turn (arrive via the `matches` SSE event). */
  matches?: Match[]
  /** Map-director ops the AI fired during this turn (replayed on chat open). */
  map_ops?: MapOp[]
  /** [S#] label -> source for citation chips in this answer. */
  sources?: SourcesMap
  profile?: CityProfile
  /** The model's streamed reasoning (extended thinking), shown collapsibly. */
  thinking?: string
  /** Tool activity labels for this turn, in order (deduped). */
  tools?: string[]
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
  homeCity: { city: string; country: string; lat?: number; lng?: number }
  chatOpen: boolean
  sidebarOpen: boolean
  isStreaming: boolean
  /** Canvas mode: the conversation or the full chats list (nav «Чати» toggles). */
  canvasView: 'chat' | 'chats'
  /** Anthropic model id sent with every message. */
  model: string
  /** Chat column width in px (draggable divider). */
  chatWidth: number

  setHomeCity: (city: string, country: string, lat?: number, lng?: number) => void
  toggleChat: () => void
  toggleSidebar: () => void
  toggleCanvasView: () => void
  setCanvasView: (view: 'chat' | 'chats') => void
  setModel: (model: string) => void
  setChatWidth: (width: number) => void
  newSession: () => string
  openSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  truncateFrom: (sessionId: string, from: number) => void
  appendMessage: (sessionId: string, message: ChatMessage) => void
  updateLastAssistant: (sessionId: string, patch: Partial<ChatMessage>) => void
  appendToken: (sessionId: string, text: string) => void
  appendThinking: (sessionId: string, text: string) => void
  appendTool: (sessionId: string, name: string) => void
  appendMapOp: (sessionId: string, op: MapOp) => void
  setStreaming: (value: boolean) => void
}

const uuid = () => crypto.randomUUID()

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      homeCity: { city: 'Zhytomyr', country: 'Ukraine', lat: 50.2547, lng: 28.6587 },
      chatOpen: true,
      sidebarOpen: true,
      isStreaming: false,
      canvasView: 'chat',
      model: 'claude-sonnet-5',
      chatWidth: Math.round(window.innerWidth / 3),

      setHomeCity: (city, country, lat, lng) => set({ homeCity: { city, country, lat, lng } }),
      toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleCanvasView: () =>
        set((s) => ({ canvasView: s.canvasView === 'chats' ? 'chat' : 'chats' })),
      setCanvasView: (view) => set({ canvasView: view }),
      setModel: (model) => set({ model }),
      setChatWidth: (width) => set({ chatWidth: width }),

      newSession: () => {
        const id = uuid()
        const session: ChatSession = {
          id,
          title: 'Нова розмова',
          createdAt: Date.now(),
          messages: [],
        }
        set((s) => ({ sessions: [session, ...s.sessions], activeSessionId: id }))
        return id
      },
      openSession: (id) => set({ activeSessionId: id }),
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
      appendThinking: (sessionId, text) => {
        const session = get().sessions.find((x) => x.id === sessionId)
        const last = session?.messages.at(-1)
        if (last?.role === 'assistant') {
          get().updateLastAssistant(sessionId, { thinking: (last.thinking ?? '') + text })
        }
      },
      appendTool: (sessionId, name) => {
        const session = get().sessions.find((x) => x.id === sessionId)
        const last = session?.messages.at(-1)
        if (last?.role === 'assistant' && !(last.tools ?? []).includes(name)) {
          get().updateLastAssistant(sessionId, { tools: [...(last.tools ?? []), name] })
        }
      },
      appendMapOp: (sessionId, op) => {
        const session = get().sessions.find((x) => x.id === sessionId)
        const last = session?.messages.at(-1)
        if (last?.role === 'assistant') {
          get().updateLastAssistant(sessionId, { map_ops: [...(last.map_ops ?? []), op] })
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
        model: s.model,
        chatWidth: s.chatWidth,
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
