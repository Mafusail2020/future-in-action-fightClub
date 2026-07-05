import { useCities } from '../api/queries'
import type { City } from '../api/types'
import { useChatStore } from '../stores/chatStore'

/**
 * DB record of the user's home city (the one typed in the sidebar), or null
 * while cities load / when the typed city is not in the catalog yet.
 */
export function useHomeCityRecord(): { record: City | null; isPending: boolean } {
  const homeCity = useChatStore((s) => s.homeCity)
  const cities = useCities()
  const record =
    cities.data?.find(
      (c) =>
        c.name.toLowerCase() === homeCity.city.trim().toLowerCase() &&
        c.country.toLowerCase() === homeCity.country.trim().toLowerCase(),
    ) ?? null
  return { record, isPending: cities.isPending }
}
