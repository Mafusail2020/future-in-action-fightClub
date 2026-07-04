import { Marker, useMap } from 'react-map-gl/maplibre'

import { useCities } from '../../api/queries'
import { useMapStore } from '../../stores/mapStore'

/** Zhytomyr is the subject of the problems layer, not a solutions city — its
 *  marker is always present and flies you home. */
const ZHYTOMYR = { lng: 28.6587, lat: 50.2547 }

export function CityMarkers() {
  const { data: cities } = useCities()
  const { current: map } = useMap()
  const selectedCityId = useMapStore((s) => s.selectedCityId)
  const selectCity = useMapStore((s) => s.selectCity)

  return (
    <>
      <Marker longitude={ZHYTOMYR.lng} latitude={ZHYTOMYR.lat} anchor="left">
        <button
          type="button"
          className="city-marker"
          data-home="true"
          aria-label="Житомир — додому, до карти проблем"
          onClick={() => {
            selectCity(null)
            map?.flyTo({ center: [ZHYTOMYR.lng, ZHYTOMYR.lat], zoom: 11.5, duration: 2200 })
          }}
        >
          <span className="dot" aria-hidden />
          Житомир
        </button>
      </Marker>

      {(cities ?? [])
        .filter((c) => c.lat !== null && c.lng !== null)
        .map((city) => (
          <Marker key={city.id} longitude={city.lng!} latitude={city.lat!} anchor="left">
            <button
              type="button"
              className="city-marker"
              data-selected={selectedCityId === city.id}
              aria-label={`${city.name}, ${city.country}: ${city.case_count} розв'язаних проблем`}
              aria-pressed={selectedCityId === city.id}
              onClick={() => {
                selectCity(city.id)
                map?.flyTo({ center: [city.lng!, city.lat!], zoom: 6.5, duration: 1600 })
              }}
            >
              <span className="dot" aria-hidden />
              {city.name}
              <span className="count">{city.case_count}</span>
            </button>
          </Marker>
        ))}
    </>
  )
}
