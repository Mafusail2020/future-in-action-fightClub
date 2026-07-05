import { Heart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Marker, useMap } from 'react-map-gl/maplibre'

import { useChatStore } from '../../stores/chatStore'

const MARKER_MAX_ZOOM = 8 // the whole marker hides when zoomed in closer

/** The user's home city: light-green circle with a white heart. */
export function HomeMarker() {
  const homeCity = useChatStore((s) => s.homeCity)
  const { current: map } = useMap()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!map) return
    const update = () => setVisible(map.getZoom() < MARKER_MAX_ZOOM)
    update()
    map.on('zoom', update)
    return () => {
      map.off('zoom', update)
    }
  }, [map])

  if (homeCity.lat == null || homeCity.lng == null) return null

  return (
    <Marker longitude={homeCity.lng} latitude={homeCity.lat} anchor="center">
      <button
        type="button"
        aria-label={`Наблизитись до вашого міста: ${homeCity.city}`}
        aria-hidden={!visible}
        tabIndex={visible ? 0 : -1}
        onClick={() =>
          map?.flyTo({ center: [homeCity.lng!, homeCity.lat!], zoom: 10.5, duration: 1600 })
        }
        className={`flex size-7 cursor-pointer items-center justify-center rounded-full border-[3px] border-white transition-opacity duration-300 hover:scale-110 ${
          visible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ background: '#6ee7a0' }}
      >
        <Heart size={13} strokeWidth={0} fill="#ffffff" />
      </button>
    </Marker>
  )
}
