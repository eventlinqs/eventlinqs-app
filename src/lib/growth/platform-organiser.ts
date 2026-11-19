import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readEveryRow } from '@/lib/supabase/read-every-row'
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

/**
 * The organisers rows that are not hosts to recruit or count: the platform's own listings organisation's, and, unless
 * keepTests, every record made for the acceptance tests (organisers.is_test; the PM's 02:39 of 20 November 2026, item 5,
 * migration 20261120040001). Test records are left out BY DEFAULT, so a reader written later leaves them out without
 * knowing they exist; only the CRM's own record of an organiser and the communications centre pass keepTests, so a test
 * reply is read, matched and answered there like a real one. Empty where neither is on this database.
 */
export async function readPlatformOrganiserIds(db: Db, opts: { readonly keepTests?: boolean } = {}): Promise<Set<string>> {
  const ids = new Set<string>()
  // Neither link is declared unique, so both reads are paged in full rather than bounded by a guess.
  const orgs = await readEveryRow<{ id: string }>('the platform listings organisation', (f, t) =>
    db.from('organisations').select('id').eq('slug', LISTINGS_ORGANISATION_SLUG).order('id', { ascending: true }).range(f, t),
  )
  const orgIds = orgs.map((o) => o.id)
  if (orgIds.length > 0) {
    const rows = await readEveryRow<{ id: string }>("the platform organisation's organisers rows", (f, t) =>
      db.from('organisers').select('id').in('organisation_id', orgIds).order('id', { ascending: true }).range(f, t),
    )
    for (const r of rows) ids.add(r.id)
  }
  if (opts.keepTests !== true) {
    const tests = await readEveryRow<{ id: string }>('the test organisers', (f, t) =>
      db.from('organisers').select('id').eq('is_test', true).order('id', { ascending: true }).range(f, t),
    )
    for (const r of tests) ids.add(r.id)
  }
  return ids
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
