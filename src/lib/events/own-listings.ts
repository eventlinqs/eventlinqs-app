import type { SupabaseClient } from '@supabase/supabase-js'
import { creditLine, creditsFrom, type PhotoRightsRow } from '@/lib/media/photo-credits'
import { captureException } from '@/lib/observability/sentry'
import { previewReadOnlyOn } from '@/lib/preview/read-only'
import { getSupabaseServiceRoleKey } from '@/lib/supabase/env'
import type { DirectoryRow } from './whats-on-directory'

/**
 * AN ORGANISER'S OWN EVENT IS KNOWN BY WHERE IT CAME FROM (Lawal, 11 November 2026, 16:26: he opened the site and could
 * not find Kyivska Perepichka or A Moment of Sanity). A submission an organiser sent us and we published is written as
 * an ordinary listing (listing_source 'eventlinqs', under the EventLinqs listings account), so the guide could not tell it
 * from the engine's own and left it behind 'Show more'. The one record of who sent it is listing_submissions
 * (published_event_id, published_series_id), read here by the service role, as the guide's other reads are.
 *
 * Every row also carries its photograph's credit where the register holds one (event_image_rights through social_assets,
 * the same rule and words as the event page: src/lib/media/photo-credits.ts), so an organiser's card shows their photo
 * with its credit.
 *
 * A FAILED READ IS REPORTED AND GUESSES NOTHING: the guide still renders every event; it only loses the lead an
 * organiser's event would have had, or a credit line, and the error goes to Sentry with where it happened.
 */

export type OwnListings = { readonly events: ReadonlySet<string>; readonly series: ReadonlySet<string> }
const NONE: OwnListings = { events: new Set(), series: new Set() }

/** May this host read with the service role? Not on the design preview, and not where no key is held (CI's build). */
function adminReadable(where: string): boolean {
  if (previewReadOnlyOn()) return false
  if (!getSupabaseServiceRoleKey()) {
    console.warn(`[own-listings] no service-role key on this host; ${where} is not read`)
    return false
  }
  return true
}

/** The events and series an organiser submitted and we published. */
export async function readOwnListings(makeAdmin: () => SupabaseClient): Promise<OwnListings> {
  if (!adminReadable("the organisers' submissions")) return NONE
  const { data, error } = await makeAdmin()
    .from('listing_submissions')
    .select('published_event_id, published_series_id')
    .or('published_event_id.not.is.null,published_series_id.not.is.null')
  if (error) {
    captureException(new Error(`the organisers' submissions could not be read: ${error.message}`), { where: 'own-listings:submissions' })
    return NONE
  }
  const rows = (data ?? []) as { published_event_id: string | null; published_series_id: string | null }[]
  return {
    events: new Set(rows.map((r) => r.published_event_id).filter((v): v is string => typeof v === 'string')),
    series: new Set(rows.map((r) => r.published_series_id).filter((v): v is string => typeof v === 'string')),
  }
}

/** The credit words of each row's photograph where the register holds them, by event id (a hundred ids a read). */
export async function readThumbCredits(
  makeAdmin: () => SupabaseClient,
  rows: readonly Pick<DirectoryRow, 'id' | 'thumb'>[],
  now: Date,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const withThumb = rows.filter((r) => r.thumb)
  if (withThumb.length === 0 || !adminReadable('the photograph credits')) return out
  const thumbOf = new Map(withThumb.map((r) => [r.id, r.thumb as string]))
  const ids = [...thumbOf.keys()]
  const admin = makeAdmin()
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await admin
      .from('event_image_rights')
      .select('event_id, image_url, rights_state, rights_expire_at, social_assets(attribution_text, approval_status, withdrawal_status)')
      .in('event_id', ids.slice(i, i + 100))
    if (error) {
      captureException(new Error(`the photograph credits could not be read: ${error.message}`), { where: 'own-listings:credits' })
      return out
    }
    const byEvent = new Map<string, PhotoRightsRow[]>()
    for (const r of (data ?? []) as unknown as (PhotoRightsRow & { event_id: string })[]) byEvent.set(r.event_id, [...(byEvent.get(r.event_id) ?? []), r])
    for (const [id, rights] of byEvent) {
      const words = creditsFrom(rights, now).get(thumbOf.get(id) ?? '')
      if (words) out.set(id, words)
    }
  }
  return out
}

/** Each row marked as its organiser's own where it is, with its photograph's credit line where one is on record. Pure. */
export function withOwnAndCredits(
  rows: readonly DirectoryRow[],
  ownIds: ReadonlySet<string>,
  creditByEvent: ReadonlyMap<string, string>,
): DirectoryRow[] {
  return rows.map((r) => {
    const own = r.own === true || ownIds.has(r.id)
    const thumbCredit = r.thumb ? creditLine(creditByEvent.get(r.id)) : null
    return own === (r.own === true) && thumbCredit === (r.thumbCredit ?? null) ? r : { ...r, own, thumbCredit }
  })
}

/** The ids of the ledger's events that came from an organiser's submission, by event or by series. Pure. */
export function ownEventIds(
  ledger: readonly { id: string; listing_series_id?: string | null }[],
  own: OwnListings,
): Set<string> {
  return new Set(
    ledger.filter((r) => own.events.has(r.id) || (typeof r.listing_series_id === 'string' && own.series.has(r.listing_series_id))).map((r) => r.id),
  )
}
