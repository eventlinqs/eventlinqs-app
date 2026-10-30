import type { SupabaseClient } from '@supabase/supabase-js'
import type { GalleryImage } from './event-media-model'

/**
 * AN ORGANISER'S PHOTOGRAPH CARRIES ITS CREDIT ON THE EVENT PAGE (window 6's gap list of 30 October 2026, gap 3; the
 * supreme specification s10, "Every image must have recorded provenance and permitted use", and the register's J2).
 *
 * The credit is the register's own words (social_assets.attribution_text, e.g. 'AMCF, past festival', which says
 * 'past festival' for an archival photograph by the database's own rule), reached through event_image_rights, the one
 * row per image a night shows. A credit is printed ONLY for an image whose rights are on record and current:
 * organiser_authorised or separately_licensed, not expired, its register row approved and not withdrawn. Our own
 * typographic cover needs none, and an image whose source is not on record is never credited as if it were permitted.
 *
 * event_image_rights is readable by the service role only, so the page reads this on the server.
 */

const CREDITED_STATES = new Set(['organiser_authorised', 'separately_licensed'])

export type PhotoRightsRow = {
  image_url: string
  rights_state: string
  rights_expire_at: string | null
  social_assets: { attribution_text: string | null; approval_status: string | null; withdrawal_status: string | null } | null
}

/** The credit words for each image whose rights are on record and current, by its URL. Pure. */
export function creditsFrom(rows: readonly PhotoRightsRow[], now: Date): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of rows) {
    if (!CREDITED_STATES.has(r.rights_state)) continue
    if (r.rights_expire_at && new Date(r.rights_expire_at).getTime() <= now.getTime()) continue
    const a = r.social_assets
    if (!a || a.approval_status !== 'approved' || a.withdrawal_status !== 'current') continue
    const words = a.attribution_text?.trim()
    if (words) out.set(r.image_url, words)
  }
  return out
}

/** The gallery with each image's credit attached where one is on record. Pure. */
export function withCredits(gallery: readonly GalleryImage[], credits: ReadonlyMap<string, string>): GalleryImage[] {
  return gallery.map((g) => (credits.has(g.url) ? { ...g, credit: credits.get(g.url) } : g))
}

/** The printed line for one credit, the same words the cards and posters print. */
export function creditLine(credit: string | null | undefined): string | null {
  const words = credit?.trim()
  return words ? `Photo: ${words}` : null
}

/** Reads one night's credits on the server (service role). A failed read credits nothing and says so to the caller. */
export async function readPhotoCredits(db: SupabaseClient, eventId: string, now: Date = new Date()): Promise<Map<string, string>> {
  const { data, error } = await db
    .from('event_image_rights')
    .select('image_url, rights_state, rights_expire_at, social_assets(attribution_text, approval_status, withdrawal_status)')
    .eq('event_id', eventId)
  if (error) throw new Error(`the photograph credits could not be read: ${error.message}`)
  return creditsFrom((data ?? []) as unknown as PhotoRightsRow[], now)
}
