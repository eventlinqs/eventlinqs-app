'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { fetchArtistForOwner } from '@/lib/broadcast/artists'
import {
  PERFORMANCE_TYPES,
  PAY_TYPES,
  fetchGigById,
  fetchRequestById,
  isPairBlocked,
} from '@/lib/marketplace/gigs'
import { dispatchMarketplaceAlert, notifyMatchingPerformers } from '@/lib/marketplace/notify'

/**
 * Gig Board server actions (flag gig_board). Every mutation is gated on the
 * flag, the caller's session, and ownership; writes go through the admin
 * client behind those explicit gates (the lineup.ts pattern). Structured
 * contact only: applications and booking requests, never open messaging.
 * Nothing here touches order, payment, or payout tables.
 */

export type GigActionResult = { ok: boolean; error?: string; id?: string }

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * The caller's ACTIVE (organiser-verified) organisation, or null.
 *
 * ORDERED, and that is the fix. This was `.limit(1).maybeSingle()` with no
 * `.order()`. It does not error the way the `single()` call sites did, so it looked
 * healthy, but PostgREST gives no ordering guarantee without an ORDER BY and really
 * does vary it: two runs of scripts/verify/maybe-single-behaviour.mjs against the
 * same 26 rows on TEST returned them in two different orders. So an owner of several
 * businesses could post a gig under one business and have the next one land under
 * another, with nothing on screen saying which.
 *
 * Oldest-first makes it deterministic, so the answer is at least stable and
 * predictable rather than whatever the planner returned that second.
 */
async function requireActiveOrganisation(userId: string) {
  const admin = createAdminClient()
  // A FAILED READ IS NOT AN ABSENT ORGANISATION. Every caller answers a
  // refusal on null, so a dropped socket told an approved organiser that
  // booking requests "need an approved organiser account" and sent them to a
  // signup they had already completed.
  const data = await readOrThrow('marketplace-active-organisation', () =>
    admin
      .from('organisations')
      .select('id, name, status')
      .eq('owner_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  )
  return (data as { id: string; name: string; status: string } | null) ?? null
}

const PostGigSchema = z.object({
  title: z.string().min(3).max(140),
  description: z.string().max(4000).default(''),
  citySlug: z.string().regex(/^[a-z0-9-]{2,60}$/),
  venueName: z.string().max(140).optional(),
  performanceType: z.enum(PERFORMANCE_TYPES),
  payType: z.enum(PAY_TYPES),
  payAmountCents: z.number().int().min(0).max(100_000_00).nullable().optional(),
  payNote: z.string().max(280).optional(),
  eventDate: z.string().datetime(),
  applicationDeadline: z.string().datetime(),
  eventId: z.string().uuid().nullable().optional(),
})

export async function postGigAction(input: z.infer<typeof PostGigSchema>): Promise<GigActionResult> {
  if (!(await isFeatureEnabled('gig_board'))) {
    return { ok: false, error: 'The gig board is not switched on yet.' }
  }
  const user = await requireUser()
  if (!user) return { ok: false, error: 'Sign in to post a gig.' }

  const parsed = PostGigSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the gig details.' }
  }
  const gig = parsed.data

  if (new Date(gig.applicationDeadline) > new Date(gig.eventDate)) {
    return { ok: false, error: 'The application deadline must be before the performance date.' }
  }
  if (new Date(gig.applicationDeadline) < new Date()) {
    return { ok: false, error: 'The application deadline must be in the future.' }
  }

  const org = await requireActiveOrganisation(user.id)
  if (!org) {
    return { ok: false, error: 'Posting gigs needs an approved organiser account.' }
  }

  const rl = await actionRateLimit('gig-post', user.id)
  if (!rl.ok) return { ok: false, error: 'Too many gigs posted today. Try again tomorrow.' }

  const admin = createAdminClient()

  // City must exist in the taxonomy (structure supports any Australian city).
  const city = await readOrThrow('marketplace-gig-city', () =>
    admin.from('cities').select('slug').eq('slug', gig.citySlug).maybeSingle(),
  )
  if (!city) return { ok: false, error: 'Pick a city from the list.' }

  // Optional event link must be the organiser's own event.
  if (gig.eventId) {
    const event = await readOrThrow('marketplace-gig-event-ownership', () =>
      admin
        .from('events')
        .select('id')
        .eq('id', gig.eventId as string)
        .eq('organisation_id', org.id)
        .maybeSingle(),
    )
    if (!event) return { ok: false, error: 'That event is not yours to link.' }
  }

  const { data: created, error } = await admin
    .from('gigs')
    .insert({
      organisation_id: org.id,
      created_by: user.id,
      event_id: gig.eventId ?? null,
      title: gig.title.trim(),
      description: gig.description.trim(),
      city_slug: gig.citySlug,
      venue_name: gig.venueName?.trim() || null,
      performance_type: gig.performanceType,
      pay_type: gig.payType,
      pay_amount_cents: gig.payType === 'fixed_fee' ? (gig.payAmountCents ?? null) : null,
      pay_note: gig.payNote?.trim() || null,
      event_date: gig.eventDate,
      application_deadline: gig.applicationDeadline,
      status: 'open',
    })
    .select('*')
    .single()

  if (error || !created) return { ok: false, error: 'Could not post the gig. Try again.' }

  // Alert matching available performers after the response is sent: after()
  // guarantees post-response work runs on serverless (a bare fire-and-forget
  // promise can be frozen with the instance). Best-effort, never blocks
  // posting.
  after(() => notifyMatchingPerformers(admin, created).catch(() => {}))

  revalidatePath('/gigs')
  revalidatePath('/dashboard/gigs')
  return { ok: true, id: created.id as string }
}

const GigStatusSchema = z.object({
  gigId: z.string().uuid(),
  status: z.enum(['open', 'closed', 'filled']),
})

export async function setGigStatusAction(input: z.infer<typeof GigStatusSchema>): Promise<GigActionResult> {
  if (!(await isFeatureEnabled('gig_board'))) {
    return { ok: false, error: 'The gig board is not switched on yet.' }
  }
  const user = await requireUser()
  if (!user) return { ok: false, error: 'Sign in first.' }
  const parsed = GigStatusSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }

  const admin = createAdminClient()
  const gig = await readOrThrow('marketplace-gig-status-change', () =>
    admin
      .from('gigs')
      .select('id, organisation_id, status')
      .eq('id', parsed.data.gigId)
      .maybeSingle(),
  )
  if (!gig) return { ok: false, error: 'Gig not found.' }
  if (gig.status === 'removed') return { ok: false, error: 'This gig was removed.' }

  const org = await requireActiveOrganisation(user.id)
  if (!org || org.id !== gig.organisation_id) return { ok: false, error: 'Not your gig.' }

  await admin
    .from('gigs')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.gigId)

  revalidatePath('/gigs')
  revalidatePath('/dashboard/gigs')
  return { ok: true }
}

/**
 * THE BLOCK CHECK FAILS CLOSED, and it used to fail open.
 *
 * `isPairBlocked` returned `Boolean(data)` over a read whose error was never
 * bound, so a dropped socket answered FALSE, and false is the answer that means
 * NOT BLOCKED. Both call sites read that as permission. For the length of any
 * fault in one read, a block stopped holding: the organiser who blocked a
 * performer received their application, and the performer who was blocked was
 * put back in front of the organiser who blocked them. A block is a safety
 * decision a person made about somebody they do not want contact from, and it
 * is not a thing to guess at.
 *
 * `isPairBlocked` now throws when it cannot establish the answer. This turns
 * that throw into the SAME refusal the person would have seen if the pair were
 * blocked, rather than letting it escape as a generic server error, because a
 * refusal somebody can read beats a stack trace and both are better than
 * contact. The database refuses the insert either way since migration
 * 20260920000060; this is what the person is told.
 */
async function refuseIfBlockedOrUnknowable(
  admin: ReturnType<typeof createAdminClient>,
  organisationId: string,
  artistId: string,
  refusal: string,
): Promise<GigActionResult | null> {
  try {
    return (await isPairBlocked(admin, organisationId, artistId)) ? { ok: false, error: refusal } : null
  } catch (err) {
    console.error(
      '[marketplace] could not establish whether organisation %s and performer %s are blocked; refusing:',
      organisationId,
      artistId,
      err,
    )
    return { ok: false, error: refusal }
  }
}

const ApplySchema = z.object({
  gigId: z.string().uuid(),
  note: z.string().max(2000).default(''),
})

export async function applyToGigAction(input: z.infer<typeof ApplySchema>): Promise<GigActionResult> {
  if (!(await isFeatureEnabled('gig_board'))) {
    return { ok: false, error: 'The gig board is not switched on yet.' }
  }
  const user = await requireUser()
  if (!user) return { ok: false, error: 'Sign in to apply.' }
  const parsed = ApplySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check your application.' }

  const admin = createAdminClient()

  // Applying attaches the performer's OWN artist profile: their draw data,
  // lineup history, and showcase travel with it automatically.
  const artist = await fetchArtistForOwner(admin, user.id)
  if (!artist) {
    return {
      ok: false,
      error: 'Set up your performer profile first. It takes a minute in your artist dashboard.',
    }
  }

  const gig = await fetchGigById(admin, parsed.data.gigId)
  if (!gig || gig.status !== 'open') return { ok: false, error: 'This gig is no longer open.' }
  if (new Date(gig.application_deadline) < new Date()) {
    return { ok: false, error: 'Applications for this gig have closed.' }
  }

  const applyRefusal = await refuseIfBlockedOrUnknowable(
    admin,
    gig.organisation_id,
    artist.id,
    'You cannot apply to this organiser.',
  )
  if (applyRefusal) return applyRefusal

  const rl = await actionRateLimit('gig-apply', user.id)
  if (!rl.ok) {
    return { ok: false, error: 'Too many applications in a short time. Wait a few minutes and try again.' }
  }

  const { data: created, error } = await admin
    .from('gig_applications')
    .insert({
      gig_id: gig.id,
      artist_id: artist.id,
      applicant_user_id: user.id,
      note: parsed.data.note.trim(),
      status: 'submitted',
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'You have already applied to this gig.' }
    return { ok: false, error: 'Could not send your application. Try again.' }
  }

  // Notify the gig's organiser. Best-effort, and it may NOT throw: the
  // application is already inserted, so a fault here must not turn a successful
  // application into an error the performer sees. The error is bound and
  // reported, because the old shape discarded it and the failure mode is an
  // organiser who is never told an application arrived, which is
  // indistinguishable from nobody having applied.
  const { data: org, error: orgError } = await admin
    .from('organisations')
    .select('owner_id')
    .eq('id', gig.organisation_id)
    .maybeSingle()
  if (orgError) {
    console.error('[gigs] could not resolve the organiser to notify of an application:', orgError)
  }
  if (org?.owner_id) {
    // Awaited so the send is never lost to a frozen serverless instance;
    // .catch keeps a notify fault from failing the application.
    await dispatchMarketplaceAlert({
      admin,
      userId: org.owner_id as string,
      type: 'gig_application',
      subjectId: created.id as string,
      title: 'New gig application',
      body: `${artist.name} applied for ${gig.title}. Their profile, draw numbers, and showcase are attached.`,
      url: `/dashboard/gigs/${gig.id}`,
      ctaLabel: 'Review applicants',
    }).catch(() => {})
  }

  revalidatePath(`/gigs/${gig.id}`)
  return { ok: true, id: created.id as string }
}

const ApplicationStatusSchema = z.object({
  applicationId: z.string().uuid(),
  status: z.enum(['shortlisted', 'declined']),
})

export async function setApplicationStatusAction(
  input: z.infer<typeof ApplicationStatusSchema>,
): Promise<GigActionResult> {
  if (!(await isFeatureEnabled('gig_board'))) {
    return { ok: false, error: 'The gig board is not switched on yet.' }
  }
  const user = await requireUser()
  if (!user) return { ok: false, error: 'Sign in first.' }
  const parsed = ApplicationStatusSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }

  const admin = createAdminClient()
  const app = await readOrThrow('marketplace-application-review', () =>
    admin
      .from('gig_applications')
      .select('id, gig_id, status')
      .eq('id', parsed.data.applicationId)
      .maybeSingle(),
  )
  if (!app) return { ok: false, error: 'Application not found.' }

  const gig = await fetchGigById(admin, app.gig_id as string)
  const org = await requireActiveOrganisation(user.id)
  if (!gig || !org || org.id !== gig.organisation_id) return { ok: false, error: 'Not your gig.' }
  if (!['submitted', 'shortlisted'].includes(app.status as string)) {
    return { ok: false, error: 'This application can no longer change.' }
  }

  await admin
    .from('gig_applications')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.applicationId)

  revalidatePath(`/dashboard/gigs/${gig.id}`)
  return { ok: true }
}

export async function withdrawApplicationAction(applicationId: string): Promise<GigActionResult> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'Sign in first.' }
  if (!z.string().uuid().safeParse(applicationId).success) return { ok: false, error: 'Invalid request.' }

  const admin = createAdminClient()
  const app = await readOrThrow('marketplace-application-withdraw', () =>
    admin
      .from('gig_applications')
      .select('id, applicant_user_id, status')
      .eq('id', applicationId)
      .maybeSingle(),
  )
  if (!app || app.applicant_user_id !== user.id) return { ok: false, error: 'Not your application.' }
  if (app.status === 'booked') return { ok: false, error: 'A booked application cannot be withdrawn here.' }

  await admin
    .from('gig_applications')
    .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
    .eq('id', applicationId)
  revalidatePath('/artist/dashboard')
  return { ok: true }
}

const BookingRequestSchema = z.object({
  artistId: z.string().uuid(),
  applicationId: z.string().uuid().nullable().optional(),
  gigId: z.string().uuid().nullable().optional(),
  subject: z.string().min(3).max(140),
  note: z.string().max(2000).default(''),
  payType: z.enum(PAY_TYPES).nullable().optional(),
  payAmountCents: z.number().int().min(0).max(100_000_00).nullable().optional(),
  payNote: z.string().max(280).optional(),
  proposedDate: z.string().datetime().nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
})

export async function sendBookingRequestAction(
  input: z.infer<typeof BookingRequestSchema>,
): Promise<GigActionResult> {
  if (!(await isFeatureEnabled('gig_board'))) {
    return { ok: false, error: 'Booking requests are not switched on yet.' }
  }
  const user = await requireUser()
  if (!user) return { ok: false, error: 'Sign in first.' }
  const parsed = BookingRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the request.' }
  }
  const req = parsed.data

  const org = await requireActiveOrganisation(user.id)
  if (!org) return { ok: false, error: 'Booking requests need an approved organiser account.' }

  const admin = createAdminClient()
  const requestRefusal = await refuseIfBlockedOrUnknowable(
    admin,
    org.id as string,
    req.artistId,
    'You cannot send requests to this performer.',
  )
  if (requestRefusal) return requestRefusal

  const rl = await actionRateLimit('booking-request', user.id)
  if (!rl.ok) return { ok: false, error: 'Too many requests in the last hour. Try again later.' }

  // The one-tap lineup wiring: an attached event must be the organiser's own.
  if (req.eventId) {
    const event = await readOrThrow('marketplace-request-event-ownership', () =>
      admin
        .from('events')
        .select('id')
        .eq('id', req.eventId as string)
        .eq('organisation_id', org.id)
        .maybeSingle(),
    )
    if (!event) return { ok: false, error: 'That event is not yours to attach.' }
  }

  const { data: created, error } = await admin
    .from('booking_requests')
    .insert({
      kind: 'booking',
      gig_id: req.gigId ?? null,
      application_id: req.applicationId ?? null,
      organisation_id: org.id,
      artist_id: req.artistId,
      sent_by: user.id,
      subject: req.subject.trim(),
      note: req.note.trim(),
      pay_type: req.payType ?? null,
      pay_amount_cents: req.payType === 'fixed_fee' ? (req.payAmountCents ?? null) : null,
      pay_note: req.payNote?.trim() || null,
      proposed_date: req.proposedDate ?? null,
      event_id: req.eventId ?? null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'You already have a pending request with this performer.' }
    }
    return { ok: false, error: 'Could not send the request. Try again.' }
  }

  // The same rule as the application notify above: the request is already
  // written, so this may not throw, and the error is bound rather than dropped
  // because the failure is a performer who is never told they were offered work.
  const { data: artist, error: artistError } = await admin
    .from('artists')
    .select('owner_user_id, name')
    .eq('id', req.artistId)
    .maybeSingle()
  if (artistError) {
    console.error('[gigs] could not resolve the performer to notify of a booking request:', artistError)
  }
  if (artist?.owner_user_id) {
    await dispatchMarketplaceAlert({
      admin,
      userId: artist.owner_user_id as string,
      type: 'booking_request',
      subjectId: created.id as string,
      title: 'Booking request',
      body: `${org.name} wants to book you: ${req.subject.trim()}. Accept or decline in your artist dashboard.`,
      url: '/artist/dashboard',
      ctaLabel: 'View the request',
    }).catch(() => {})
  }

  if (req.applicationId) {
    revalidatePath(`/dashboard/gigs/${req.gigId ?? ''}`)
  }
  return { ok: true, id: created.id as string }
}

const RespondSchema = z.object({
  requestId: z.string().uuid(),
  response: z.enum(['accepted', 'declined']),
})

export async function respondToRequestAction(
  input: z.infer<typeof RespondSchema>,
): Promise<GigActionResult> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'Sign in first.' }
  const parsed = RespondSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }

  const admin = createAdminClient()
  const request = await fetchRequestById(admin, parsed.data.requestId)
  if (!request) return { ok: false, error: 'Request not found.' }
  if (request.status !== 'pending') return { ok: false, error: 'This request was already answered.' }

  // Only the performer the request addresses can answer it.
  const artist = await fetchArtistForOwner(admin, user.id)
  if (!artist || artist.id !== request.artist_id) return { ok: false, error: 'Not your request.' }

  await admin
    .from('booking_requests')
    .update({ status: parsed.data.response, responded_at: new Date().toISOString() })
    .eq('id', request.id)

  if (parsed.data.response === 'accepted') {
    // Close the loop: mark the application booked and, when an event is
    // attached, add the performer to its lineup through the EXISTING
    // event_artists tagging, which wires attribution automatically.
    if (request.application_id) {
      await admin
        .from('gig_applications')
        .update({ status: 'booked', updated_at: new Date().toISOString() })
        .eq('id', request.application_id)
    }
    if (request.event_id && request.kind === 'booking') {
      /*
       * A POSITION ON THE BILL IS NOT A THING TO GUESS. This counted the
       * existing lineup to place the new performer at the end, and wrote
       * `billing_order: count ?? 0` with the count's error never bound. A
       * failed count is null, `null ?? 0` is zero, and zero is the TOP of the
       * bill: a performer accepted for a support slot would have been printed
       * above the headliner on the public event page, and nothing would have
       * said why.
       *
       * When the count cannot be taken the tag is not written at all, which is
       * the same end state this block already accepts for a failed insert three
       * lines below, and it is reported the same way. One outcome for "the
       * lineup add did not happen" rather than two, and never a position
       * invented by a coalesce.
       */
      const { count, error: countError } = await admin
        .from('event_artists')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', request.event_id)

      if (countError || count === null) {
        console.error(
          '[gigs] lineup add skipped: the existing lineup could not be counted, so no billing order could be computed:',
          countError ?? 'the count came back null with no error',
        )
      } else {
        const { error: tagError } = await admin.from('event_artists').insert({
          event_id: request.event_id,
          artist_id: request.artist_id,
          billing_order: count,
          status: 'confirmed',
        })
        // An existing tag (23505) is already the desired end state.
        if (tagError && tagError.code !== '23505') {
          console.error('[gigs] lineup add on acceptance failed:', tagError)
        }
      }
      revalidatePath(`/dashboard/events/${request.event_id}/lineup`)
    }
  }

  // Tell the sender. Best-effort, awaited so the send is never lost.
  if (request.sent_by) {
    await dispatchMarketplaceAlert({
      admin,
      userId: request.sent_by,
      type: 'booking_accepted',
      subjectId: request.id,
      title: parsed.data.response === 'accepted' ? 'Request accepted' : 'Request declined',
      body:
        parsed.data.response === 'accepted'
          ? `${artist.name} accepted: ${request.subject}.${request.event_id ? ' They are on the event lineup now.' : ''}`
          : `${artist.name} declined: ${request.subject}.`,
      url: request.gig_id ? `/dashboard/gigs/${request.gig_id}` : `/artists/${artist.slug}`,
      ctaLabel: 'View',
    }).catch(() => {})
  }

  revalidatePath('/artist/dashboard')
  return { ok: true }
}

const MentoringRequestSchema = z.object({
  artistId: z.string().uuid(),
  subject: z.string().min(3).max(140),
  note: z.string().max(2000).default(''),
})

export async function sendMentoringRequestAction(
  input: z.infer<typeof MentoringRequestSchema>,
): Promise<GigActionResult> {
  if (!(await isFeatureEnabled('artist_showcase'))) {
    return { ok: false, error: 'Mentoring requests are not switched on yet.' }
  }
  const user = await requireUser()
  if (!user) return { ok: false, error: 'Sign in first.' }
  const parsed = MentoringRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the request.' }

  const admin = createAdminClient()
  const mentor = await readOrThrow('marketplace-mentor-profile', () =>
    admin
      .from('artists')
      .select('id, name, owner_user_id, mentor_open')
      .eq('id', parsed.data.artistId)
      .maybeSingle(),
  )
  if (!mentor || !mentor.mentor_open || !mentor.owner_user_id) {
    return { ok: false, error: 'This performer is not open to mentoring right now.' }
  }
  if (mentor.owner_user_id === user.id) {
    return { ok: false, error: 'That is your own profile.' }
  }

  const rl = await actionRateLimit('booking-request', user.id)
  if (!rl.ok) return { ok: false, error: 'Too many requests in the last hour. Try again later.' }

  const fromArtist = await fetchArtistForOwner(admin, user.id)

  const { data: created, error } = await admin
    .from('booking_requests')
    .insert({
      kind: 'mentoring',
      artist_id: mentor.id,
      from_artist_id: fromArtist?.id ?? null,
      sent_by: user.id,
      subject: parsed.data.subject.trim(),
      note: parsed.data.note.trim(),
      status: 'pending',
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'You already have a pending request with this performer.' }
    }
    return { ok: false, error: 'Could not send the request. Try again.' }
  }

  await dispatchMarketplaceAlert({
    admin,
    userId: mentor.owner_user_id as string,
    type: 'mentoring_request',
    subjectId: created.id as string,
    title: 'Mentoring request',
    body: `${fromArtist?.name ?? 'A performer'} asked for mentoring: ${parsed.data.subject.trim()}. Accept or decline in your artist dashboard.`,
    url: '/artist/dashboard',
    ctaLabel: 'View the request',
  }).catch(() => {})

  return { ok: true, id: created.id as string }
}

const ReportSchema = z.object({
  targetType: z.enum(['gig', 'application', 'artist_profile']),
  targetId: z.string().uuid(),
  reason: z.enum(['spam', 'scam', 'inappropriate', 'misleading', 'other']),
  note: z.string().max(1000).default(''),
})

export async function reportMarketplaceItemAction(
  input: z.infer<typeof ReportSchema>,
): Promise<GigActionResult> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'Sign in to report.' }
  const parsed = ReportSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the report.' }

  const rl = await actionRateLimit('marketplace-report', user.id)
  if (!rl.ok) return { ok: false, error: 'Report limit reached for today.' }

  const admin = createAdminClient()
  const { error } = await admin.from('marketplace_reports').insert({
    target_type: parsed.data.targetType,
    target_id: parsed.data.targetId,
    reporter_user_id: user.id,
    reason: parsed.data.reason,
    note: parsed.data.note.trim(),
    status: 'open',
  })
  if (error) {
    if (error.code === '23505') return { ok: true } // already reported by this user: same end state
    return { ok: false, error: 'Could not send the report. Try again.' }
  }
  return { ok: true }
}

const BlockSchema = z.object({ artistId: z.string().uuid(), reason: z.string().max(280).optional() })

/** Organiser blocks a performer: no further applications or requests either way. */
export async function blockPerformerAction(input: z.infer<typeof BlockSchema>): Promise<GigActionResult> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'Sign in first.' }
  const parsed = BlockSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }

  const org = await requireActiveOrganisation(user.id)
  if (!org) return { ok: false, error: 'Blocking needs an organiser account.' }

  const admin = createAdminClient()
  const { error } = await admin.from('marketplace_blocks').insert({
    organisation_id: org.id,
    artist_id: parsed.data.artistId,
    created_by: user.id,
    reason: parsed.data.reason?.trim() || null,
  })
  if (error && error.code !== '23505') {
    return { ok: false, error: 'Could not block. Try again.' }
  }
  return { ok: true }
}

const BlockOrgSchema = z.object({ organisationId: z.string().uuid(), reason: z.string().max(280).optional() })

/** Performer blocks an organiser: the same pair block, initiated from their side. */
export async function blockOrganiserAction(input: z.infer<typeof BlockOrgSchema>): Promise<GigActionResult> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'Sign in first.' }
  const parsed = BlockOrgSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }

  const admin = createAdminClient()
  const artist = await fetchArtistForOwner(admin, user.id)
  if (!artist) return { ok: false, error: 'Blocking needs a performer profile.' }

  const { error } = await admin.from('marketplace_blocks').insert({
    organisation_id: parsed.data.organisationId,
    artist_id: artist.id,
    created_by: user.id,
    reason: parsed.data.reason?.trim() || null,
  })
  if (error && error.code !== '23505') {
    return { ok: false, error: 'Could not block. Try again.' }
  }
  return { ok: true }
}
