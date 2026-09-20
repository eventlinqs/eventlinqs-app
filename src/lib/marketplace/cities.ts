import type { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow, type PagedResult } from '@/lib/supabase/read-every-row'

/**
 * THE ONE READER FOR THE MARKETPLACE CITY PICKER.
 *
 * Four surfaces drew the same picker from four copies of the same read:
 *
 *     src/app/gigs/page.tsx                        the public gig board filter
 *     src/app/artists/page.tsx                     the performer directory filter
 *     src/app/(dashboard)/dashboard/gigs/page.tsx  the organiser's post-a-gig form
 *     src/app/artist/dashboard/page.tsx            the performer's own city field
 *
 *     admin.from('cities').select('slug, name').order('tier').order('name')
 *
 * and every one of them then wrote `(result.data ?? [])`, so the error was
 * dropped four times over. A dropped socket rendered as a city picker with no
 * cities in it, which on the organiser's form is a gig that cannot be posted
 * (the action refuses with "Pick a city from the list" for a list that was
 * empty) and on the two public surfaces is a filter that silently cannot
 * filter.
 *
 * A COPY IS WHY IT WAS FOUR BUGS INSTEAD OF ONE. The same reasoning as
 * src/lib/organisers/event-tier-config.ts: one reader means one place to argue
 * with the bound and the ordering, and a fifth surface inherits the fix rather
 * than repeating the defect.
 *
 * ORDERED ON tier, THEN name, THEN slug. The first two are the display order
 * the pickers already used and neither is unique, so on their own they leave
 * the paging undefined and a window boundary can repeat one city and drop
 * another. `slug` is the table's PRIMARY KEY (verified against the live schema:
 * `cities_pkey PRIMARY KEY (slug)`), so adding it makes the order TOTAL.
 */
type Admin = ReturnType<typeof createAdminClient>

export interface PickerCity {
  slug: string
  name: string
}

/**
 * Every city the pickers offer, in display order.
 *
 * Throws rather than answering an empty list, because an empty picker and an
 * unreachable database look identical on the screen and only one of them is
 * something the person using it can do anything about.
 */
export async function fetchPickerCities(admin: Admin): Promise<PickerCity[]> {
  return readEveryRow<PickerCity>('the cities the marketplace pickers offer', (from, to) =>
    admin
      .from('cities')
      .select('slug, name')
      .order('tier')
      .order('name')
      .order('slug')
      .range(from, to) as unknown as PromiseLike<PagedResult<PickerCity>>,
  )
}
