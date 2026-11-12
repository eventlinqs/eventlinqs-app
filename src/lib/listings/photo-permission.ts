import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { proofMatches } from '@/lib/outreach/photo-link'
import { readTheirNights } from '@/lib/outreach/their-nights'
import { founderAccount } from '@/lib/outreach/twenty-drafts'
import { addAsset } from '@/lib/social/store'
import { CANONICAL_HOST } from '@/lib/site-url'
import { storeImage, type MediaDeps } from './organiser-media'
import { grantWording, permittedUsesWords, type PhotoUses } from './photo-permission-math'

/**
 * AN ORGANISER'S PHOTOS, GIVEN THROUGH THEIR SECURE LINK (Lawal, 12 November 2026, 12:01, item 2; the Growth OS order's
 * Release 2, item 6: "Media permissions: a request in his format with the organiser's secure link to upload photos and
 * choose the uses; each grant stored with asset, rights holder, source, permitted uses, restrictions, expiry and evidence;
 * listing permission kept separate from image permission").
 *
 * The page /photos/<contact>/<proof> (src/lib/outreach/photo-link.ts) shows the organiser their own public nights. They
 * choose one night, add up to five photos or artwork, choose where EventLinqs may use them (that night's page and cards,
 * EventLinqs' social posts about it, or both), and say they took them or may share them. Then, in this order:
 *   1. their yes is logged for THAT night through the database's one way of logging a yes (social_log_organiser_yes,
 *      20261028153001): their own words as the page put them, the date, channel 'website', scope this event. Only ever
 *      this event: a yes for future nights is keyed to the night's host, and an organiser who hires a public venue would
 *      otherwise grant every other organiser's nights there;
 *   2. each image is re-encoded and stored by the organiser media pipeline (organiser-media.ts storeImage: magic bytes,
 *      orientation and metadata stripped, never a photo already locked to another night);
 *   3. each is entered in the asset register through its one writer (social/store.ts addAsset) as organiser authorised,
 *      PENDING: it carries the yes (the register's trigger takes it), the uses chosen and the day it came, and nothing
 *      carries it until Lawal approves it under Images and their rights. A refusal removes the stored file.
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
  | { readonly state: 'found'; readonly contactId: string; readonly organiserName: string; readonly greeting: string; readonly nights: readonly PhotoNight[] }
  | { readonly state: 'not found' }

/** The contact's page, only when the proof is theirs; their own public nights ahead, soonest first. */
export async function readPhotoPage(db: Db, contactId: string, proof: string, now: Date): Promise<PhotoPage> {
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) return { state: 'not found' }
  const c = await db.from('organiser_contacts').select('id, organiser_id, person_name, unsubscribe_token, organisers(id, name, organisation_id, website_url)').eq('id', contactId).maybeSingle()
  if (c.error || !c.data || !proofMatches(proof, c.data.unsubscribe_token as string | null)) return { state: 'not found' }
  const org = c.data.organisers as unknown as { id: string; name: string; organisation_id: string | null; website_url: string | null } | null
  if (!org) return { state: 'not found' }
  const nights = (await readTheirNights(db, { id: org.id, organisation_id: org.organisation_id, website_url: org.website_url }, now, 12)).map((n) => ({
    eventId: n.eventId,
    slug: n.slug,
    title: n.title,
    startDate: n.startDate,
    timezone: n.timezone,
    venueName: n.venueName,
  }))
  const first = ((c.data.person_name as string | null) ?? '').trim().split(/\s+/)[0] ?? ''
  return { state: 'found', contactId, organiserName: org.name, greeting: first || `${org.name} team`, nights }
}

export type GiveAnswer =
  | { readonly state: 'done'; readonly added: number; readonly refused: readonly string[] }
  | { readonly state: 'refused'; readonly reason: string }

/** Records the yes for the chosen night, then stores and registers each image, pending Lawal's approval. */
export async function givePhotos(
  db: Db,
  input: {
    readonly page: Extract<PhotoPage, { state: 'found' }>
    readonly eventId: string
    readonly files: readonly File[]
    readonly uses: PhotoUses
    readonly givenBy: string
    readonly now: Date
  },
  deps: MediaDeps,
): Promise<GiveAnswer> {
  const night = input.page.nights.find((n) => n.eventId === input.eventId)
  if (!night) return { state: 'refused', reason: 'Choose one of your nights.' }
  if (!night.venueName) return { state: 'refused', reason: 'That night has no venue on its listing yet, so a photo cannot be kept for it. Reply to Lawal and he will set it up.' }
  const files = input.files.filter((f) => f instanceof File && f.size > 0)
  if (files.length === 0) return { state: 'refused', reason: 'Choose at least one photo or artwork.' }
  if (files.length > MAX_PHOTOS) return { state: 'refused', reason: `Choose up to ${MAX_PHOTOS} at a time.` }
  const founder = await founderAccount(db)
  if (founder.id === null) return { state: 'refused', reason: 'Your photos could not be kept just now. Try again in a minute.' }

  const yes = await db.rpc('social_log_organiser_yes', {
    p_host: night.venueName,
    p_granted_at: input.now.toISOString(),
    p_wording: grantWording({ givenBy: input.givenBy, organiserName: input.page.organiserName, nightTitle: night.title, uses: input.uses, count: files.length }),
    p_scope: 'this_event',
    p_channel: 'website',
    p_event: night.eventId,
    p_logged_by: founder.id,
  })
  if (yes.error) {
    const words = /refused:\s*(.+)$/s.exec(yes.error.message)?.[1]?.trim()
    return { state: 'refused', reason: words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Your permission could not be kept just now. Try again in a minute.' }
  }

  const receivedOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(input.now)
  const refused: string[] = []
  let added = 0
  for (const file of files) {
    const stored = await storeImage(`photos/${night.eventId}`, file, night.eventId, deps)
    if ('refused' in stored) {
      refused.push(`${file.name || 'An image'}: ${stored.refused}`)
      continue
    }
    const done = await addAsset(db, {
      assetState: 'organiser_authorised',
      assetType: 'photo',
      assetUrl: stored.url,
      sourceUrl: `${ORIGIN}/photos`,
      rightsHolder: input.page.organiserName,
      permissionEvidence: null,
      evidenceFile: null,
      eventSlug: night.slug,
      attributionText: input.page.organiserName,
      scope: input.uses,
      archival: false,
      expiresAt: null,
      restrictions: null,
      originalFile: stored.path,
      receivedOn,
      permittedUses: permittedUsesWords(input.uses),
      focal: null,
      sourceWidth: null,
      sourceHeight: null,
      leadRank: null,
      by: founder.id,
    })
    if (done.state === 'refused') {
      await deps.remove([stored.path])
      refused.push(`${file.name || 'An image'}: ${done.reason}`)
      continue
    }
    added += 1
  }
  return { state: 'done', added, refused }
}
