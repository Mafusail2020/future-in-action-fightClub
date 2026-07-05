import type { City, CityRef } from '../api/types'
import { queryClient } from './queryClient'
import { useChatStore } from '../stores/chatStore'

/** [lng, lat] for a map-op city reference ("home" = the user's city). */
export function resolveCityRef(ref: CityRef): [number, number] | null {
  if (ref === 'home') {
    const { lat, lng } = useChatStore.getState().homeCity
    return lat != null && lng != null ? [lng, lat] : null
  }
  const cities = queryClient.getQueryData<City[]>(['cities'])
  const city = cities?.find((c) => c.id === ref)
  return city ? [city.lng, city.lat] : null
}

export function cityRefName(ref: CityRef): string {
  if (ref === 'home') return useChatStore.getState().homeCity.city
  const cities = queryClient.getQueryData<City[]>(['cities'])
  return cities?.find((c) => c.id === ref)?.name ?? ''
}

/** Great-circle line between two [lng, lat] points (for animated arcs). */
export function greatCircle(
  from: [number, number],
  to: [number, number],
  segments = 48,
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const [lng1, lat1] = [toRad(from[0]), toRad(from[1])]
  const [lng2, lat2] = [toRad(to[0]), toRad(to[1])]

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2,
      ),
    )
  if (d === 0) return [from, to]

  const points: [number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const f = i / segments
    const a = Math.sin((1 - f) * d) / Math.sin(d)
    const b = Math.sin(f * d) / Math.sin(d)
    const x = a * Math.cos(lat1) * Math.cos(lng1) + b * Math.cos(lat2) * Math.cos(lng2)
    const y = a * Math.cos(lat1) * Math.sin(lng1) + b * Math.cos(lat2) * Math.sin(lng2)
    const z = a * Math.sin(lat1) + b * Math.sin(lat2)
    points.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.hypot(x, y)))])
  }
  return points
}
