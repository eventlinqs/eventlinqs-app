import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
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
import { AUTHORITY_WORDS, PHOTO_OWNED_WORDS, scopeFromPermission, SUBMISSION_ROLE_WORDS, type SubmissionRole } from './submission'
import { judgeSelfListing, localParts, type Correction, type PublishFacts, type SelfListingVerdict } from './self-listing'
import { addSelfListedPhoto } from '@/lib/social/store'
import { deleteEventEverywhere } from '@/lib/events/delete-event-core'
import { revalidateEventSurfacesFromRouteHandlerById } from '@/lib/events/revalidate-event'
import { hasRealCover } from '@/lib/events/publish-gate'
import { priceWords, whenWords } from './submission-watch-rule'
import { sendOrganiserLiveNotice } from './organiser-live-notice'
import { mayStayPublished, ORGANISER_PHOTO_LAW, organiserCoverObject, photoStillOwed, type PhotoAttach } from './organiser-photo-rule'
import { creditLine } from '@/lib/media/photo-credits'
import { READ_TRIES, readAgain } from './read-retry'

/**
 * ORGANISER SELF-LISTING, THE RUN (Lawal's rulings of 8 November 2026, 07:01 (3) and 07:05 (2); the submission alert of
 * 06:42). One submission, once: it is claimed (so two runs never take it twice), its organiser's own booking page is read
 * politely, the checks decide (src/lib/listings/self-listing.ts), and then either
 *   PUBLISHED: its venue (found or made), its one-off night (event_series) and its listing check (basis
 *     organiser_submission) are written, the listings run makes its dated event at once for that night alone, and the
 *     organiser's own photo becomes the event's cover through the photo lock with its credit on record (a register row in
 *     social_assets, scope 'site': the listing only; a social post still waits for Lawal in /admin/social). The organiser
 *     is emailed that it is live (organiser-live-notice.ts); the run logs what it did.
 *   HELD: the reason is kept on the row in plain words and the window deals with it. Nothing in this path is sent to
 *     Lawal (his ruling of 8 November 2026, 15:48 (2)): what is not live is counted in the daily state email and shown on
 *     /admin/today.
 * It runs inside the form's own action the moment the organiser presses send, so they see their live link at once, and
 * the hourly listings run takes any still waiting as its backstop, so a submission never waits for a person.
 */

type Admin = ReturnType<typeof createAdminClient>

type SubmissionRecord = {
  id: string
  created_at: string
  name: string
  email: string
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
/**
 * The series' end from the organiser's stated times (16 November 2026, H2o New Year's Eve: Joe stated 8 pm to 2:30 am and
 * the run kept an end only on the start's own date, so his 2:30 am was dropped and the page showed none). An end after the
 * start and less than a day on is the night's end, as a local time; the occurrence builder reads one at or before the start
 * as the next morning (./occurrences.ts). Anything else is not a night's end and stays unstated.
 */
export function seriesEndOf(startsAt: string, endsAt: string | null, tz: string): string | null {
  if (!endsAt) return null
  const ms = Date.parse(endsAt) - Date.parse(startsAt)
  if (!(ms > 0) || ms >= 24 * 3_600_000) return null
  return `${localParts(endsAt, tz).time}:00`
}

/**
 * The words an organiser's photograph carries when the run sets it as the cover (16 November 2026: H2o's went up at 16:11
 * with none, and acceptance-live read it). The run cannot look at a photograph, so these say only whose it is and for
 * which night, never what it shows; a person's looked at words replace them, and a cover that has words keeps them.
 */
export function organiserPhotoAlt(title: string, venue: string): string {
  return `The organiser's photograph for ${cleanTitle(title)} at ${venue.trim()}`
}

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
    permittedUses:
      scopeFromPermission(sub.permission_words) === 'both'
        ? "This event's own EventLinqs page, its event cards, and EventLinqs social posts about it, as its organiser's words grant. Each post is approved as a piece before it goes."
        : "This event's own EventLinqs page and its event cards. A social post waits for Lawal's approval in /admin/social.",
    scope: scopeFromPermission(sub.permission_words),
    restrictions: "Approved for the listing by the self-listing checks under Lawal's ruling of 8 November 2026, 07:01.",
    approvedBy: approver,
    now: new Date(),
  })
  if (asset.state === 'refused') return not(`sent, but its rights record could not be written (${asset.reason})`)
  const locked = await lockPhotoToEvent({ eventId, hashes, imageUrl: url, role: 'cover' }, lockRpc)
  if (!locked.ok) return not('sent, but it is already used for another event')
  // The publish gate's own cover rule (src/lib/events/publish-gate.ts): only a real cover takes the place of the night's
  // typographic one; the listings run made the night published with that typographic cover, so it is never without one.
  if (!hasRealCover(url)) return not('sent, but its stored address is not a real cover')
  const cover = await admin.from('events').update({ cover_image_url: url }).eq('id', eventId)
  if (cover.error) return not(`sent, but it could not be set as the cover (${cover.error.message})`)
  // Its words, only where the cover has none yet (organiserPhotoAlt); a failure here leaves the photograph on, said.
  const words = await admin.from('events').update({ cover_image_alt: organiserPhotoAlt(sub.title, sub.venue_name) }).eq('id', eventId).is('cover_image_alt', null)
  if (words.error) console.error('[self-listing] the cover\'s alt text could not be written:', words.error.message)
  return { attached: true, words: `yes, the organiser's own, credited "${creditLine(rightsHolder)}"` }
}

/** What the run did with a submission, in the log (Lawal's ruling of 8 November 2026, 15:48 (2) and (6): nothing in the
 * listing path is sent to Lawal; failures are the platform's and the window's to retry and fix, counted in the daily
 * state email and shown on /admin/today). */
function logOutcome(subject: string, text: string): void {
  console.log(`[self-listing] ${subject}: ${text.replace(/\n+/g, ' | ')}`)
}

/**
 * A PERSON'S APPROVE PUBLISHES (15 November 2026, H2o: Lawal pressed Approve at 20:36 on a held submission and nothing went
 * live, because Approve only marked it for an import, and the build guard organiser-photo-before-publish then refused
 * every production deploy). With approvedBy, a hold the checks reached is overruled by the person's own review, and the
 * night is published on the organiser's facts, with its photo, exactly as a self-listed night is; a night already started
 * or already listed still holds, and the name and city rules below still apply.
 */
export function approvedOver(verdict: SelfListingVerdict, sub: Pick<SubmissionRecord, 'starts_at' | 'ends_at' | 'venue_name' | 'venue_address' | 'entry' | 'price_from_cents'>, title: string, approvedBy: string | undefined): SelfListingVerdict {
  if (verdict.verdict === 'publish' || !approvedBy) return verdict
  if (/already started|already listed/i.test(verdict.reason)) return verdict
  return {
    verdict: 'publish',
    facts: { title, startsAt: sub.starts_at, endsAt: sub.ends_at, venueName: sub.venue_name, venueAddress: sub.venue_address, entry: sub.entry, priceFromCents: sub.price_from_cents, host: null },
    corrections: [],
    matchedBy: 'organiser_word',
  }
}

export async function selfListSubmission(id: string, now: Date = new Date(), opts: { readonly approvedBy?: string } = {}): Promise<SelfListingOutcome> {
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
    .select('id, created_at, name, email, role, title, starts_at, ends_at, venue_name, venue_address, city_slug, category_slug, booking_url, entry, price_from_cents, description, photo_path, permission_words, permission_given_at, check_result')
  if (claim.error) return { state: 'skipped', reason: `the submission could not be claimed: ${claim.error.message}` }
  const sub = (claim.data ?? [])[0] as (SubmissionRecord & { check_result?: Record<string, unknown> | null }) | undefined
  if (!sub) return { state: 'skipped', reason: 'already taken or no longer waiting' }
  // A live notice held for this one row (the PM's 22:41 (b), H2o: its organiser's note waits in lane 1 for Lawal's approve).
  const noticeHeld = sub.check_result?.notice_held === true

  const { data: city } = await admin.from('cities').select('slug, name, state, timezone').eq('slug', sub.city_slug).maybeSingle()
  const tz = (city?.timezone as string | undefined) ?? 'Australia/Melbourne'
  const title = cleanTitle(sub.title)
  const reading = await readBookingPage(sub.booking_url)
  // A page that did not answer in time, or could not be reached, is read again on the next run, never held for a person
  // at once (./read-retry.ts; H2o, 16 November 2026, 13:11). It stays waiting, its held notice kept.
  const again = readAgain(reading, sub.check_result)
  if (again.again && !reading.ok) {
    await admin
      .from('listing_submissions')
      .update({ check_result: { ...(sub.check_result ?? {}), read_tries: again.tries, last_read: reading.reason } })
      .eq('id', sub.id)
      .eq('status', 'waiting')
    return { state: 'skipped', reason: `its booking page: ${reading.reason}; read again on the next run (${again.tries} of ${READ_TRIES})` }
  }
  const from = new Date(new Date(sub.starts_at).getTime() - 86_400_000).toISOString()
  const to = new Date(new Date(sub.starts_at).getTime() + 2 * 86_400_000).toISOString()
  const { data: listed } = await admin.from('events').select('title, start_date').eq('status', 'published').gte('start_date', from).lte('start_date', to).limit(2000)

  let verdict: SelfListingVerdict = judgeSelfListing(
    { title, startsAt: sub.starts_at, endsAt: sub.ends_at, venueName: sub.venue_name, venueAddress: sub.venue_address, timezone: tz, entry: sub.entry, priceFromCents: sub.price_from_cents, description: sub.description, bookingUrl: sub.booking_url },
    reading,
    (listed ?? []).map((l) => ({ title: l.title as string, startsAt: l.start_date as string })),
    now,
  )
  verdict = approvedOver(verdict, sub, title, opts.approvedBy)
  if (verdict.verdict === 'publish' && title.length > 80) verdict = { verdict: 'hold', reason: 'Its name is longer than the 80 characters a listing takes.' }
  if (verdict.verdict === 'publish' && !city) verdict = { verdict: 'hold', reason: 'Its city is not one EventLinqs knows.' }
  // A live notice held for this submission stays held through every write below, a hold included (16 November 2026: the
  // run's hold rewrote check_result and dropped H2o's notice_held, so its next release would have told Joe).
  const checkResult = { ...(noticeHeld ? { notice_held: true } : {}), read: reading.ok ? 'read' : reading.reason, verdict: verdict.verdict, matched_by: verdict.verdict === 'publish' ? verdict.matchedBy : null }

  if (verdict.verdict === 'hold') {
    await admin.from('listing_submissions').update({ status: 'held', held_because: verdict.reason.slice(0, 300), reviewed_at: now.toISOString(), check_result: checkResult }).eq('id', sub.id)
    logOutcome(`held: ${title}`, `${title}, sent by ${sub.name}, is held: ${verdict.reason} The window deals with it.`)
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
      ends_at: seriesEndOf(facts.startsAt, facts.endsAt, tz),
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
  // is held with the reason, in the log; the window puts the photo on and lists it again.
  if (!mayStayPublished(sub, photo)) {
    await admin.from('event_series').update({ status: 'paused' }).eq('id', seriesId)
    const gone = await deleteEventEverywhere({ eventId: made.id as string, actor: RUN_ACTOR, deleteWith: admin, revalidateFrom: 'route-handler' })
    const reason = `Its photo could not be put on its page (${photo.words}), and ${ORGANISER_PHOTO_LAW}.${gone.ok ? '' : ` The night could not be taken away either: ${gone.message}`}`
    await admin
      .from('listing_submissions')
      .update({ status: 'held', held_because: reason.slice(0, 300), reviewed_at: now.toISOString(), published_series_id: seriesId, check_result: { ...checkResult, photo: photo.words, photo_attached: false } })
      .eq('id', sub.id)
    logOutcome(`held: ${title}`, `${title}, sent by ${sub.name}, is held: ${reason} The window deals with it.`)
    return { state: 'held', reason }
  }
  await admin
    .from('listing_submissions')
    .update({ status: 'published', reviewed_at: now.toISOString(), published_series_id: seriesId, published_event_id: made.id, corrections: verdict.corrections, check_result: { ...checkResult, photo: photo.words, photo_attached: photo.attached } })
    .eq('id', sub.id)
  // THE GUIDES SHOW IT AS IT NOW STANDS (the PM's 19:20 of 11 November 2026). The occurrence run revalidated when it
  // made the event, BEFORE its photo was put on and before this submission named it the organiser's own (the guide
  // leads with an organiser's own events from published_event_id), so every surface it is on is invalidated again here.
  await revalidateEventSurfacesFromRouteHandlerById(admin, made.id as string)

  const link = `${getSiteUrl()}/events/${made.slug as string}`
  const when = whenWords(facts.startsAt, tz)
  // The organiser hears it is live, in Lawal's format and through the gateway's checks (Lawal's ruling of 8 November 2026,
  // 16:13 (2): automatic, for every event that goes live); the log says what happened.
  const organiserTold = noticeHeld
    ? 'not sent: its live notice is held for this submission (its note waits in lane 1 for Lawal)'
    : await sendOrganiserLiveNotice({ to: sub.email, name: sub.name, title, when, venue: facts.venueName, link })
  const corrected = verdict.corrections.length ? verdict.corrections.map((c) => `${c.field} (${c.submitted ?? 'none'} became ${c.page ?? 'none'})`).join('; ') : 'nothing'
  logOutcome(
    `live: ${title}`,
    `${title} is live on EventLinqs. It passed the self-listing checks against the organiser's own booking page.\n\n` +
      `When: ${when}\nWhere: ${facts.venueName}, ${city.name as string}\nOrganiser: ${sub.name} (${SUBMISSION_ROLE_WORDS[sub.role]})\n` +
      `Price: ${priceWords(facts.entry, facts.priceFromCents)}\nPhoto: ${photo.words}\nCorrected from their booking page: ${corrected}\nOrganiser told: ${organiserTold}\n\nSee it: ${link}`,
  )
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
    .select('id, created_at, name, email, role, title, starts_at, ends_at, venue_name, venue_address, city_slug, category_slug, booking_url, entry, price_from_cents, description, photo_path, permission_words, permission_given_at, published_event_id, check_result')
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
    // The photo is on its card now: every surface the night is on is invalidated, so no guide keeps the card without it.
    if (photo.attached) await revalidateEventSurfacesFromRouteHandlerById(admin, r.published_event_id)
    out.push(`${cleanTitle(r.title)}: ${photo.words}`)
  }
  return out
}
