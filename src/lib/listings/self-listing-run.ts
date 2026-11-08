import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { founderDestination } from '@/lib/env/destinations'
import { getSiteUrl } from '@/lib/site-url'
import { venueSlugify } from '@/lib/venues/venue-slug'
import { composeGeocodeQuery, geocodeAddress, serverGeocodingAvailable } from '@/lib/geo/geocode'
import { lineProblems } from '@/lib/events/eventlinqs-listing-words'
import { classify } from '@/lib/categories/classify'
import { photoHashes } from '@/lib/images/photo-hash'
import { lockPhotoToEvent, photoLockedElsewhere } from '@/lib/images/photo-lock'
import { runOccurrences, type OccurrenceStore } from './occurrence-run'
import { occurrenceStore } from './occurrence-store'
import { LISTINGS_ORG_SLUG } from './collect-store'
import { readBookingPage } from './booking-page'
import { SUBMISSION_BUCKET } from './submission-store'
import { AUTHORITY_WORDS, PHOTO_OWNED_WORDS, SUBMISSION_ROLE_WORDS, type SubmissionRole } from './submission'
import { judgeSelfListing, localParts, type Correction, type PublishFacts, type SelfListingVerdict } from './self-listing'
import { addSelfListedPhoto } from '@/lib/social/store'
import { deleteEventEverywhere } from '@/lib/events/delete-event-core'
import { mayStayPublished, ORGANISER_PHOTO_LAW, organiserCoverObject, photoStillOwed, type PhotoAttach } from './organiser-photo-rule'

/**
 * ORGANISER SELF-LISTING, THE RUN (Lawal's rulings of 8 November 2026, 07:01 (3) and 07:05 (2); the submission alert of
 * 06:42). One submission, once: it is claimed (so two runs never take it twice), its organiser's own booking page is read
 * politely, the checks decide (src/lib/listings/self-listing.ts), and then either
 *   PUBLISHED: its venue (found or made), its one-off night (event_series) and its listing check (basis
 *     organiser_submission) are written, the listings run makes its dated event at once for that night alone, and the
 *     organiser's own photo becomes the event's cover through the photo lock with its credit on record (a register row in
 *     social_assets, scope 'site': the listing only; a social post still waits for Lawal in /admin/social). Lawal is told
 *     after it is live, with its one link.
 *   HELD: the reason is kept on the row in plain words, the window deals with it, and Lawal gets a one line note.
 * It runs inside the form's own action the moment the organiser presses send, so they see their live link at once, and
 * the hourly listings run takes any still waiting as its backstop, so a submission never waits for a person.
 */

type Admin = ReturnType<typeof createAdminClient>

type SubmissionRecord = {
  id: string
  created_at: string
  name: string
  role: SubmissionRole
  title: string
  starts_at: string
  ends_at: string | null
  venue_name: string
  venue_address: string
  city_slug: string
  category_slug: string | null
  booking_url: string
  entry: 'free' | 'free_registration' | 'paid'
  price_from_cents: number | null
  description: string | null
  photo_path: string | null
  permission_words: string
  permission_given_at: string
}

export type SelfListingOutcome =
  | { readonly state: 'published'; readonly eventId: string; readonly slug: string; readonly corrections: readonly Correction[] }
  | { readonly state: 'held'; readonly reason: string }
  | { readonly state: 'skipped'; readonly reason: string }

const STALE_CLAIM_MS = 10 * 60_000

/** Who takes a night away when its organiser's photo could not go on: the self-listing run, recorded in the audit. */
const RUN_ACTOR = { id: null, email: null, role: 'self-listing-run' } as const

/** A title as the listing shows it: no leading '#' or other marks, one space at a time. Pure. */
export function cleanTitle(t: string): string {
  return t.replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim()
}

/** The night's one-line summary in our own words: the organiser's first sentences that pass the listing rules. Pure. */
export function summaryFrom(description: string | null, title: string, venue: string): string {
  const sentences = (description ?? '')
    .replace(/\r/g, '')
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && !/https?:\/\/|www\.|[\u2013\u2014]| - |[\u2022#*]|[\u{1F300}-\u{1FAFF}]/u.test(s) && !/[A-Z]{6,}/.test(s) && lineProblems(s).length === 0)
  let out = ''
  for (const s of sentences) {
    if ((out + ' ' + s).trim().length > 280) break
    out = (out + ' ' + s).trim()
  }
  return out || `${title} at ${venue}.`
}

function priceWords(entry: string, cents: number | null): string {
  if (entry === 'free') return 'Free'
  if (entry === 'free_registration') return 'Free, registration required'
  return cents === null ? 'Paid (no price given)' : `From A$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`
}

async function founderAdminId(admin: Admin): Promise<string | null> {
  const { data } = await admin.from('admin_users').select('id').eq('role', 'super_admin').is('disabled_at', null).order('created_at').limit(1).maybeSingle()
  // The founder: the one super admin (production holds exactly one, read 8 November 2026). The register row records
  // that the self-listing checks approved it under his standing ruling, never that he looked.
  return (data?.id as string | undefined) ?? null
}

/** The venue EventLinqs holds by that name in that city (the collector's rule, src/lib/listings/collect-store.ts), else
 * made from the night's own address, placed on the map when the server geocoder is set, with a slug that names its city
 * when another venue already holds the plain one. */
async function findOrMakeVenue(admin: Admin, orgId: string, facts: PublishFacts, city: { slug: string; name: string; state: string }): Promise<string> {
  const { data: held, error: heldError } = await admin
    .from('venues')
    .select('id, removed_at')
    .eq('city_slug', city.slug)
    .ilike('name', facts.venueName.replace(/[%_]/g, ''))
  if (heldError) throw new Error(`the venues could not be read: ${heldError.message}`)
  const found = (held ?? []).find((v) => !v.removed_at)
  if (found?.id) return found.id as string
  let latitude: number | null = null
  let longitude: number | null = null
  if (serverGeocodingAvailable().available) {
    const hit = await geocodeAddress(composeGeocodeQuery({ venueName: facts.venueName, address: facts.venueAddress, city: city.name, state: city.state, country: 'Australia' }), {
      key: process.env.GOOGLE_MAPS_API_KEY ?? '',
    }).catch(() => null)
    if (hit?.ok) {
      latitude = Math.round(hit.hit.latitude * 1e7) / 1e7
      longitude = Math.round(hit.hit.longitude * 1e7) / 1e7
    }
  }
  const row = {
    organisation_id: orgId,
    name: facts.venueName,
    address: facts.venueAddress,
    city: city.name,
    city_slug: city.slug,
    state: city.state,
    country: 'Australia',
    listing_source: 'eventlinqs',
    is_active: true,
    latitude,
    longitude,
  }
  for (const slug of [venueSlugify(facts.venueName), venueSlugify(`${facts.venueName} ${city.slug}`)]) {
    const { data, error } = await admin.from('venues').insert({ ...row, slug }).select('id').single()
    if (!error && data) return data.id as string
    if (error?.code !== '23505') throw new Error(`the venue could not be written: ${error?.message ?? 'no row'}`)
  }
  throw new Error(`the venue could not be written: its name is taken in ${city.name} and beyond`)
}

/** The listings run for one night only, so the event exists the moment it is published. */
function oneNight(seriesId: string): OccurrenceStore {
  const base = occurrenceStore()
  return { ...base, nights: async (now: Date) => (await base.nights(now)).filter((n) => n.id === seriesId) }
}

/** Puts the organiser's own photo on its event: stored whole, its rights record, its lock, the cover. The answer says
 * whether it is on (organiser-photo-rule.ts), and in words why not. */
async function attachPhoto(admin: Admin, sub: SubmissionRecord, eventId: string, rightsHolder: string): Promise<PhotoAttach> {
  if (!sub.photo_path) return { attached: false, words: 'none sent' }
  const not = (words: string): PhotoAttach => ({ attached: false, words })
  const file = await admin.storage.from(SUBMISSION_BUCKET).download(sub.photo_path)
  if (file.error || !file.data) return not('sent, but it could not be read')
  const bytes = Buffer.from(await file.data.arrayBuffer())
  const hashes = await photoHashes(bytes)
  const lockRpc = { rpc: (name: string, args: Record<string, unknown>) => (admin.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { code: string; message: string } | null }>)(name, args) }
  if (await photoLockedElsewhere(hashes, eventId, lockRpc)) return not('sent, but it is already used for another event')
  const ext = sub.photo_path.split('.').pop() ?? 'jpg'
  const object = organiserCoverObject(sub.id, ext)
  const contentType = ext === 'webp' ? 'image/webp' : ext === 'avif' ? 'image/avif' : 'image/jpeg'
  const up = await admin.storage.from('event-images').upload(object, bytes, { upsert: true, contentType })
  if (up.error) return not('sent, but it could not be stored')
  const url = admin.storage.from('event-images').getPublicUrl(object).data.publicUrl
  const approver = await founderAdminId(admin)
  if (!approver) return not('sent, but no founder account approves it')
  const asset = await addSelfListedPhoto(admin, {
    eventId,
    assetUrl: url,
    sourceUrl: sub.booking_url,
    rightsHolder,
    permissionEvidence: `"${sub.permission_words}" given by ${sub.name} (${SUBMISSION_ROLE_WORDS[sub.role]}) at ${sub.permission_given_at}, with "${PHOTO_OWNED_WORDS}" and "${AUTHORITY_WORDS}" ticked on the form; listing submission ${sub.id}.`,
    originalFile: sub.photo_path,
    receivedOn: sub.created_at.slice(0, 10),
    permittedUses: "This event's own EventLinqs page and its event cards. A social post waits for Lawal's approval in /admin/social.",
    restrictions: "Approved for the listing by the self-listing checks under Lawal's ruling of 8 November 2026, 07:01.",
    approvedBy: approver,
    now: new Date(),
  })
  if (asset.state === 'refused') return not(`sent, but its rights record could not be written (${asset.reason})`)
  const locked = await lockPhotoToEvent({ eventId, hashes, imageUrl: url, role: 'cover' }, lockRpc)
  if (!locked.ok) return not('sent, but it is already used for another event')
  const cover = await admin.from('events').update({ cover_image_url: url }).eq('id', eventId)
  if (cover.error) return not(`sent, but it could not be set as the cover (${cover.error.message})`)
  return { attached: true, words: `yes, the organiser's own, credited "Photo: ${rightsHolder}"` }
}

async function tellLawal(subject: string, text: string): Promise<boolean> {
  try {
    await sendEmail({ to: founderDestination(), subject, text, html: `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`, messageType: 'organiser_submission_alert', recipientRole: 'platform_owner' })
    return true
  } catch (err) {
    console.error('[self-listing] Lawal could not be told:', err instanceof Error ? err.message : String(err))
    return false
  }
}

export async function selfListSubmission(id: string, now: Date = new Date()): Promise<SelfListingOutcome> {
  const admin = createAdminClient()
  // Claimed once: the row is taken only while it still waits, unchecked or claimed by a run that ended without deciding
  // more than ten minutes ago (so a run that died never strands it).
  const stale = new Date(now.getTime() - STALE_CLAIM_MS).toISOString()
  const claim = await admin
    .from('listing_submissions')
    .update({ checked_at: now.toISOString() })
    .eq('id', id)
    .eq('status', 'waiting')
    .or(`checked_at.is.null,checked_at.lt.${stale}`)
    .select('id, created_at, name, role, title, starts_at, ends_at, venue_name, venue_address, city_slug, category_slug, booking_url, entry, price_from_cents, description, photo_path, permission_words, permission_given_at')
  if (claim.error) return { state: 'skipped', reason: `the submission could not be claimed: ${claim.error.message}` }
  const sub = (claim.data ?? [])[0] as SubmissionRecord | undefined
  if (!sub) return { state: 'skipped', reason: 'already taken or no longer waiting' }

  const { data: city } = await admin.from('cities').select('slug, name, state, timezone').eq('slug', sub.city_slug).maybeSingle()
  const tz = (city?.timezone as string | undefined) ?? 'Australia/Melbourne'
  const title = cleanTitle(sub.title)
  const reading = await readBookingPage(sub.booking_url)
  const from = new Date(new Date(sub.starts_at).getTime() - 86_400_000).toISOString()
  const to = new Date(new Date(sub.starts_at).getTime() + 2 * 86_400_000).toISOString()
  const { data: listed } = await admin.from('events').select('title, start_date').eq('status', 'published').gte('start_date', from).lte('start_date', to).limit(2000)

  let verdict: SelfListingVerdict = judgeSelfListing(
    { title, startsAt: sub.starts_at, endsAt: sub.ends_at, venueName: sub.venue_name, venueAddress: sub.venue_address, timezone: tz, entry: sub.entry, priceFromCents: sub.price_from_cents, description: sub.description, bookingUrl: sub.booking_url },
    reading,
    (listed ?? []).map((l) => ({ title: l.title as string, startsAt: l.start_date as string })),
    now,
  )
  if (verdict.verdict === 'publish' && title.length > 80) verdict = { verdict: 'hold', reason: 'Its name is longer than the 80 characters a listing takes.' }
  if (verdict.verdict === 'publish' && !city) verdict = { verdict: 'hold', reason: 'Its city is not one EventLinqs knows.' }
  const checkResult = { read: reading.ok ? 'read' : reading.reason, verdict: verdict.verdict, matched_by: verdict.verdict === 'publish' ? verdict.matchedBy : null }

  if (verdict.verdict === 'hold') {
    await admin.from('listing_submissions').update({ status: 'held', held_because: verdict.reason.slice(0, 300), reviewed_at: now.toISOString(), check_result: checkResult }).eq('id', sub.id)
    const told = await tellLawal(`Organiser event held: ${title}`, `${title}, sent by ${sub.name}, is held: ${verdict.reason} The window deals with it.`)
    if (told) await admin.from('listing_submissions').update({ alerted_at: new Date().toISOString() }).eq('id', sub.id)
    return { state: 'held', reason: verdict.reason }
  }

  const facts = verdict.facts
  const { data: org } = await admin.from('organisations').select('id').eq('slug', LISTINGS_ORG_SLUG).maybeSingle()
  // The organiser's own choice (the guide classifier's first rule); a row sent before the form asked is classified by
  // the guide's written word rules from its title, and community when none match.
  const categorySlug = sub.category_slug ?? classify({ title }).primary ?? 'community'
  const { data: cat } = await admin.from('event_categories').select('id').eq('slug', categorySlug).maybeSingle()
  const categoryId = cat?.id as string | undefined
  if (!org?.id || !categoryId || !city) {
    const reason = 'The listing could not be written: the listings organisation or the category is missing.'
    await admin.from('listing_submissions').update({ status: 'held', held_because: reason, reviewed_at: now.toISOString(), check_result: checkResult }).eq('id', sub.id)
    return { state: 'held', reason }
  }

  const venueId = await findOrMakeVenue(admin, org.id as string, facts, { slug: city.slug as string, name: city.name as string, state: city.state as string })
  const start = localParts(facts.startsAt, tz)
  const end = facts.endsAt ? localParts(facts.endsAt, tz) : null
  const today = localParts(now.toISOString(), tz).date
  const kind = facts.entry === 'free' ? null : facts.entry === 'paid' ? 'tickets' : 'free_register'
  const links = kind ? [{ url: sub.booking_url, kind, price_from_cents: facts.entry === 'paid' ? facts.priceFromCents : null, price_checked_on: today }] : []
  const series = await admin
    .from('event_series')
    .insert({
      organisation_id: org.id,
      venue_id: venueId,
      name: title,
      category_id: categoryId,
      rule: 'once',
      anchor_date: start.date,
      day: new Date(`${start.date}T00:00:00Z`).getUTCDay(),
      starts_at: `${start.time}:00`,
      ends_at: end && end.date === start.date ? `${end.time}:00` : null,
      timezone: tz,
      age_restriction_min: null,
      summary: summaryFrom(sub.description, title, facts.venueName),
      donation_optional: false,
      instagram_post_url: null,
      skip_dates: [],
      booking_links: links,
      // EventLinqs lists it for them, in the listings organisation, until the organiser claims it (the claim flow then
      // makes it their own, listing_source 'organiser'), the same as an imported night.
      listing_source: 'eventlinqs',
      status: 'active',
      last_checked_on: today,
    })
    .select('id')
    .single()
  if (series.error) throw new Error(`the night could not be written: ${series.error.message}`)
  const seriesId = series.data.id as string
  await admin.from('listing_checks').insert({ series_id: seriesId, checked_at: now.toISOString(), source_url: sub.booking_url, source_date: today, import_file: `self-listing ${sub.id}`, outcome: 'confirmed', reuse_basis: 'organiser_submission' })

  await runOccurrences(oneNight(seriesId), now)
  const { data: made } = await admin.from('events').select('id, slug').eq('listing_series_id', seriesId).order('start_date').limit(1).maybeSingle()
  if (!made?.id) {
    const reason = 'The night was written, but its event page was not made by the listings run; the window looks at it.'
    await admin.from('listing_submissions').update({ status: 'held', held_because: reason, reviewed_at: now.toISOString(), published_series_id: seriesId, check_result: checkResult }).eq('id', sub.id)
    return { state: 'held', reason }
  }

  const rightsHolder = (facts.host ?? sub.name).slice(0, 200)
  const photo = await attachPhoto(admin, sub, made.id as string, rightsHolder.length >= 2 ? rightsHolder : sub.name)
  // LAWAL'S LAW OF 8 NOVEMBER 2026, 13:32 (organiser-photo-rule.ts): a night whose organiser sent a photo is never left up
  // without it. The series is paused so the hourly run does not make it again, the night is taken away, the submission
  // is held with the reason, and Lawal is told; the window puts the photo on and lists it again.
  if (!mayStayPublished(sub, photo)) {
    await admin.from('event_series').update({ status: 'paused' }).eq('id', seriesId)
    const gone = await deleteEventEverywhere({ eventId: made.id as string, actor: RUN_ACTOR, deleteWith: admin, revalidateFrom: 'route-handler' })
    const reason = `Its photo could not be put on its page (${photo.words}), and ${ORGANISER_PHOTO_LAW}.${gone.ok ? '' : ` The night could not be taken away either: ${gone.message}`}`
    await admin
      .from('listing_submissions')
      .update({ status: 'held', held_because: reason.slice(0, 300), reviewed_at: now.toISOString(), published_series_id: seriesId, check_result: { ...checkResult, photo: photo.words, photo_attached: false } })
      .eq('id', sub.id)
    const told = await tellLawal(`Organiser event held: ${title}`, `${title}, sent by ${sub.name}, is held: ${reason} The window deals with it.`)
    if (told) await admin.from('listing_submissions').update({ alerted_at: new Date().toISOString() }).eq('id', sub.id)
    return { state: 'held', reason }
  }
  await admin
    .from('listing_submissions')
    .update({ status: 'published', reviewed_at: now.toISOString(), published_series_id: seriesId, published_event_id: made.id, corrections: verdict.corrections, check_result: { ...checkResult, photo: photo.words, photo_attached: photo.attached } })
    .eq('id', sub.id)

  const link = `${getSiteUrl()}/events/${made.slug as string}`
  const when = `${new Date(facts.startsAt).toLocaleString('en-AU', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}`
  const corrected = verdict.corrections.length ? verdict.corrections.map((c) => `${c.field} (${c.submitted ?? 'none'} became ${c.page ?? 'none'})`).join('; ') : 'nothing'
  const told = await tellLawal(
    `New organiser event live on EventLinqs: ${title}`,
    `${title} is live on EventLinqs. It passed the self-listing checks against the organiser's own booking page.\n\n` +
      `When: ${when}\nWhere: ${facts.venueName}, ${city.name as string}\nOrganiser: ${sub.name} (${SUBMISSION_ROLE_WORDS[sub.role]})\n` +
      `Price: ${priceWords(facts.entry, facts.priceFromCents)}\nPhoto: ${photo.words}\nCorrected from their booking page: ${corrected}\n\nSee it: ${link}`,
  )
  if (told) await admin.from('listing_submissions').update({ alerted_at: new Date().toISOString() }).eq('id', sub.id)
  return { state: 'published', eventId: made.id as string, slug: made.slug as string, corrections: verdict.corrections }
}

/** The backstop: any submission still waiting five minutes after it was sent (its own check never ran or never
 * finished), a few at a time, oldest first. */
export async function selfListWaiting(now: Date = new Date(), most = 5): Promise<SelfListingOutcome[]> {
  const admin = createAdminClient()
  const stale = new Date(now.getTime() - STALE_CLAIM_MS).toISOString()
  const { data } = await admin
    .from('listing_submissions')
    .select('id')
    .eq('status', 'waiting')
    .or(`checked_at.is.null,checked_at.lt.${stale}`)
    .lte('created_at', new Date(now.getTime() - 5 * 60_000).toISOString())
    .order('created_at')
    .limit(most)
  const out: SelfListingOutcome[] = []
  for (const r of data ?? []) {
    try {
      out.push(await selfListSubmission(r.id as string, now))
    } catch (err) {
      out.push({ state: 'skipped', reason: err instanceof Error ? err.message : String(err) })
    }
  }
  return out
}

/**
 * EVERY ACCEPTED SUBMISSION'S OWN PHOTO GOES ON ITS EVENT (Lawal's law of 8 November 2026, 13:32 (1): "an event whose
 * organiser supplied a photo NEVER goes up without that photo ... used as they supplied it"; it withdrew the PM's 06:52
 * ruling that held Kyivska Perepichka's screenshot back, so no row waits for a mark any more). A submission accepted by
 * hand is listed by the checked import, which carries no photo; any such row that names the event it became
 * (published_event_id) has its own photo put on that event here, through the same path a self-listed photo takes: the
 * photo lock, its rights record named to the founder, its credit. It is tried each hour until check_result.photo_attached
 * says it is on (organiser-photo-rule.ts, photoStillOwed); scripts/guards/organiser-photo-before-publish.mjs fails the
 * build meanwhile.
 */
export async function attachApprovedPhotos(most = 5): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('listing_submissions')
    .select('id, created_at, name, role, title, starts_at, ends_at, venue_name, venue_address, city_slug, category_slug, booking_url, entry, price_from_cents, description, photo_path, permission_words, permission_given_at, published_event_id, check_result')
    .eq('status', 'accepted')
    .not('photo_path', 'is', null)
    .not('published_event_id', 'is', null)
    .limit(50)
  const out: string[] = []
  for (const r of (data ?? []) as (SubmissionRecord & { published_event_id: string; check_result: Record<string, unknown> | null })[]) {
    if (out.length >= most) break
    const result = r.check_result ?? {}
    if (!photoStillOwed(r, result)) continue
    // The credit a reviewed write names (the rights holder, e.g. the organiser's business), else the sender's name.
    const credit = typeof result.credit === 'string' && result.credit.trim().length >= 2 ? result.credit.trim() : r.name
    const photo = await attachPhoto(admin, r, r.published_event_id, credit.slice(0, 200))
    await admin.from('listing_submissions').update({ check_result: { ...result, photo: photo.words, photo_attached: photo.attached } }).eq('id', r.id)
    out.push(`${cleanTitle(r.title)}: ${photo.words}`)
  }
  return out
}
