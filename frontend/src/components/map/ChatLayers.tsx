import { Layer, Source } from 'react-map-gl/maplibre'

import { useMapStore } from '../../stores/mapStore'

/**
 * Renders the latest chat answer's map payload: amber raion highlights and
 * point markers. Features whose citation is hovered in the chat glow brighter —
 * the map and the citations are the same evidence.
 */
export function ChatLayers() {
  const chatMap = useMapStore((s) => s.chatMap)
  const activeCitation = useMapStore((s) => s.activeCitation)

  if (!chatMap) return null

  return (
    <>
      {chatMap.actions.map((action, i) => {
        const isActive =
          activeCitation !== null && action.citation_ns.includes(activeCitation)

        if (action.type === 'highlight_raion') {
          return (
            <Source key={`raion-${i}`} type="geojson" data={action.geojson}>
              <Layer
                type="fill"
                paint={{
                  'fill-color': '#f5b84c',
                  'fill-opacity': isActive ? 0.32 : 0.14,
                }}
              />
              <Layer
                type="line"
                paint={{
                  'line-color': '#f5b84c',
                  'line-width': isActive ? 2.4 : 1.4,
                  'line-opacity': isActive ? 1 : 0.75,
                }}
              />
            </Source>
          )
        }
        return (
          <Source key={`points-${i}`} type="geojson" data={action.geojson}>
            <Layer
              type="circle"
              paint={{
                'circle-radius': isActive ? 8 : 5.5,
                'circle-color': '#f5b84c',
                'circle-opacity': isActive ? 0.95 : 0.8,
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#060d1a',
              }}
            />
          </Source>
        )
      })}
    </>
  )
}
