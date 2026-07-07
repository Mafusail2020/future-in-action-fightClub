import { create } from 'zustand'

export type DeepDiveStatus = 'idle' | 'running' | 'done' | 'error'

interface DossierState {
  /** Deep-dive build progress (not the dossier data — that lives in Query cache). */
  status: DeepDiveStatus
  stage: string // latest progress stage key, e.g. "web:searching"
  found: number // web sources found so far (live)
  error: string | null
  /** Full-screen dossier panel open over the map. */
  panelOpen: boolean

  begin: () => void
  progress: (stage: string, found?: number) => void
  finish: () => void
  fail: (message: string) => void
  reset: () => void
  openPanel: () => void
  closePanel: () => void
}

export const useDossierStore = create<DossierState>((set) => ({
  status: 'idle',
  stage: '',
  found: 0,
  error: null,
  panelOpen: false,

  begin: () => set({ status: 'running', stage: 'opendata:start', found: 0, error: null }),
  progress: (stage, found) => set((s) => ({ stage, found: found ?? s.found })),
  finish: () => set({ status: 'done' }),
  fail: (message) => set({ status: 'error', error: message }),
  reset: () => set({ status: 'idle', stage: '', found: 0, error: null }),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
}))
