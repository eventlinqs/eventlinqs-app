import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The live taxonomy the composer chooses from.
 *
 * Read from the database rather than hardcoded, so a taxonomy migration
 * changes what the composer offers without an edit here. That is the same
 * contract `draft-fallbacks.ts` was written against: it never names a category
 * or community itself, it resolves against the list its caller supplies.
 *
 * Both readers fail SOFT to an empty list. An empty category list means the
 * deterministic layer returns an empty category and flags it for the organiser
 * to pick, which is a degraded but working kit. It never throws at a visitor.
 */

let categoryCache: { names: string[]; at: number } | null = null
let communityCache: { slugs: string[]; at: number } | null = null

/** Sixty seconds: long enough to spare the database, short enough that a
 *  taxonomy change is live within a minute. */
const TTL_MS = 60_000

export async function listCategoryNames(): Promise<string[]> {
  if (categoryCache && Date.now() - categoryCache.at < TTL_MS) return categoryCache.names
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('event_categories')
      .select('name')
      .order('name', { ascending: true })
    if (error) throw error
    const names = (data ?? [])
      .map(r => (r as { name: string | null }).name)
      .filter((n): n is string => Boolean(n))
    categoryCache = { names, at: Date.now() }
    return names
  } catch (err) {
    console.error('[launch.taxonomy] listCategoryNames:', err)
    return categoryCache?.names ?? []
  }
}

export async function listCommunitySlugs(): Promise<string[]> {
  if (communityCache && Date.now() - communityCache.at < TTL_MS) return communityCache.slugs
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('communities')
      .select('slug')
      .order('slug', { ascending: true })
    if (error) throw error
    const slugs = (data ?? [])
      .map(r => (r as { slug: string | null }).slug)
      .filter((s): s is string => Boolean(s))
    communityCache = { slugs, at: Date.now() }
    return slugs
  } catch (err) {
    console.error('[launch.taxonomy] listCommunitySlugs:', err)
    return communityCache?.slugs ?? []
  }
}
