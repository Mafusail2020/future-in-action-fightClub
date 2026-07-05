import { Marker, useMap } from 'react-map-gl/maplibre'

import { useCities } from '../../api/queries'
import { useChatStore } from '../../stores/chatStore'
import { useMapStore } from '../../stores/mapStore'

/** Every seeded city with solutions becomes a clickable label on the globe. */
export function CityMarkers() {
  const { data: cities } = useCities()
  const { current: map } = useMap()
  const selectedCityId = useMapStore((s) => s.selectedCityId)
  const selectCity = useMapStore((s) => s.selectCity)
  const homeCity = useChatStore((s) => s.homeCity)

  return (
    <>
      {(cities ?? []).map((city) => {
        const isHome =
          city.name.toLowerCase() === homeCity.city.toLowerCase() &&
          city.country.toLowerCase() === homeCity.country.toLowerCase()
        return (
          <Marker key={city.id} longitude={city.lng} latitude={city.lat} anchor="left">
            <button
              type="button"
              className="city-marker"
              data-selected={selectedCityId === city.id}
              data-home={isHome}
              aria-label={`${city.name}, ${city.country}: рішень — ${city.solution_count ?? 0}`}
              aria-pressed={selectedCityId === city.id}
              onClick={() => {
                selectCity(city.id)
                map?.flyTo({ center: [city.lng, city.lat], zoom: 6.5, duration: 1600 })
              }}
            >
              <span className="dot" aria-hidden />
              {city.name}
              <span className="count">{city.solution_count ?? 0}</span>
            </button>
          </Marker>
        )
      })}
    </>
  )
}
