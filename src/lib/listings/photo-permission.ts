import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { proofMatches } from '@/lib/outreach/photo-link'
import { readTheirNights } from '@/lib/outreach/their-nights'
import { founderAccount } from '@/lib/outreach/twenty-drafts'
import { addAsset, decideAsset, pendingAssetId } from '@/lib/social/store'
import { EVENT_PHOTO_BOX, fitsEventPhotoBox } from '@/lib/media/limits'
import { CANONICAL_HOST } from '@/lib/site-url'
import { storeImage, type MediaDeps } from './organiser-media'
import { ONE_TICK_USES, grantWording, mediaDecision, nightNamedBy, permittedUsesWords, restrictionFor } from './photo-permission-math'

/**
 * AN ORGANISER'S PHOTOS, GIVEN THROUGH THEIR SECURE LINK (Lawal, 12 November 2026, 12:01, item 2; the Growth OS order's
 * Release 2, item 6: "Media permissions: a request in his format with the organiser's secure link to upload photos and
 * choose the uses; each grant stored with asset, rights holder, source, permitted uses, restrictions, expiry and evidence;
 * listing permission kept separate from image permission").
 *
 * The page /photos/<contact>/<proof> (src/lib/outreach/photo-link.ts) shows the organiser their own public nights. They
 * choose one night, add up to five photos or artwork, and give ONE tick (Lawal, 13:49 of 23 November 2026: "One tick, one
 * checkbox ... We are just promoting the event"): they took them or may share them, anyone identifiable agreed, and
 * EventLinqs may use them to promote the event and their future events, on EventLinqs, in its social posts and in its
 * emails (photo-permission-math.ts ONE_TICK_WORDS). Then, in this order:
 *   1. their yes is logged for THAT night through the database's one way of logging a yes (social_log_organiser_yes,
 *      20261028153001): their own words as the page put them, the date, channel 'website', scope this event. Only ever
 *      this event: a yes for future nights is keyed to the night's host, and an organiser who hires a public venue would
 *      otherwise grant every other organiser's nights there;
 *   2. each image is re-encoded and stored by the organiser media pipeline (organiser-media.ts storeImage: magic bytes,
 *      orientation and metadata stripped, never a photo already locked to another night);
 *   3. each is entered in the asset register through its one writer (social/store.ts addAsset) as organiser authorised,
 *      carrying the yes (the register's trigger takes it), the one tick's uses (scope 'both', the words naming emails
 *      too) and the day it came. A refusal removes the stored file;
 *   4. each is then APPLIED AUTOMATICALLY (18 November 2026, 13:46): approved by the register's one decider
 *      (decideAsset), for that night, and, where the night shows no photo of the organiser's own, the first becomes its
 *      cover. An admin can still withdraw any of them.
 * The founder account is named as the one who logged it (the yes's logged_by), as it is for every drafted message.
 */

type Db = SupabaseClient<Database>

const ORIGIN = `https://${CANONICAL_HOST}`
export const MAX_PHOTOS = 5

export interface PhotoNight {
  readonly eventId: string
  readonly slug: string
  readonly title: string
  readonly startDate: string
  readonly timezone: string | null
  readonly venueName: string | null
}

export type PhotoPage =
  | { readonly state: 'found'; readonly contactId: string; readonly organiserName: string; readonly greeting: string; readonly nights: readonly PhotoNight[]; readonly preselect: string | null }
  | { readonly state: 'not found' }

/** The contact's page, only when the proof is theirs; their own public nights ahead, soonest first. */
export async function readPhotoPage(db: Db, contactId: string, proof: string, now: Date): Promise<PhotoPage> {
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) return { state: 'not found' }
  const c = await db.from('organiser_contacts').select('id, organiser_id, person_name, unsubscribe_token, organisers(id, name, organisation_id, website_url, is_test)').eq('id', contactId).maybeSingle()
  if (c.error || !c.data || !proofMatches(proof, c.data.unsubscribe_token as string | null)) return { state: 'not found' }
  const org = c.data.organisers as unknown as { id: string; name: string; organisation_id: string | null; website_url: string | null; is_test: boolean | null } | null
  if (!org) return { state: 'not found' }
  // The test mark is read here, on the server, from the organiser's own row (the PM's 05:38 of 20 November 2026, item 2).
  const nights = (await readTheirNights(db, { id: org.id, organisation_id: org.organisation_id, website_url: org.website_url, isTest: org.is_test === true }, now, 12)).map((n) => ({
    eventId: n.eventId,
    slug: n.slug,
    title: n.title,
    startDate: n.startDate,
    timezone: n.timezone,
    venueName: n.venueName,
  }))
  const first = ((c.data.person_name as string | null) ?? '').trim().split(/\s+/)[0] ?? ''
  // The night the letter names opens already chosen (the PM's 13:50 item 1 (d)): read from the newest letters sent to
  // this contact, whose subject names the night; the 14 letters need no change.
  const { data: sent } = await db.from('outreach_touches').select('subject').eq('contact_id', contactId).eq('state', 'sent').order('sent_at', { ascending: false }).limit(5)
  const preselect = (sent ?? []).map((t) => nightNamedBy(t.subject as string | null, nights)).find((id): id is string => id !== null) ?? null
  return { state: 'found', contactId, organiserName: org.name, greeting: first || `${org.name} team`, nights, preselect }
}

export type GiveAnswer =
  | { readonly state: 'done'; readonly added: number; readonly refused: readonly string[]; readonly applied: number; readonly coverSet: boolean; readonly slug: string }
  | { readonly state: 'refused'; readonly reason: string }

/** Records the yes for the chosen night, then stores, registers and applies each image (13:46 of 18 November 2026). */
export async function givePhotos(
  db: Db,
  input: {
    readonly page: Extract<PhotoPage, { state: 'found' }>
    readonly eventId: string
    readonly files: readonly File[]
    readonly givenBy: string
    readonly now: Date
    /** The organiser's own answer: a photograph, or their event's flyer (kept as artwork; the PM's 23:38 of 18 November 2026). */
    readonly kind?: 'photo' | 'flyer'
  },
  deps: MediaDeps,
): Promise<GiveAnswer> {
  const night = input.page.nights.find((n) => n.eventId === input.eventId)
  if (!night) return { state: 'refused', reason: 'Choose one of your nights.' }
  if (!night.venueName) return { state: 'refused', reason: 'That night has no venue on its listing yet, so a photo cannot be kept for it. Reply to our email and the EventLinqs team will set it up.' }
  const files = input.files.filter((f) => f instanceof File && f.size > 0)
  if (files.length === 0) return { state: 'refused', reason: 'Choose at least one photo or artwork.' }
  if (files.length > MAX_PHOTOS) return { state: 'refused', reason: `Choose up to ${MAX_PHOTOS} at a time.` }
  const founder = await founderAccount(db)
  if (founder.id === null) return { state: 'refused', reason: 'Your photos could not be kept just now. Try again in a minute.' }

  // EVERY PHOTO IS STORED AND CHECKED BEFORE ANY YES IS LOGGED (the PM's 15:02 of 20 November 2026, the upload class: on
  // 18 November at 23:50 an organiser's yes was logged and 0 images kept, because the yes came first). An upload that
  // keeps nothing logs nothing and says, photo by photo, why each was not kept; a yes is logged only for photos kept.
  const refused: string[] = []
  const kept: { file: File; stored: Extract<Awaited<ReturnType<typeof storeImage>>, { url: string }> }[] = []
  for (const file of files) {
    const stored = await storeImage(`photos/${night.eventId}`, file, night.eventId, deps)
    if ('refused' in stored) {
      refused.push(`${file.name || 'An image'}: ${stored.refused}`)
      continue
    }
    // THE DESTINATION FIT (the PM's 13:42 class, law 4): a photo for our posts is at least Meta's minimum width
    // (https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media:
    // "Minimum width: 320"); the event page shows any photo whole (law 15), so it asks nothing more.
    if (stored.width !== undefined && stored.width < POSTS_MIN_WIDTH) {
      await deps.remove([stored.path])
      refused.push(`${file.name || 'An image'}: it is ${stored.width} pixels wide; a photo for posts needs at least ${POSTS_MIN_WIDTH}.`)
      continue
    }
    // THE EVENT PAGE'S OWN BOX (the PM's 09:45 of 19 November 2026, item 1 (c); src/lib/media/limits.ts): a photo for the
    // page is kept when the page draws it whole without enlarging it, so a good 973 x 695 festival photo is never refused
    // as it was on 18 November at 23:50; one too small for that is refused in words that say what would fit.
    if (stored.width !== undefined && stored.height !== undefined && !fitsEventPhotoBox(stored.width, stored.height)) {
      await deps.remove([stored.path])
      refused.push(
        `${file.name || 'An image'}: it is ${stored.width} x ${stored.height} pixels, so your event page would have to enlarge it; a photo at least ${EVENT_PHOTO_BOX.height} pixels tall, or ${EVENT_PHOTO_BOX.width} wide, shows sharp.`,
      )
      continue
    }
    kept.push({ file, stored })
  }
  // Nothing kept: no yes, nothing in the register, each photo's reason said.
  if (kept.length === 0) return { state: 'done', added: 0, refused, applied: 0, coverSet: false, slug: night.slug }

  const yes = await db.rpc('social_log_organiser_yes', {
    p_host: night.venueName,
    p_granted_at: input.now.toISOString(),
    p_wording: grantWording({ givenBy: input.givenBy, organiserName: input.page.organiserName, nightTitle: night.title, count: kept.length }),
    p_scope: 'this_event',
    p_channel: 'website',
    p_event: night.eventId,
    p_logged_by: founder.id,
  })
  if (yes.error) {
    // The yes could not be kept, so neither are the photos stored for it.
    await deps.remove(kept.map((k) => k.stored.path))
    const words = /refused:\s*(.+)$/s.exec(yes.error.message)?.[1]?.trim()
    return { state: 'refused', reason: words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Your permission could not be kept just now. Try again in a minute.' }
  }

  const receivedOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(input.now)
  let added = 0
  const applied: string[] = []
  for (const { file, stored } of kept) {
    const assetType = input.kind === 'flyer' ? 'artwork' : 'photo'
    const done = await addAsset(db, {
      assetState: 'organiser_authorised',
      assetType,
      assetUrl: stored.url,
      sourceUrl: `${ORIGIN}/photos`,
      rightsHolder: input.page.organiserName,
      permissionEvidence: null,
      evidenceFile: null,
      eventSlug: night.slug,
      attributionText: input.page.organiserName,
      scope: ONE_TICK_USES,
      archival: false,
      expiresAt: null,
      // A photograph carries no restriction; only their finished design (a flyer) is kept whole (restrictionFor).
      restrictions: restrictionFor(assetType),
      originalFile: stored.path,
      receivedOn,
      permittedUses: permittedUsesWords(),
      focal: null,
      // THE ASSET'S OWN SIZE AND FILE (the master directive's A3 (3)): its pixel size as stored, without which the
      // lifecycle planner passes it by (lifecycle-plan.ts reads a photo with no size as no photo), and the file as they
      // supplied it, by its SHA-256, so the same file is never registered twice, its bytes and its format.
      sourceWidth: stored.width ?? null,
      sourceHeight: stored.height ?? null,
      leadRank: null,
      contentSha256: stored.hashes.sha256,
      byteSize: stored.byteSize,
      fileFormat: stored.format,
      by: founder.id,
    })
    if (done.state === 'refused') {
      await deps.remove([stored.path])
      refused.push(`${file.name || 'An image'}: ${done.reason}`)
      continue
    }
    added += 1
    // APPLIED AUTOMATICALLY (Lawal, 18 November 2026, 13:46: "If they ticked it, if they approve it, good"; the PM's
    // 13:50 item 1 (c)): the organiser's own photo, through their own private link, for their own night, with the one
    // tick given, has passed every check above, so it is approved now, for that night (the register row carries its
    // scope and its words). No founder review. An admin can still withdraw it.
    const assetId = await pendingAssetId(db as never, night.eventId, stored.url)
    // The one decision (law 32): their declaration on this page is the grant, the one tick's uses.
    const decided = mediaDecision({ grant: { uses: ONE_TICK_USES }, placement: 'site' })
    if (assetId && decided.state === 'approved') {
      const ok = await decideAsset(db as never, { id: assetId, decision: 'approved', by: founder.id, now: input.now })
      if (ok.state === 'done') applied.push(stored.url)
    }
  }

  // ON THE EVENT PAGE (the one tick covers it): the first applied photo becomes the night's cover unless the night
  // already shows a photo of the organiser's own (event_image_rights reads organiser_authorised or separately_licensed
  // for its cover); the database records its rights from the approved register row (event_image_right).
  let coverSet = false
  if (applied.length > 0) {
    const { data: rights } = await db.from('event_image_rights').select('rights_state').eq('event_id', night.eventId).eq('image_role', 'cover').maybeSingle()
    if (!OWN_PHOTO_RIGHTS.has(String(rights?.rights_state ?? ''))) {
      const { error } = await db.from('events').update({ cover_image_url: applied[0] }).eq('id', night.eventId)
      coverSet = !error
    }
  }
  return { state: 'done', added, refused, applied: applied.length, coverSet, slug: night.slug }
}

/** Meta's minimum width for an image it publishes (IG User Media, Image Specifications). */
export const POSTS_MIN_WIDTH = 320
/** A cover that is already the organiser's own, or licensed, is never replaced by a new upload. */
const OWN_PHOTO_RIGHTS = new Set(['organiser_authorised', 'separately_licensed'])
