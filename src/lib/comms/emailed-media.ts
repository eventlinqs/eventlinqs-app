import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import { readTheirNights, type OwnNight } from '@/lib/outreach/their-nights'
import { addAsset } from '@/lib/social/store'
import { storeImage, type MediaDeps } from '@/lib/listings/organiser-media'
import { nightNamedBy, restrictionFor } from '@/lib/listings/photo-permission-math'

/**
 * AN ORGANISER'S EMAILED IMAGES (the master directive's A3 (1); the PM's 12:18 item 4 of
 * 23 November 2026: "THE DEFECT: an organiser's emailed attachment is never ingested. Fix the cause: a reply's image
 * attachments from an organiser with a grant or pending request are recorded as candidate assets for that event,
 * matched to the grant, so nobody asks twice for a file already sent").
 *
 * THE CAUSE. Kyivska Perepichka's organiser emailed the original poster on 9 November 2026 in reply to Lawal's request
 * for it. The inbox run (src/lib/outreach/replies.ts handleInbox) logged a reply's words and its class; a 'photographs'
 * reply was only SHOWN from the mailbox in the Communications centre (src/lib/comms/inbound-attachments.ts copies
 * nothing), so the file never reached the asset register and the engine kept a phone screenshot.
 *
 * WHAT HAPPENS NOW, from the inbox run, for a reply whose sender is an organiser contact on record:
 *   THEIR IMAGES (keepEmailedImages), only from an organiser who has a grant or one of our photo requests open: each
 *      supported image (inbound-attachments.ts isShownPhoto chose them: an image type, not inline, at most 25 MB) is
 *      re-encoded and stored by the organiser media pipeline (storeImage: magic bytes, orientation, metadata stripped,
 *      never a photo locked to another night) and entered through the register's one writer (social/store.ts addAsset)
 *      with its provenance: mailto: its sender as the source, the message id, sender, day and file name as the evidence,
 *      the day it came, the file's SHA-256, bytes and format. The same file is never registered twice (content_sha256).
 *      A finished design is artwork, kept whole (restrictionFor); a camera photograph is a photo.
 *      MATCHED TO THE GRANT: for the night the thread is about, under a grant that covers it, it is organiser authorised
 *      (the register's trigger takes the yes: its evidence, its id, its permitted uses), and PENDING: a person approves
 *      its use, as for every register row an organiser did not place through the one tick. Without a grant yet it is
 *      registered as a native share, which no page or post ever carries (social_asset_usable), and which their yes, when
 *      it comes, turns organiser authorised by the database's own rule (organiser_yes_takes_native_shares).
 *      UNCERTAIN MATCHES KEPT FOR REVIEW: a thread that names no night of theirs registers its images with no night,
 *      never guessed from the organiser's other nights (Lawal's 12:34: "The engine must not automatically associate an
 *      image with an event simply because the sender previously organised another event").
 */

type Db = SupabaseClient<Database>

/** One attachment as read from the mailbox. */
export type EmailedFile = { readonly name: string; readonly contentType: string; readonly bytes: ArrayBuffer }

/** The message as the inbox run read it: who wrote, when, the id it is known by, and their own words. */
export type EmailedMessage = { readonly internetMessageId: string; readonly fromAddress: string; readonly receivedAt: string; readonly ownWords: string }

/** The letter of ours the message answers, when there is one. */
export type ThreadTouch = { readonly subject: string | null; readonly context_key: string | null } | null

/** The open photo requests: our PERM image letters (the request and its reminders, src/lib/comms/categories.ts). */
const PHOTO_REQUEST_SUBTYPES = ['PERM-IMAGE', 'PERM-REMINDER']

/**
 * The night a thread is about, or null: our letter's own context (event:<id>, contact-policy.ts contextKeys.event),
 * else the night its subject names (the photo request's subject, nightNamedBy). Never any other night of theirs.
 */
export function nightOfThread(touch: ThreadTouch, nights: readonly OwnNight[]): OwnNight | null {
  if (!touch) return null
  const ctx = /^event:([0-9a-f-]{36})$/i.exec(touch.context_key ?? '')
  if (ctx) return nights.find((n) => n.eventId === ctx[1]) ?? null
  const named = nightNamedBy(touch.subject, nights)
  return named ? (nights.find((n) => n.eventId === named) ?? null) : null
}

const DESIGN_WORDS = /\b(posters?|flyers?|artwork|art work|tiles?|banners?|designs?|graphics?|fb post|facebook post|insta(gram)? post|story|stories|promo(tional)? (image|material))\b/i
const CAMERA_NAME = /^(img|dsc|dscn|dscf|pxl|gopr|photo|_mg)[ _-]?\d/i
const PHOTO_WORDS = /\b(photos?|photographs?|pictures?|pics|shots)\b/i

/**
 * A finished design (a poster, a flyer, a social tile) is ARTWORK, kept whole (the PM's 12:18 item 4: "the event's
 * poster (whole, unaltered)"); a camera photograph is a PHOTO. Read from the file's own name first, then from their
 * words; where neither says, it is kept whole, because cropping an organiser's finished design is the harm, and a
 * photograph kept whole is only less flexible.
 */
export function emailedAssetType(fileName: string, ownWords: string): 'photo' | 'artwork' {
  const name = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.]+/g, ' ')
  if (DESIGN_WORDS.test(name)) return 'artwork'
  if (CAMERA_NAME.test(fileName)) return 'photo'
  if (PHOTO_WORDS.test(ownWords) && !DESIGN_WORDS.test(ownWords)) return 'photo'
  return 'artwork'
}

async function organiserOf(db: Db, contactId: string) {
  const c = await db.from('organiser_contacts').select('organiser_id').eq('id', contactId).single()
  if (c.error) throw new Error(`the contact could not be read: ${c.error.message}`)
  const o = await db.from('organisers').select('id, name, organisation_id, website_url, is_test').eq('id', c.data.organiser_id as string).single()
  if (o.error) throw new Error(`the organiser could not be read: ${o.error.message}`)
  const id = o.data.id as string
  const isTest = o.data.is_test === true
  // THE PLATFORM IS NO HOST (src/lib/growth/platform-organiser.ts, the one rule; the guard growth-reads-skip-the-platform):
  // nothing a contact of the platform's own listings organisation sends is kept as an organiser's file or logged as an
  // organiser's yes. The rule's set also holds every test organiser; those stay by their own is_test, as the photo page
  // keeps them, so the acceptance tests' own night is read (their-nights.ts).
  const platform = !isTest && (await readPlatformOrganiserIds(db)).has(id)
  return { id, name: o.data.name as string, organisation_id: (o.data.organisation_id as string | null) ?? null, website_url: (o.data.website_url as string | null) ?? null, isTest, platform }
}

const PLATFORM_IS_NO_HOST = "the sender is a contact of the platform's own listings organisation, which is no host"

/** The grant that covers this night, by the database's own rule (organiser_permission_for), or null. */
async function grantFor(db: Db, eventId: string): Promise<string | null> {
  const r = await db.rpc('organiser_permission_for', { p_event: eventId })
  if (r.error) throw new Error(`the grant for that night could not be read: ${r.error.message}`)
  const row = (Array.isArray(r.data) ? r.data[0] : r.data) as { id?: string | null } | null
  return row?.id ?? null
}

/** The day it came, in Melbourne, as the register keeps it. */
function dayOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date(iso))
}

export type IntakeAnswer =
  | { readonly state: 'kept'; readonly night: string | null; readonly kept: number; readonly already: number; readonly refused: readonly string[] }
  | { readonly state: 'not taken'; readonly why: string }

/** Their emailed images, stored and registered as candidates for the night the thread is about (above). */
export async function keepEmailedImages(
  db: Db,
  input: { readonly contactId: string; readonly touch: ThreadTouch; readonly message: EmailedMessage; readonly now: Date; readonly by: string },
  deps: { readonly files: () => Promise<readonly EmailedFile[]>; readonly media: MediaDeps },
): Promise<IntakeAnswer> {
  const org = await organiserOf(db, input.contactId)
  if (org.platform) return { state: 'not taken', why: PLATFORM_IS_NO_HOST }
  const nights = await readTheirNights(db, org, input.now, 20)
  const night = nightOfThread(input.touch, nights)

  const grant = night ? await grantFor(db, night.eventId) : null
  let granted = grant !== null
  if (!granted && !night) {
    for (const n of nights) {
      if (await grantFor(db, n.eventId)) {
        granted = true
        break
      }
    }
  }
  if (!granted) {
    const theirs = await db.from('organiser_contacts').select('id').eq('organiser_id', org.id).limit(50)
    if (theirs.error) throw new Error(`their contacts could not be read: ${theirs.error.message}`)
    const ids = (theirs.data ?? []).map((c) => c.id as string)
    const asked = ids.length
      ? await db.from('outreach_touches').select('id').in('contact_id', ids).in('comms_subtype', PHOTO_REQUEST_SUBTYPES).eq('state', 'sent').limit(1)
      : { data: [], error: null }
    if (asked.error) throw new Error(`our photo requests to them could not be read: ${asked.error.message}`)
    if ((asked.data ?? []).length === 0) return { state: 'not taken', why: 'no grant of theirs and no photo request of ours is open, so their attachments stay in the mailbox for the Communications centre' }
  }

  const files = await deps.files()
  const refused: string[] = []
  let kept = 0
  let already = 0
  for (const f of files) {
    // The file as supplied, by its SHA-256 (the photo page's fingerprint computes the same): never registered twice.
    const sha256 = createHash('sha256').update(Buffer.from(f.bytes)).digest('hex')
    const seen = await db.from('social_assets').select('id').eq('content_sha256', sha256).limit(1)
    if (seen.error) throw new Error(`the register could not be read: ${seen.error.message}`)
    if ((seen.data ?? []).length > 0) {
      already += 1
      continue
    }
    const stored = await storeImage(`emailed/${night?.eventId ?? 'to-review'}`, new File([f.bytes], f.name, { type: f.contentType }), night?.eventId ?? null, deps.media)
    if ('refused' in stored) {
      refused.push(`${f.name}: ${stored.refused}`)
      continue
    }
    const assetType = emailedAssetType(f.name, input.message.ownWords)
    const done = await addAsset(db, {
      assetState: night && grant ? 'organiser_authorised' : 'native_share',
      assetType,
      assetUrl: stored.url,
      sourceUrl: `mailto:${input.message.fromAddress}`,
      rightsHolder: org.name,
      // The register's trigger writes the grant's evidence and permitted uses (social_asset_takes_the_yes).
      permissionEvidence: null,
      evidenceFile: `email ${input.message.internetMessageId} from ${input.message.fromAddress}, received ${input.message.receivedAt}, attachment "${f.name}"`,
      eventSlug: night?.slug ?? null,
      attributionText: org.name,
      scope: 'both',
      archival: false,
      expiresAt: null,
      restrictions: restrictionFor(assetType),
      originalFile: stored.path,
      receivedOn: dayOf(input.message.receivedAt),
      permittedUses: null,
      focal: null,
      sourceWidth: stored.width ?? null,
      sourceHeight: stored.height ?? null,
      leadRank: null,
      contentSha256: stored.hashes.sha256,
      byteSize: stored.byteSize,
      fileFormat: stored.format,
      by: input.by,
    })
    if (done.state === 'refused') {
      await deps.media.remove([stored.path])
      refused.push(`${f.name}: ${done.reason}`)
      continue
    }
    kept += 1
  }
  return { state: 'kept', night: night?.title ?? null, kept, already, refused }
}
