import { getAllCities } from '@/lib/cities/data'
import { getAllCommunities } from '@/lib/communities/data'
import { createPublicClient } from '@/lib/supabase/public-client'
import type { SearchTab } from './url-filters'

/**
 * THE SCOPE BEHIND THE HEADER SEARCH TABS.
 *
 * The header search overlay offers four tabs and routes three of them to
 * `/events?q=...&tab=communities|cities|organisers`. /events rendered the
 * EVENTS scope for all four, so searching "Melbourne" under Cities returned
 * events whose title contains Melbourne and no cities at all, and searching an
 * organiser's name under Organisers returned whatever events happened to carry
 * that word. Three of the four tabs asked a question the page never answered.
 *
 * Communities and cities are matched in memory because both are small, locked,
 * editorial datasets (21 communities, 20 cities) that already live in the
 * repo. Organisers are a table, so that one is a query.
 */

export type ScopeResult = {
  /** Stable key and the thing the tile is about. */
  slug: string
  name: string
  /** One line of context under the name. Never empty. */
  meta: string
  href: string
}

/** Case and punctuation insensitive, so "gold coast" finds "Gold Coast". */
function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function hit(haystacks: (string | null | undefined)[], needle: string): boolean {
  return haystacks.some((h) => h && normalise(h).includes(needle))
}

export function searchCities(query: string): ScopeResult[] {
  const needle = normalise(query)
  if (!needle) return []
  return getAllCities()
    .filter((c) => hit([c.name, c.slug, c.state, c.region], needle))
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      meta: `${c.state} · ${c.descriptor}`,
      href: `/city/${c.slug}`,
    }))
}

export function searchCommunities(query: string): ScopeResult[] {
  const needle = normalise(query)
  if (!needle) return []
  return getAllCommunities()
    .filter((c) => hit([c.displayName, c.slug, c.tagline], needle))
    .map((c) => ({
      slug: c.slug,
      name: c.displayName,
      meta: c.tagline,
      href: `/community/${c.slug}`,
    }))
}

export async function searchOrganisers(query: string): Promise<ScopeResult[]> {
  const term = query.trim()
  if (!term) return []
  const supabase = createPublicClient()
  // Escaped for the PostgREST or() grammar, where , . ( ) are syntax. See
  // escapeOrValue in fetchers.ts for the full reasoning.
  const safe = `"%${term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`
  const { data } = await supabase
    .from('organisations')
    .select('slug, name, description')
    .or(`name.ilike.${safe},slug.ilike.${safe}`)
    .not('slug', 'is', null)
    .limit(24)
  return ((data ?? []) as { slug: string; name: string; description: string | null }[])
    .filter((o) => o.slug)
    .map((o) => ({
      slug: o.slug,
      name: o.name,
      // Never an empty line under the name: an organiser with no description
      // still gets a true statement rather than a blank.
      meta: o.description?.trim() || 'Organiser on EventLinqs',
      href: `/organisers/${o.slug}`,
    }))
}

export async function resolveScopeResults(
  tab: SearchTab,
  query: string,
): Promise<ScopeResult[]> {
  if (tab === 'cities') return searchCities(query)
  if (tab === 'communities') return searchCommunities(query)
  if (tab === 'organisers') return searchOrganisers(query)
  return []
}
