import type { Category } from '../api/types'

/** Static fallback for /api/v1/categories — same vocabulary, offline-safe. */
export const CATEGORY_LABELS: Record<Category, string> = {
  transport: 'Транспорт і мобільність',
  energy: 'Енергетика й опалення',
  housing: 'Житло',
  water: 'Вода й водовідведення',
  waste: 'Поводження з відходами',
  safety: 'Громадська безпека',
  health: "Здоров'я",
  environment: 'Довкілля й зелені зони',
  digital: 'Цифрове й розумне місто',
  governance: 'Врядування й участь',
  economy: 'Місцева економіка',
  climate_resilience: 'Кліматична стійкість',
}

export function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value as Category] ?? value
}
