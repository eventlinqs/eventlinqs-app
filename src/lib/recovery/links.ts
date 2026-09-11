/**
 * THE ADAPTER BETWEEN EVENTLINQS AND THE RECOVERY ENGINE. Close-out D2.
 *
 * The engine reads the ledger and nothing else, so it knows a slot has a
 * `source_ref` and knows nothing about how this platform addresses one. This
 * file is the translation, and it is the ONLY place in the recovery path that
 * says the words event, ticket or tier. It sits outside `src/lib/fillrate/` for
 * exactly that reason: `fillrate-reads-only-the-ledger` fails the build if a
 * word from this file ever appears in there.
 *
 * It is the same shape as D1's boundary. `src/lib/ledger/adapter.ts` maps an
 * event INTO the ledger; this maps a ledger slot back OUT to the pages a person
 * can actually open. Point the engine at a gym and it gets a different file of
 * this size, and nothing inside the engine changes.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/site-url'
import { BRAND_STRAPLINE } from '@/lib/brand/positioning'
import type { Links } from '@/lib/fillrate/engine'
import type { SlotRow } from '@/lib/fillrate/due'

/**
 * WHY THE LINK CARRIES ITS OWN ATTRIBUTION even though the panel does not need
 * it. The recovery rate is measured from the ledger, by matching a later sale on
 * the same slot to the same address, so it survives a person pasting the link
 * into a different browser. The UTM parameters are there for the ORGANISER's own
 * analytics, which read what the browser was given.
 */
export function withAttribution(url: string, campaign: string): string {
  /*
   * THE QUERY GOES BEFORE THE FRAGMENT, and the first version of this did not.
   * It appended to the end of a URL that already ended in `#tickets`, producing
   *
   *     /events/<slug>#tickets?utm_source=eventlinqs&...
   *
   * where everything after the hash is the FRAGMENT. So the parameters were
   * never query parameters, the organiser's analytics saw none of them, and the
   * fragment no longer matched the `id="tickets"` element, so the one thing the
   * link exists to do, put a person back on the ticket selector, quietly stopped
   * happening. Found by opening the link the drive read out of a real message.
   */
  const [withoutFragment, fragment] = url.split('#')
  const separator = withoutFragment.includes('?') ? '&' : '?'
  const query = `utm_source=eventlinqs&utm_medium=email&utm_campaign=${campaign}`
  return `${withoutFragment}${separator}${query}${fragment ? `#${fragment}` : ''}`
}

/**
 * WHERE "FINISH BOOKING" GOES.
 *
 * The event's own page, at the ticket selection section, because by the time a
 * recovery message is sent the ORIGINAL reservation has already expired: that
 * expiry is how the platform learns the checkout was abandoned at all. Sending
 * somebody to a dead reservation id would be worse than sending nothing.
 *
 * A slot whose event is no longer published resolves to null, and the engine
 * refuses to send rather than writing to somebody about something they cannot
 * buy.
 */
export const eventLinqsLinks: Links = {
  /*
   * THE LINE THIS PLATFORM SIGNS WITH, read from the one source that defines it.
   * It is supplied to the engine rather than imported by it, because a signature
   * is a statement about a brand and the engine has none: a gym's adapter signs
   * with the gym's line and no message code changes.
   */
  signature: `The EventLinqs team. ${BRAND_STRAPLINE}`,

  async resumeUrlFor(slot: SlotRow): Promise<string | null> {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('events')
      .select('slug, status')
      .eq('id', slot.sourceRef)
      .maybeSingle()
    if (error) {
      console.error(`[recovery] could not resolve a link for slot ${slot.id}: ${error.message}`)
      return null
    }
    const row = data as { slug: string | null; status: string | null } | null
    if (!row?.slug) return null
    if (row.status !== 'published') return null
    return withAttribution(`${getAppUrl()}/events/${row.slug}#tickets`, 'recovery')
  },

  async describe(slot: SlotRow) {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('events')
      .select('title, timezone, organisations!organisation_id ( name )')
      .eq('id', slot.sourceRef)
      .maybeSingle()
    if (error) {
      console.error(`[recovery] could not describe slot ${slot.id}: ${error.message}`)
      return null
    }
    const row = data as
      | { title: string | null; timezone: string | null; organisations: { name: string | null } | { name: string | null }[] | null }
      | null
    if (!row?.title) return null
    const organisation = Array.isArray(row.organisations) ? row.organisations[0] : row.organisations
    return {
      name: row.title,
      organiserName: organisation?.name ?? null,
      timezone: row.timezone ?? null,
    }
  },
}
