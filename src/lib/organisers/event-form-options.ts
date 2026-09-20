import type { SupabaseClient } from '@supabase/supabase-js'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import type { EventCategory } from '@/types/database'

/**
 * THE TWO OPTION LISTS THE EVENT FORM CANNOT BE FILLED IN WITHOUT.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS. The create form and the edit form each carried their own
 * copy of these two reads, byte for byte identical, and both copies discarded
 * the error and stated no bound:
 *
 *     const { data: categories } = await supabase
 *       .from('event_categories').select('*').eq('is_active', true).order('sort_order')
 *
 * A read that fails here does not fail the page. `data` is null, `?? []` turns
 * it into an empty list, and the form renders a category select with no
 * options and a venue select with no venues. The organiser is looking at a
 * form they cannot complete, with nothing on the screen saying why, on the one
 * surface the whole platform depends on them reaching the end of. Category is
 * required, so the save is refused by a validator describing a field whose
 * choices were never drawn.
 *
 * Truncation does the quieter version of the same harm: the project's row
 * ceiling ("By default, Supabase projects return a maximum of 1,000 rows",
 * https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19)
 * removes options from the end of the list in silence, and the organiser
 * concludes their venue was deleted.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ORDER CARRIES A TIEBREAK. `.order('sort_order')` and `.order('name')`
 * are not unique. Ranged paging over a non-unique order is not paging at all:
 * two rows that tie across a page boundary can both land in one window, or
 * neither. `id` is appended so the total order is total, which is what makes
 * the pager correct rather than merely bounded.
 */

export interface VenueOption {
  id: string
  name: string
  seat_maps: { id: string; name: string; total_seats: number }[]
}

/** Active categories, in the order the form presents them. */
export async function readEventCategories(client: SupabaseClient): Promise<EventCategory[]> {
  return readEveryRow<EventCategory>('the event form categories', (from, to) =>
    client
      .from('event_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{
      data: EventCategory[] | null
      error: { message: string } | null
    }>,
  )
}

/** One organisation's active venues, each with the seat maps drawn for it. */
export async function readOrganisationVenues(
  client: SupabaseClient,
  organisationId: string,
): Promise<VenueOption[]> {
  const rows = await readEveryRow<VenueOption>('the event form venues', (from, to) =>
    client
      .from('venues')
      .select('id, name, seat_maps(id, name, total_seats)')
      .eq('organisation_id', organisationId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{
      data: VenueOption[] | null
      error: { message: string } | null
    }>,
  )

  // The embedded list is null for a venue with no seat map, and both call sites
  // filtered out falsy members before rendering. Kept, in one place.
  return rows.map(v => ({
    id: v.id,
    name: v.name,
    seat_maps: (v.seat_maps ?? []).filter(Boolean),
  }))
}
