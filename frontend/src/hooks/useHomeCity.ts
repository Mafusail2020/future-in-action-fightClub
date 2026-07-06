import { useCities } from '../api/queries'
import type { City } from '../api/types'
import { ukCityName } from '../lib/cityNamesUk'
import { useChatStore } from '../stores/chatStore'

/**
 * DB record of the user's home city (the one typed in the sidebar), or null
 * while cities load / when the typed city is not in the catalog yet.
 */
/** ~0.25° ≈ 25 km — same city regardless of how its name was spelled. */
const COORD_TOLERANCE = 0.25

export function useHomeCityRecord(): { record: City | null; isPending: boolean } {
  const homeCity = useChatStore((s) => s.homeCity)
  const cities = useCities()

  // Language-proof: the sidebar autocomplete stores Ukrainian names («Житомир»)
  // while DB rows may be English ("Zhytomyr") — accept exact-name, Ukrainian
  // exonym, or coordinate-proximity matches.
  const typed = homeCity.city.trim().toLowerCase()
  const record =
    cities.data?.find((c) => {
      if (c.name.toLowerCase() === typed) return true
      if (ukCityName(c.name).toLowerCase() === typed) return true
      return (
        homeCity.lat != null &&
        homeCity.lng != null &&
        Math.abs(c.lat - homeCity.lat) < COORD_TOLERANCE &&
        Math.abs(c.lng - homeCity.lng) < COORD_TOLERANCE
      )
    }) ?? null
  return { record, isPending: cities.isPending }
}
