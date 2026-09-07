/**
 * THE PURE MATCHERS AND COUNTS. No framework, no database, no cache.
 *
 * Split out of discovery-counts.ts on 8 September 2026 so that a script or a
 * test can load them through the src alias loader: discovery-counts.ts imports
 * `next/cache`, which the loader cannot resolve outside a Next build, and
 * scripts/verify/discovery-counts-agree.mjs has to run BOTH these functions and
 * the SQL they mirror in the same process to prove they agree.
 *
 * Every function here mirrors SQL that already exists on a discovery page, and
 * the SQL it mirrors is named on it. See discovery-counts.ts for why the counts
 * are computed in memory over one row set rather than asked of the database
 * about 490 times per sitemap.
 */

import { getCommunityTags } from '@/lib/communities/tag-bridge'
import type { CommunitySlug } from '@/lib/communities/data'
import { getFaithTags, type FaithSlug } from '@/lib/faiths/data'
import { resolveSuburbSlug } from '@/lib/cities/resolve-suburb'

/** The columns every matcher below reads. Nothing else is fetched. */
export interface DiscoveryEventRow {
  tags: string[]
  venue_city: string | null
  suburb_primary: string | null
  venue_latitude: number | null
  venue_longitude: number | null
  category_slug: string | null
}

/* ------------------------------------------------------------- the matchers */

/** `venue_city ilike %name%`, the rule every city-scoped listing query uses. */
export function matchesCity(row: DiscoveryEventRow, cityName: string): boolean {
  if (!row.venue_city) return false
  return row.venue_city.toLowerCase().includes(cityName.toLowerCase())
}

/** `tags.cs.["token"]` for any of the community's identifying tokens. */
export function matchesCommunity(row: DiscoveryEventRow, community: CommunitySlug): boolean {
  const tokens = getCommunityTags(community)
  if (tokens.length === 0) return false
  return row.tags.some(t => tokens.includes(t))
}

/** `tags.cs.["token"]` for any of the faith's identifying tokens. */
export function matchesFaith(row: DiscoveryEventRow, faith: FaithSlug): boolean {
  const tokens = getFaithTags(faith)
  if (tokens.length === 0) return false
  return row.tags.some(t => tokens.includes(t))
}

/** `category.slug in (slug, displayName.toLowerCase())`, as /categories/[slug] asks. */
export function matchesCategory(row: DiscoveryEventRow, slugs: string[]): boolean {
  return row.category_slug !== null && slugs.includes(row.category_slug)
}

/**
 * The suburb rule, which is the one the database cannot express: an event
 * belongs to the ONE nearest district, by `suburb_primary` where it is written
 * and by the coordinate resolver where it is not. Copied in shape from
 * src/app/city/[slug]/[suburb]/page.tsx, which owns the behaviour.
 */
export function matchesSuburb(row: DiscoveryEventRow, citySlug: string, suburbSlug: string): boolean {
  const resolved =
    row.suburb_primary ??
    resolveSuburbSlug({ citySlug, latitude: row.venue_latitude, longitude: row.venue_longitude })
  return resolved === suburbSlug
}

/* --------------------------------------------------------------- the counts */

export function countCommunity(rows: DiscoveryEventRow[], community: CommunitySlug): number {
  return rows.filter(r => matchesCommunity(r, community)).length
}

export function countCommunityCity(rows: DiscoveryEventRow[], community: CommunitySlug, cityName: string): number {
  return rows.filter(r => matchesCity(r, cityName) && matchesCommunity(r, community)).length
}

export function countCity(rows: DiscoveryEventRow[], cityName: string): number {
  return rows.filter(r => matchesCity(r, cityName)).length
}

export function countSuburb(
  rows: DiscoveryEventRow[],
  cityName: string,
  citySlug: string,
  suburbSlug: string,
): number {
  return rows.filter(r => matchesCity(r, cityName) && matchesSuburb(r, citySlug, suburbSlug)).length
}

export function countCategory(rows: DiscoveryEventRow[], slugs: string[]): number {
  return rows.filter(r => matchesCategory(r, slugs)).length
}

export function countFaith(rows: DiscoveryEventRow[], faith: FaithSlug): number {
  return rows.filter(r => matchesFaith(r, faith)).length
}
