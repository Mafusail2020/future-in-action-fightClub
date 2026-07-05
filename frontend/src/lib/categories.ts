import type { Category } from '../api/types'

/** Static fallback for /api/v1/categories — same vocabulary, offline-safe. */
export const CATEGORY_LABELS: Record<Category, string> = {
  transport: 'Transport & Mobility',
  energy: 'Energy & Heating',
  housing: 'Housing',
  water: 'Water & Sanitation',
  waste: 'Waste Management',
  safety: 'Public Safety',
  health: 'Health',
  environment: 'Environment & Green Space',
  digital: 'Digital & Smart City',
  governance: 'Governance & Participation',
  economy: 'Local Economy',
  climate_resilience: 'Climate Resilience',
}

export function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value as Category] ?? value
}
