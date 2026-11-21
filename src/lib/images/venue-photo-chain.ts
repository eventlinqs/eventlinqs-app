import { isOwnPhoto } from '@/lib/images/event-media'
import { creditLine, creditWords } from '@/lib/media/photo-credits'
import { createPublicClient } from '@/lib/supabase/public-client'
import { eventCoversFor, type VenuePhoto, type VenuePhotosRpc, type VenueUse } from '@/lib/venues/venue-photos-read'
import { coversClearedFor, standInsFor, type ImageLockRpc, type StandIn } from '@/lib/images/stand-ins'

/**
 * THE CARD IMAGE CHAIN (the project manager's 16:42 and 16:52 of 30 October 2026, with Lawal): the night's own approved
 * photograph; else an approved photograph of THE ACTUAL VENUE; else the typographic cover (EventCardMedia draws it for
 * our composed cover). Never a photograph of another venue or event.
 *
 * Every card loader passes its rows through withVenuePhotos: one read for the page, never one a card (18:00 (2)). The
 * credit, by the 18:57 ruling: no text on a card image, so on the card it is the image's title attribute only, and on
 * the event page the line right under the photo, linked to the file page and the licence.
 */

export type ChainRow = { readonly id: string; readonly cover_image_url: string | null }

export type ChainCredit = {
  /** 'Photo: <author>, <licence>', where the licence asks for one. */
  readonly image_credit?: string | null
  readonly image_credit_file?: string | null
  readonly image_credit_licence?: string | null
  /** THE IMAGE LOCK (21 November 2026): its own cover has its rights on record (event_covers_cleared_for). */
  readonly cover_rights_recorded?: boolean | null
  /** Its own licensed stand in, assigned once and never shared (event_stand_ins_for); shown labelled 'Illustrative photo'. */
  readonly stand_in_url?: string | null
  readonly stand_in_alt?: string | null
}

export type ChainDeps = {
  /** Each asked night's assigned photo (public.photo_assignments), by night id; a night with none is absent. */
  coversOf(eventIds: readonly string[], use: VenueUse): Promise<ReadonlyMap<string, VenuePhoto>>
  /** The asked nights whose current cover has its rights on record. */
  clearedOf?(eventIds: readonly string[]): Promise<ReadonlySet<string>>
  /** Each asked night's own stand in. */
  standInsOf?(eventIds: readonly string[]): Promise<ReadonlyMap<string, StandIn>>
}

/** 'CC BY-SA 4.0' from the licence and the version its own link states; no version unless the link states one. */
function licenceLabel(photo: VenuePhoto): string {
  const base = photo.licence === 'cc_by' ? 'CC BY' : 'CC BY-SA'
  const version = photo.licenceUrl?.match(/\/licenses\/by(?:-sa)?\/(\d+(?:\.\d+)?)\/?/)?.[1]
  return version ? `${base} ${version}` : base
}

/** The printed credit: author and licence where a Creative Commons licence asks; none for CC0 or public domain. */
export function venueCreditLine(photo: VenuePhoto): string | null {
  if (photo.licence === 'cc0' || photo.licence === 'public_domain') return null
  if (photo.licence === 'cc_by' || photo.licence === 'cc_by_sa') {
    const who = creditWords(photo.author ?? photo.credit)
    return who ? creditLine(`${who}, ${licenceLabel(photo)}`) : null
  }
  return creditLine(photo.credit)
}

function publicDeps(): ChainDeps {
  const db = createPublicClient()
  const lock: ImageLockRpc = (name, args) => db.rpc(name, args) as unknown as ReturnType<ImageLockRpc>
  return {
    coversOf: (eventIds, use) =>
      eventCoversFor(eventIds, use, { rpc: (name, args) => db.rpc(name, args) as unknown as ReturnType<VenuePhotosRpc['rpc']> }),
    clearedOf: (eventIds) => coversClearedFor(eventIds, lock),
    standInsOf: (eventIds) => standInsFor(eventIds, lock),
  }
}

/**
 * THE IMAGE LOCK ON EVERY CARD ROW (Lawal, 21 November 2026; the PM's 21:42): each row learns from its stored record
 * whether its own cover is cleared (rights on record) and which stand in is its own. A row that already says its cover is
 * cleared (a loader that read the rights itself) keeps that. A failed read is said in the log and leaves the fields
 * unset: the card then shows no own photograph and no stand in, the brand panel, never a guess and never a repeat.
 */
async function withImageLock<T extends ChainRow>(rows: readonly T[], deps: ChainDeps): Promise<(T & ChainCredit)[]> {
  const ids = rows.map((r) => r.id)
  let cleared: ReadonlySet<string> = new Set()
  let stands: ReadonlyMap<string, StandIn> = new Map()
  try {
    if (deps.clearedOf) cleared = await deps.clearedOf(ids.filter((_, i) => isOwnPhoto(rows[i].cover_image_url)))
  } catch (error) {
    console.error('[venue-photo-chain] the cleared covers were not read:', error instanceof Error ? error.message : error)
  }
  try {
    if (deps.standInsOf) stands = await deps.standInsOf(ids)
  } catch (error) {
    console.error('[venue-photo-chain] the stand ins were not read:', error instanceof Error ? error.message : error)
  }
  return rows.map((row) => {
    const own = row as T & ChainCredit
    const stand = stands.get(row.id)
    return {
      ...own,
      cover_rights_recorded: own.cover_rights_recorded === true || cleared.has(row.id),
      stand_in_url: stand?.imageUrl ?? null,
      stand_in_alt: stand?.alt ?? null,
    }
  })
}

/**
 * The rows with the chain's second link applied: a night without its own photograph takes the venue photo assigned to
 * it, and its credit. A night with none assigned is left as it is. A failed read leaves every row
 * as it is, said in the server log: the card then shows its typographic cover, and no page is lost to it.
 */
export async function withVenuePhotos<T extends ChainRow>(
  rows: readonly T[],
  options: { readonly use?: VenueUse; readonly deps?: ChainDeps } = {},
): Promise<(T & ChainCredit)[]> {
  // The nights to ask about, never a narrowing of the rows: every row comes back, in its order (no-display-time-exclusion).
  const askAbout: string[] = []
  for (const row of rows) if (!isOwnPhoto(row.cover_image_url)) askAbout.push(row.id)
  // The database client, made inside the guard: a host that cannot make one (a test, a prerender with no database
  // values) lets every row stand as it is, never a page lost to it.
  let deps: ChainDeps
  try {
    deps = options.deps ?? publicDeps()
  } catch (error) {
    console.error('[venue-photo-chain] no database client here; the rows stand:', error instanceof Error ? error.message : error)
    return [...rows]
  }
  if (askAbout.length === 0) return withImageLock(rows, deps)
  try {
    // NO PHOTO IS EVER REUSED (Lawal's ruling of 31 October 2026, 00:14): the database deals each venue's photos one per
    // night (deal_venue_photos) and this reads which night holds which; nothing here picks a photo.
    const use = options.use ?? 'event_card'
    const covers = await deps.coversOf(askAbout, use)
    return withImageLock(rows.map((row) => {
      if (isOwnPhoto(row.cover_image_url)) return row
      const photo = covers.get(row.id)
      if (!photo) return row
      // A PHOTOGRAPH WHOSE LICENCE NEEDS A VISIBLE CREDIT IS NOT SHOWN UNTIL THE CREDITED DESIGN EXISTS, one rule everywhere
      // (the CONTROLLER's 12:55 of 3 November 2026, round 5 fault 5): a card carries no text on its image (18:57), so its
      // credit lived only in a title attribute nobody sees. Only the event page draws the credit line under the photo, so
      // only it takes such a photo; a card keeps the typographic cover. CC0 and public domain ask no credit and stay.
      if (use !== 'event_page' && venueCreditLine(photo) !== null) return row
      return {
        ...row,
        cover_image_url: photo.imageUrl,
        image_credit: venueCreditLine(photo),
        image_credit_file: photo.fileUrl,
        image_credit_licence: photo.licenceUrl,
        // A venue photo the photo lock dealt to this night is a permitted photograph of it, credit or none (CC0).
        cover_rights_recorded: true,
      }
    }), deps)
  } catch (error) {
    console.error('[venue-photo-chain] the typographic cover stands:', error instanceof Error ? error.message : error)
    return withImageLock(rows, deps)
  }
}
