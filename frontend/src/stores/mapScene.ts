import { create } from 'zustand'

import type { CityRef, MapOp } from '../api/types'
import type { ChatMessage } from './chatStore'

export interface SceneMark {
  id: string
  city: CityRef
  kind: 'pin' | 'star' | 'warning' | 'check' | 'flag'
  label?: string
}

export interface SceneCallout {
  id: string
  city: CityRef
  text: string
  side: 'auto' | 'left' | 'right'
}

export interface SceneArc {
  id: string
  from: CityRef
  to: CityRef
  label?: string
}

export interface SceneHighlight {
  id: string
  cities: CityRef[]
  style: 'pulse' | 'ring' | 'glow'
}

export interface TourStop {
  city: CityRef
  text?: string
  hold_s: number
}

export interface Scene {
  marks: SceneMark[]
  callouts: SceneCallout[]
  arcs: SceneArc[]
  highlights: SceneHighlight[]
  spotlight: CityRef[] | null
}

const emptyScene = (): Scene => ({
  marks: [],
  callouts: [],
  arcs: [],
  highlights: [],
  spotlight: null,
})

const MAX = { marks: 20, callouts: 3, arcs: 10 }
let seq = 0
const nextId = () => `op-${++seq}`

interface MapSceneState {
  scenes: Record<string, Scene>
  /** Which sessions were rebuilt from persisted messages already. */
  built: Record<string, true>
  /** Live tour request (never replayed); consumed by useTour. */
  tour: { sessionId: string; stops: TourStop[]; zoom?: number; key: number } | null

  applyOp: (sessionId: string, op: MapOp, live: boolean) => void
  rebuild: (sessionId: string, messages: ChatMessage[]) => void
  removeCallout: (sessionId: string, id: string) => void
  expireHighlight: (sessionId: string, id: string) => void
  clearScene: (sessionId: string) => void
  consumeTour: () => void
}

function reduce(scene: Scene, op: MapOp): Scene {
  switch (op.op) {
    case 'mark':
      return {
        ...scene,
        marks: [
          ...scene.marks.slice(-(MAX.marks - 1)),
          { id: nextId(), city: op.city_id, kind: op.kind ?? 'pin', label: op.label },
        ],
      }
    case 'callout': {
      const kept = scene.callouts.filter((c) => c.city !== op.city_id).slice(-(MAX.callouts - 1))
      return {
        ...scene,
        callouts: [
          ...kept,
          { id: nextId(), city: op.city_id, text: op.text, side: op.side ?? 'auto' },
        ],
      }
    }
    case 'connect':
      return {
        ...scene,
        arcs: [
          ...scene.arcs.slice(-(MAX.arcs - 1)),
          { id: nextId(), from: op.from, to: op.to, label: op.label },
        ],
      }
    case 'spotlight':
      return { ...scene, spotlight: op.off ? null : (op.city_ids ?? []) }
    case 'clear':
      return emptyScene()
    default:
      return scene
  }
}

export const useMapScene = create<MapSceneState>((set, get) => ({
  scenes: {},
  built: {},
  tour: null,

  applyOp: (sessionId, op, live) => {
    // Camera + transient ops only fire live; visual ops also replay.
    if (op.op === 'zoom_to' || op.op === 'tour' || op.op === 'highlight') {
      if (!live) return
      if (op.op === 'tour') {
        set({
          tour: {
            sessionId,
            stops: op.stops.map((s) => ({
              city: s.city_id,
              text: s.text,
              hold_s: s.hold_s ?? 3,
            })),
            zoom: op.zoom,
            key: Date.now(),
          },
        })
        return
      }
      if (op.op === 'highlight') {
        const id = nextId()
        set((s) => {
          const scene = s.scenes[sessionId] ?? emptyScene()
          return {
            scenes: {
              ...s.scenes,
              [sessionId]: {
                ...scene,
                highlights: [
                  ...scene.highlights,
                  { id, cities: op.city_ids, style: op.style ?? 'pulse' },
                ],
              },
            },
          }
        })
        window.setTimeout(
          () => get().expireHighlight(sessionId, id),
          (op.duration_s ?? 8) * 1000,
        )
        return
      }
      return // zoom_to handled by the caller (needs map access)
    }

    set((s) => ({
      scenes: {
        ...s.scenes,
        [sessionId]: reduce(s.scenes[sessionId] ?? emptyScene(), op),
      },
    }))
  },

  rebuild: (sessionId, messages) => {
    let scene = emptyScene()
    for (const message of messages) {
      for (const op of message.map_ops ?? []) {
        if (op.op === 'zoom_to' || op.op === 'tour' || op.op === 'highlight') continue
        scene = reduce(scene, op)
      }
    }
    set((s) => ({
      scenes: { ...s.scenes, [sessionId]: scene },
      built: { ...s.built, [sessionId]: true },
    }))
  },

  removeCallout: (sessionId, id) =>
    set((s) => {
      const scene = s.scenes[sessionId]
      if (!scene) return s
      return {
        scenes: {
          ...s.scenes,
          [sessionId]: { ...scene, callouts: scene.callouts.filter((c) => c.id !== id) },
        },
      }
    }),

  expireHighlight: (sessionId, id) =>
    set((s) => {
      const scene = s.scenes[sessionId]
      if (!scene) return s
      return {
        scenes: {
          ...s.scenes,
          [sessionId]: { ...scene, highlights: scene.highlights.filter((h) => h.id !== id) },
        },
      }
    }),

  clearScene: (sessionId) =>
    set((s) => ({ scenes: { ...s.scenes, [sessionId]: emptyScene() } })),

  consumeTour: () => set({ tour: null }),
}))
