import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import { streamDeepDive } from '../api/dossierStream'
import { useChatStore } from '../stores/chatStore'
import { useDossierStore } from '../stores/dossierStore'

/** Orchestrates a live deep-dive: streams progress into the dossier store and
 *  drops the finished dossier into the Query cache so the UI updates in place. */
export function useDeepDive() {
  const qc = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback(
    (city: string, country: string) => {
      const store = useDossierStore.getState()
      if (store.status === 'running' || !city || !country) return
      store.begin()

      const controller = new AbortController()
      abortRef.current = controller
      const model = useChatStore.getState().model

      void streamDeepDive(
        { city, country, model },
        {
          onProgress: (p) => useDossierStore.getState().progress(p.stage, p.found),
          onDossier: (d) => qc.setQueryData(['dossier', city, country], d),
          onError: (m) => useDossierStore.getState().fail(m),
          onDone: () => useDossierStore.getState().finish(),
        },
        controller.signal,
      )
    },
    [qc],
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    useDossierStore.getState().reset()
  }, [])

  return { start, cancel }
}
