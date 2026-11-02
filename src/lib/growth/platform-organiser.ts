import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { LISTINGS_ORGANISATION_SLUG } from '@/lib/listings/shown-organiser'

/**
 * THE PLATFORM IS NOT AN ORGANISER (WINDOW 1's data point of 2 November 2026, 12:17; CONTROLLER 12:23 (D)).
 *
 * Migration 20261101132001 gives every organisation its organisers row, so the 'EventLinqs listings' organisation
 * (LISTINGS_ORGANISATION_SLUG, the platform's own account that holds every curated night whatever its host) has one
 * too. Counted as an organiser it would read as claimed and publishing hundreds of nights in the funnel, and sit in the
 * acquisition desk, the daily twenty and the organiser score as if it were a host to recruit. The frozen migrations are
 * not changed; every growth and outreach read of the organisers takes it out here, by this one rule.
 * scripts/guards/growth-reads-skip-the-platform.mjs fails the build where such a read does not.
 */

type Db = SupabaseClient<Database>

/** The organisers rows of the platform's own listings organisation; empty where that organisation is not on this database. */
export async function readPlatformOrganiserIds(db: Db): Promise<Set<string>> {
  const orgs = await readOrThrow('the platform listings organisation', () =>
    db.from('organisations').select('id').eq('slug', LISTINGS_ORGANISATION_SLUG),
  )
  const orgIds = (orgs ?? []).map((o) => o.id)
  if (orgIds.length === 0) return new Set()
  const rows = await readOrThrow("the platform organisation's organisers row", () =>
    db.from('organisers').select('id').in('organisation_id', orgIds),
  )
  return new Set((rows ?? []).map((r) => r.id))
}

/** The rows that are real organisers, in their order: every row whose organiser is not the platform's own. */
export function withoutPlatformOrganisers<T>(
  rows: readonly T[],
  platformIds: ReadonlySet<string>,
  idOf: (row: T) => string = (row) => (row as { id: string }).id,
): T[] {
  if (platformIds.size === 0) return [...rows]
  return rows.filter((row) => !platformIds.has(idOf(row)))
}
