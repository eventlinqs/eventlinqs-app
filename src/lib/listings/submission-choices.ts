import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSupabaseServiceRoleKey } from '@/lib/supabase/env'
import { GUIDE_CATEGORIES, GUIDE_CATEGORY_WORDS } from '@/lib/categories/classify'
import { DEFAULT_SUBMISSION_CONTEXT, SUBMISSION_CITIES, SUBMISSION_CITY_WORDS, type SubmissionCityChoice, type SubmissionContext } from './submission'

/**
 * WHAT THE LIST YOUR EVENT FORM OFFERS (Lawal's rulings of 8 November 2026, 07:01): every Australian city EventLinqs
 * knows (public.cities, active), the cities with a guide first in their own order, then the rest by state and name;
 * and the guide's fifteen categories in the order a visitor looks for them (src/lib/categories/classify.ts; the
 * organiser's own choice is the first rule of the guide's classifier), each one the database holds. One read for the
 * form and the same read for its server action, so the form never offers a choice the action refuses.
 *
 * NO SERVICE-ROLE KEY, NO ADMIN READ (the fail-soft rule of src/lib/listings/free-week-surface.ts: the CI build job
 * carries only public values): such a host offers the four Victorian guide cities and the fifteen categories.
 */

export type CityOption = { readonly slug: string; readonly name: string; readonly state: string; readonly guide: boolean }
export type CategoryOption = { readonly slug: string; readonly name: string }
export type SubmissionChoices = {
  readonly cities: readonly CityOption[]
  readonly categories: readonly CategoryOption[]
  readonly context: SubmissionContext
}

type CityRow = { slug: string; name: string; state: string; timezone: string | null; free_guide: boolean; display_order: number | null }

const GUIDE_OPTIONS: readonly CategoryOption[] = GUIDE_CATEGORIES.map((slug) => ({ slug, name: GUIDE_CATEGORY_WORDS[slug] }))

const FALLBACK: SubmissionChoices = {
  cities: SUBMISSION_CITIES.map((slug) => ({ slug, name: SUBMISSION_CITY_WORDS[slug], state: 'VIC', guide: true })),
  categories: GUIDE_OPTIONS,
  context: { ...DEFAULT_SUBMISSION_CONTEXT, categories: new Set(GUIDE_CATEGORIES) },
}

/** The cities in the order the form shows them: guides first by their own order, then by state and name. Pure. */
export function orderCities(rows: readonly CityRow[]): CityOption[] {
  const guides = rows.filter((r) => r.free_guide).sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999) || a.name.localeCompare(b.name))
  const rest = rows.filter((r) => !r.free_guide).sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name))
  return [...guides, ...rest].map((r) => ({ slug: r.slug, name: r.name, state: r.state, guide: r.free_guide }))
}

export const readSubmissionChoices = cache(async function readSubmissionChoices(): Promise<SubmissionChoices> {
  if (!getSupabaseServiceRoleKey()) return FALLBACK
  const db = createAdminClient()
  const [cities, categories] = await Promise.all([
    db.from('cities').select('slug, name, state, timezone, free_guide, display_order').eq('is_active', true).eq('country', 'AU'),
    db.from('event_categories').select('slug'),
  ])
  if (cities.error || !cities.data?.length) {
    console.error('[submission-choices] the cities could not be read:', cities.error?.message ?? 'none returned')
    return FALLBACK
  }
  const rows = cities.data as CityRow[]
  const cityMap = new Map<string, SubmissionCityChoice>(
    rows.map((r) => [r.slug, { name: r.name, state: r.state, timezone: r.timezone ?? 'Australia/Melbourne' }]),
  )
  const held = new Set(((categories.data ?? []) as { slug: string }[]).map((c) => c.slug))
  const cats = categories.error ? GUIDE_OPTIONS : GUIDE_OPTIONS.filter((c) => held.has(c.slug))
  return {
    cities: orderCities(rows),
    categories: cats,
    context: { cities: cityMap, categories: cats.length ? new Set(cats.map((c) => c.slug)) : null },
  }
})
