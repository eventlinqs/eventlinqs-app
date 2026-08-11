/**
 * The header search tabs, made to mean something.
 *
 * The overlay offers four tabs (Communities, Cities, Events, Organisers) and
 * routed all four to `/events?q=...`, three of them appending `&tab=...` to a
 * parser that did not read it. So choosing "Cities" and typing "Melbourne"
 * ran a title-substring search for the word Melbourne, identical to every
 * other tab. Three of the four tabs were decoration.
 *
 * This resolves the tab into a filter on the SAME surface, using filters that
 * already exist, rather than inventing a new search page:
 *
 *   cities       -> the query is a place, so filter by city
 *   communities  -> the query names a community, so filter by that community
 *   organisers   -> the query is an organiser, so match organiser names only
 *   events       -> unchanged, free-text across the catalogue
 *
 * Pure, so the resolution is unit-tested without a database.
 */
import { COMMUNITY_SLUGS, getAllCommunities } from '@/lib/communities/data'
import type { FetchPublicEventsFilters } from './types'

export type ResolvedTab = {
  /** Filters to merge over the parsed ones. */
  overrides: Partial<FetchPublicEventsFilters>
  /** True when the free-text search should still run alongside. */
  keepFreeText: boolean
  /** True when the query should match organiser names only. */
  organisersOnly: boolean
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Match a typed query to a community. Accepts the slug itself, the display
 * name, or a loose slugification of what the person typed, so "First Nations",
 * "first-nations" and "Aboriginal" all reach a real community where one
 * exists. Returns null when nothing matches, and the caller then falls back to
 * a normal search rather than showing an empty page.
 */
export function resolveCommunityQuery(q: string): string | null {
  const typed = slugify(q)
  if (!typed) return null
  if ((COMMUNITY_SLUGS as readonly string[]).includes(typed)) return typed

  const all = getAllCommunities()
  const exact = all.find((c) => slugify(c.displayName) === typed)
  if (exact) return exact.slug

  const partial = all.find((c) => {
    const name = slugify(c.displayName)
    return name.length > 0 && (name.includes(typed) || typed.includes(name))
  })
  return partial ? partial.slug : null
}

export function resolveSearchTab(
  tab: FetchPublicEventsFilters['tab'],
  q: string | undefined,
): ResolvedTab {
  const none: ResolvedTab = { overrides: {}, keepFreeText: true, organisersOnly: false }
  if (!tab || tab === 'events' || !q || !q.trim()) return none

  if (tab === 'cities') {
    // The city filter is an ilike on venue_city, so the typed place name is
    // used directly. Free text is dropped: the person asked for a place, not
    // for events whose title contains that word.
    return { overrides: { city: q.trim() }, keepFreeText: false, organisersOnly: false }
  }

  if (tab === 'communities') {
    const slug = resolveCommunityQuery(q)
    // No community matched what they typed, so a normal search is a better
    // answer than an empty page.
    if (!slug) return none
    return { overrides: { community: slug }, keepFreeText: false, organisersOnly: false }
  }

  // organisers
  return { overrides: {}, keepFreeText: true, organisersOnly: true }
}
