/**
 * READING THE VENUE'S ACCESSIBILITY COLUMNS WITHOUT REQUIRING THEM TO EXIST.
 *
 * ============================================================================
 * WHY THE EVENT PAGE NEEDS NOTHING HERE AND THE VENUE PAGE DOES
 * ============================================================================
 *
 * The event page reads its row with `EVENT_PAGE_SELECT`, which begins with `*`,
 * so the accessibility columns arrive on the event row the moment the migration
 * is applied, with no extra query and no change to that select. Before it is
 * applied they are simply absent, `accessibilityItems` sees `undefined` for
 * every one, and the section renders nothing. That path is already safe.
 *
 * The venue page reads `venues` with an EXPLICIT column list
 * (`src/lib/venues/resolver.ts`), and naming a column PostgREST does not have
 * fails the WHOLE query with 42703, which would blank the venue page for every
 * visitor until the founder applied the migration. Adding the columns to that
 * list is therefore not an option, so the read is separated into this
 * best-effort query instead.
 *
 * ============================================================================
 * IT DEGRADES AND IT REMEMBERS
 * ============================================================================
 *
 * A missing column, an unreachable database and a venue with no row all produce
 * the same answer: no accessibility information, which renders as no section.
 * The failure is recorded ONCE per process rather than once per request, and
 * once it is recorded the query is not attempted again for a minute: before the
 * migration lands, every venue page render would otherwise pay a round trip to
 * be told the same thing.
 *
 * This is the same shape as `src/lib/seo/discovery-threshold.ts` and for the
 * same reason, which is recorded in `docs/migrations-pending/README.md`:
 * applying a migration to production is the founder's reserved step and merging
 * code is not, so code that REQUIRES a parked migration cannot be merged.
 */
import { createPublicClient } from '@/lib/supabase/public-client'
import {
  accessibilityColumns,
  accessibilityItems,
  NO_ACCESSIBILITY_INFO,
  type AccessibilityInfo,
} from './fields'

/** How long a "these columns are not there" verdict is reused. */
const UNAVAILABLE_FOR_MS = 60_000

let unavailableUntil = 0
let warned = false

/**
 * Empty the degraded verdict.
 *
 * Two callers: a test that wants a clean process, and an operator who has just
 * applied the migration and does not want to wait out the minute before the
 * section appears.
 */
export function resetAccessibilityReadCache() {
  unavailableUntil = 0
  warned = false
}

/**
 * The venue's accessibility fields, or nothing.
 *
 * `venueId` is null for a venue page resolved from event rows alone (the
 * resolver's fallback path, where no `venues` row exists at all). That is not
 * an error; it is a venue nobody has created a record for, and it has nothing
 * to say about access.
 */
export async function readVenueAccessibility(venueId: string | null): Promise<AccessibilityInfo> {
  if (!venueId) return NO_ACCESSIBILITY_INFO
  if (Date.now() < unavailableUntil) return NO_ACCESSIBILITY_INFO

  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('venues')
      .select(accessibilityColumns('venue').join(', ') as never)
      .eq('id', venueId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return accessibilityItems(data as Record<string, unknown> | null, 'venue')
  } catch (error) {
    unavailableUntil = Date.now() + UNAVAILABLE_FOR_MS
    if (!warned) {
      warned = true
      console.warn(
        '[accessibility] venue accessibility columns unreadable, the section will not render: ' +
          (error as Error).message,
      )
    }
    return NO_ACCESSIBILITY_INFO
  }
}

/**
 * The accessibility fields for a set of venues, by id, for the dashboard.
 *
 * The organiser's venue list is read with an explicit column list for the same
 * reason the public venue page is, so the values the EDIT PANEL starts from
 * cannot come from that query either. Without this, an organiser who saved
 * "Wheelchair accessible" would reopen the form and find the box unticked,
 * which is worse than not offering the field: they would tick it again, save,
 * and reasonably conclude the platform does not keep what they tell it.
 *
 * One query for the whole page rather than one per venue, and the same degrade:
 * before the migration lands this returns an empty map, every box starts
 * unticked, and the panel's own save reports why it cannot write.
 */
export async function readVenuesAccessibility(
  venueIds: string[],
): Promise<Record<string, Record<string, unknown>>> {
  if (venueIds.length === 0) return {}
  if (Date.now() < unavailableUntil) return {}

  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('venues')
      .select(['id', ...accessibilityColumns('venue')].join(', ') as never)
      .in('id', venueIds)

    if (error) throw new Error(error.message)

    const map: Record<string, Record<string, unknown>> = {}
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      if (typeof row.id === 'string') map[row.id] = row
    }
    return map
  } catch (error) {
    unavailableUntil = Date.now() + UNAVAILABLE_FOR_MS
    if (!warned) {
      warned = true
      console.warn(
        '[accessibility] venue accessibility columns unreadable, the panel will start empty: ' +
          (error as Error).message,
      )
    }
    return {}
  }
}
