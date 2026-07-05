import type { PaddingOptions } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'

import { resolveCityRef } from '../lib/geo'
import { useChatStore } from '../stores/chatStore'
import { useMapScene } from '../stores/mapScene'

export interface TourProgress {
  current: number
  total: number
}

/**
 * Executes the live tour queue: fly to stop -> callout -> hold -> next.
 * Cancels on Escape, manual map drag, or the user sending a new message.
 */
export function useTour(
  mapRef: React.RefObject<MapRef | null>,
  padding: () => PaddingOptions,
) {
  const tour = useMapScene((s) => s.tour)
  const consumeTour = useMapScene((s) => s.consumeTour)
  const [progress, setProgress] = useState<TourProgress | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const map = mapRef.current
    if (!tour || !map) return
    consumeTour()

    let cancelled = false
    const timers: number[] = []
    const calloutIds: { sessionId: string; id: string }[] = []

    const cancel = () => {
      if (cancelled) return
      cancelled = true
      timers.forEach(window.clearTimeout)
      setProgress(null)
      // tour callouts are transient — sweep them on exit
      for (const c of calloutIds) useMapScene.getState().removeCallout(c.sessionId, c.id)
      window.removeEventListener('keydown', onKey)
      map.getMap().off('dragstart', cancel)
      cancelRef.current = null
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    cancelRef.current = cancel
    window.addEventListener('keydown', onKey)
    map.getMap().on('dragstart', cancel)

    const { sessionId, stops, zoom } = tour
    let index = 0

    const runStop = () => {
      if (cancelled || index >= stops.length) {
        cancel()
        return
      }
      const stop = stops[index]
      const point = resolveCityRef(stop.city)
      setProgress({ current: index + 1, total: stops.length })
      if (!point) {
        index += 1
        runStop()
        return
      }
      map.flyTo({ center: point, zoom: zoom ?? 6, duration: 1800, padding: padding() })

      timers.push(
        window.setTimeout(() => {
          if (cancelled) return
          if (stop.text) {
            useMapScene.getState().applyOp(
              sessionId,
              { op: 'callout', city_id: stop.city, text: stop.text },
              true,
            )
            const scene = useMapScene.getState().scenes[sessionId]
            const added = scene?.callouts.at(-1)
            if (added) calloutIds.push({ sessionId, id: added.id })
          }
          timers.push(
            window.setTimeout(() => {
              index += 1
              runStop()
            }, stop.hold_s * 1000),
          )
        }, 1900),
      )
    }
    runStop()

    return cancel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.key])

  // A new user message interrupts the show.
  const isStreaming = useChatStore((s) => s.isStreaming)
  useEffect(() => {
    if (isStreaming) cancelRef.current?.()
  }, [isStreaming])

  return progress
}
