/**
 * Culture → legacy category-slug bridge.
 *
 * The DB migration in 20260504000002_culture_taxonomy.sql adds a
 * culture_primary column on events but the founder applies migrations
 * via PowerShell terminal (`supabase db push --linked`). Until that
 * runs, the public surface still queries event_categories.slug.
 *
 * This bridge maps each new culture slug to the list of legacy
 * event_categories.slug values that should populate its rails. The
 * bridge stays in place after migration so imported organiser events
 * that don't carry culture_primary still flow into the right culture
 * page based on their existing category.
 */

import type { CultureSlug } from './data'

export const CULTURE_TO_CATEGORY_SLUGS: Record<CultureSlug, string[]> = {
  african:         ['afrobeats', 'amapiano', 'owambe'],
  'south-asian':   ['bollywood'],
  caribbean:       ['caribbean'],
  latin:           ['latin'],
  'east-asian':    ['lunar'],
  filipino:        ['filipino'],
  mediterranean:   ['italian'],
  'middle-eastern': ['middle-eastern'],
  european:        ['european'],
  pacific:         ['pacific'],
  gospel:          ['gospel'],
  comedy:          ['comedy'],
  wellness:        ['health-wellness'],
  pride:           ['pride'],
}

export function getCategorySlugsForCulture(culture: CultureSlug): string[] {
  return CULTURE_TO_CATEGORY_SLUGS[culture] ?? []
}
