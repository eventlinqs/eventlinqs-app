'use server'

import { createClient } from '@/lib/supabase/server'
import { isLooserOrEqual, explainTightening, policyFromEvent, type RefundPolicy } from '@/lib/refunds/policy'
import { checkSellable } from '@/lib/events/sellable-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertCallerMayActForOrganisation } from '@/lib/organisations/act-for'
import { redirect } from 'next/navigation'
import {
  revalidateEventSurfaces,
  revalidateEventSurfacesById,
} from '@/lib/events/revalidate-event'
import { canTransition } from '@/lib/event-lifecycle'
import { checkPublishGate, hasPaidTier } from '@/lib/events/publish-gate'
import { parseVideoEmbed } from '@/lib/media/video-embed'
import { serializeGallery, type GalleryImage } from '@/lib/media/event-media-model'
import { moderateEventMedia } from '@/lib/media/moderation'
import { cleanupEventMedia } from '@/lib/upload'
import { resolveCitySlug } from '@/lib/cities/resolve'
import { resolveSuburbSlug } from '@/lib/cities/resolve-suburb'
import { getSiteUrl } from '@/lib/site-url'
import { trackEventPublishedServer } from '@/lib/analytics/plausible'
import type { EventStatus, EventVisibility, EventType, TicketTierType, FeePassType, Json } from '@/types/database'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { readStreamLink, writeStreamLink } from '@/lib/stream/link'
import { livestreamNeedsLink, coerceAccessMode, STREAM_LINK_REQUIRED_MESSAGE } from '@/lib/stream/publish-rule'
import { normaliseCountryCodes } from '@/lib/stream/countries'

// Resolve the organiser media fields from a create/update input into the columns
// the events table stores. Validates the video URL against the provider allowlist
// (raw iframe / pasted HTML is rejected here, never stored) and caps the gallery.
// Returns a friendly error if the video is present but not parseable.
function resolveMediaColumns(input: {
  cover_image_url: string | null
  cover_image_alt?: string | null
  cover_image_blur?: string | null
  gallery?: GalleryImage[]
  video_url?: string | null
}):
  | { ok: true; columns: { cover_image_url: string | null; cover_image_alt: string | null; cover_image_blur: string | null; gallery_urls: GalleryImage[]; video_url: string | null; video_provider: string | null } }
  | { ok: false; error: string } {
  let video_url: string | null = null
  let video_provider: string | null = null
  const raw = (input.video_url ?? '').trim()
  if (raw) {
    const parsed = parseVideoEmbed(raw)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    video_url = parsed.video.embedUrl
    video_provider = parsed.video.provider
  }
  return {
    ok: true,
    columns: {
      cover_image_url: input.cover_image_url || null,
      cover_image_alt: input.cover_image_alt?.trim() || null,
      cover_image_blur: input.cover_image_blur || null,
      gallery_urls: serializeGallery(input.gallery ?? []),
      video_url,
      video_provider,
    },
  }
}

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
  const suffix = Math.random().toString(36).substring(2, 8)
  return `${base}-${suffix}`
}

export type TicketTierInput = {
  name: string
  description: string
  tier_type: TicketTierType
  /** Who the tier admits (Scope v5 3.11). Coerced to the event type on save, as the trigger does. */
  access_mode?: 'in_person' | 'virtual'
  price: number // dollars - converted to cents on insert
  currency: string
  total_capacity: number
  sale_start: string | null
  sale_end: string | null
  min_per_order: number
  max_per_order: number
  sort_order: number
}

export type CreateEventInput = {
  eventId: string
  organisationId: string
  title: string
  summary: string
  description: string
  category_id: string | null
  tags: string[]
  start_date: string
  end_date: string
  timezone: string
  is_multi_day: boolean
  is_recurring: boolean
  recurrence_rule: string | null
  event_type: EventType
  venue_name: string | null
  venue_address: string | null
  venue_city: string | null
  venue_state: string | null
  venue_country: string | null
  venue_postal_code: string | null
  venue_latitude: number | null
  venue_longitude: number | null
  /** The livestream link. Written to the vault (event_stream_links), never to the events row. */
  stream_url: string | null
  /** ISO 3166-1 alpha-2 codes the livestream may be watched from; null means anywhere. */
  stream_geo_allow: string[] | null
  cover_image_url: string | null
  // Event Media Standard: cover alt/blur, the gallery (up to 9), and one optional
  // video link (raw provider URL; parsed + allowlisted server-side on save).
  cover_image_alt: string | null
  cover_image_blur: string | null
  gallery: GalleryImage[]
  video_url: string | null
  visibility: EventVisibility
  is_age_restricted: boolean
  age_restriction_min: number | null
  max_capacity: number | null
  status: EventStatus
  scheduled_publish_at: string | null
  // Who carries the booking fees: pass_to_buyer (default) or absorb.
  fee_pass_type: FeePassType
  /* THE PER-EVENT REFUND POLICY. Set at creation, editable afterwards, but only
   * ever in the direction of MORE generous once the event is published: buyers
   * paid under the terms shown at the time. Enforced by a database trigger and
   * pre-checked below so the organiser gets a sentence rather than an exception. */
  refund_policy_type: RefundPolicy['type']
  refund_policy_days: number
  refund_policy_absorb_fee: boolean
  refund_policy_self_service: boolean
  ticket_tiers: TicketTierInput[]
  // M4: Reserved seating
  has_reserved_seating: boolean
  allow_seat_self_service: boolean
  venue_id: string | null
  seat_map_id: string | null
  // Phase 3B: Squad booking
  squad_booking_enabled: boolean
  squad_timeout_hours: number
  // Phase 3C: Virtual queue. queue_admission_rate and queue_open_at are
  // deferred - they have no columns in the live events schema. Only
  // is_high_demand and queue_admission_window_minutes exist and are written.
  is_high_demand: boolean
  queue_admission_window_minutes: number
}

/**
 * What a create/update/publish action hands back.
 *
 * `nextAction` is the publish gate's own answer to "where do I go to fix this".
 * It used to be computed by the gate and then thrown away by the caller, so an
 * organiser was told to connect Stripe with no way to get there from the screen
 * they were on. Carrying it costs nothing and closes the loop.
 */
export type ActionResult = { error?: string; nextAction?: { label: string; href: string } }

export async function createEvent(input: CreateEventInput): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  /*
   * RATE LIMIT. Event creation had none at all until 2026-08-19, found by
   * scripts/verify/rate-limit-audit.mjs. It is authenticated, so the ceiling was one
   * free account, but a free account could create events in a loop and each one
   * writes an events row, its ticket_tiers and the share_links the acquisition loop
   * mints. The limit sits AFTER the auth check so an anonymous caller is refused as
   * unauthenticated rather than consuming somebody's bucket, and BEFORE any write.
   *
   * KEYED BY user.id, PASSED EXPLICITLY. actionRateLimit defaults to the forwarded
   * IP when no identifier is given, and the first version of this call gave none, so
   * a policy whose rationale said "per organiser per hour" was in fact per ADDRESS
   * per hour. That is wrong in both directions at once: the named threat is one free
   * account looping, which an address does not bound once the account moves, while a
   * shared office or an Australian carrier NAT puts every legitimate organiser behind
   * it into a single bucket of thirty. This platform has already been bitten by the
   * second half twice, on launch-artefact and on launch-compose-daily.
   *
   * The account-minting side is bounded upstream by auth-signup (5 per IP per 10 min,
   * fail-closed), which is the right place for it.
   */
  const rl = await actionRateLimit('event-create', user.id)
  if (!rl.ok) {
    return {
      error: `You have created a lot of events in a short time. Wait ${Math.max(1, Math.ceil(rl.retryAfterSeconds / 60))} minute(s) and try again.`,
    }
  }

  /*
   * OWNERSHIP, PROVED BEFORE ANY PRIVILEGED READ. Owner only, which is what this
   * action has always required; createEvent has never admitted a manager.
   *
   * This used to run on the session client and filter `.or('owner_id.eq.' + id)`.
   * Migration 20260819000002 revokes SELECT on organisations from authenticated,
   * and a WHERE clause needs SELECT privilege on the columns it names just as a
   * projection does, so that filter would have been denied (42501) and every
   * create would have failed with "Organisation not found or access denied".
   * The check now runs under the service role, which is also what makes it a
   * real gate for the publish-gate read below rather than a formality.
   */
  const authority = await assertCallerMayActForOrganisation(user.id, input.organisationId, 'owner')
  if (!authority.ok) return { error: 'Organisation not found or access denied' }

  // Resolve + validate the media columns (video allowlist; gallery cap).
  const media = resolveMediaColumns(input)
  if (!media.ok) return { error: media.error }

  if (input.status === 'published' || input.status === 'scheduled') {
    // A livestream cannot go live without a link (one rule, shared with the form).
    if (
      livestreamNeedsLink({
        eventType: input.event_type,
        tierAccessModes: (input.ticket_tiers ?? []).map(t => coerceAccessMode(input.event_type, t.access_mode)),
        streamUrl: input.stream_url,
      })
    ) {
      return { error: STREAM_LINK_REQUIRED_MESSAGE }
    }

    const gate = await checkPublishGate(createAdminClient(), {
      organisationId: input.organisationId,
      tiersHavePaid: hasPaidTier(input.ticket_tiers),
      coverImageUrl: input.cover_image_url,
      endsAt: input.end_date,
      // 'virtual' needs no address; 'hybrid' still happens somewhere.
      isPhysical: input.event_type !== 'virtual',
      venueName: input.venue_name || null,
      venueAddress: input.venue_address || null,
    })
    if (!gate.ok) return { error: gate.message, nextAction: gate.nextAction }

    // Nothing in the publish path asked whether there was anything to sell.
    // See src/lib/events/sellable-guard.ts.
    const sellable = checkSellable(input.ticket_tiers ?? [], {
      hasReservedSeating: Boolean(input.has_reserved_seating),
    })
    if (!sellable.ok) return { error: sellable.message }

    // Pre-publish media safety gate: every image on-platform, video allowlisted.
    const mod = moderateEventMedia({
      coverImageUrl: media.columns.cover_image_url,
      galleryUrls: media.columns.gallery_urls.map((g) => g.url),
      videoUrl: media.columns.video_url,
      videoProvider: media.columns.video_provider,
    })
    if (!mod.ok) return { error: mod.message }
  }

  const slug = generateSlug(input.title)
  const now = new Date().toISOString()

  const admin = createAdminClient()

  const { error: eventError } = await admin
    .from('events')
    .insert({
      id: input.eventId,
      organisation_id: input.organisationId,
      created_by: user.id,
      title: input.title,
      slug,
      summary: input.summary || null,
      description: input.description || null,
      category_id: input.category_id || null,
      tags: input.tags,
      start_date: input.start_date,
      end_date: input.end_date,
      timezone: input.timezone,
      is_multi_day: input.is_multi_day,
      is_recurring: input.is_recurring,
      recurrence_rule: input.recurrence_rule || null,
      event_type: input.event_type,
      venue_name: input.venue_name || null,
      venue_address: input.venue_address || null,
      venue_city: input.venue_city || null,
      // The canonical city claim. city_primary is the ONE column every
      // city-scoped surface reads, including the weekly local digest, so an
      // event with a recognised locality and a null city_primary is invisible
      // to its own city. Resolved from the typed locality at write time.
      city_primary: resolveCitySlug(input.venue_city),
      // The district claim, and NOT the same move as the city one: a suburb
      // cannot be derived from a city name, so this reads the venue's real
      // coordinates and takes the nearest district centroid inside the same
      // city, or null. Without it every suburb page is permanently empty of
      // organiser events.
      suburb_primary: resolveSuburbSlug({
        citySlug: resolveCitySlug(input.venue_city),
        latitude: input.venue_latitude,
        longitude: input.venue_longitude,
      }),
      venue_state: input.venue_state || null,
      venue_country: input.venue_country || null,
      venue_postal_code: input.venue_postal_code || null,
      venue_latitude: input.venue_latitude || null,
      venue_longitude: input.venue_longitude || null,
      // The stream link itself goes to the vault below, never to this row.
      stream_geo_allow:
        input.event_type === 'in_person' || !input.stream_geo_allow || input.stream_geo_allow.length === 0
          ? null
          : normaliseCountryCodes(input.stream_geo_allow),
      cover_image_url: media.columns.cover_image_url,
      cover_image_alt: media.columns.cover_image_alt,
      cover_image_blur: media.columns.cover_image_blur,
      gallery_urls: media.columns.gallery_urls as unknown as Json,
      video_url: media.columns.video_url,
      video_provider: media.columns.video_provider,
      visibility: input.visibility,
      is_age_restricted: input.is_age_restricted,
      age_restriction_min: input.is_age_restricted ? (input.age_restriction_min ?? 18) : null,
      max_capacity: input.max_capacity || null,
      status: input.status,
      published_at: input.status === 'published' ? now : null,
      scheduled_publish_at: input.status === 'scheduled' ? input.scheduled_publish_at : null,
      has_reserved_seating: input.has_reserved_seating,
      allow_seat_self_service: input.has_reserved_seating ? input.allow_seat_self_service : false,
      venue_id: input.has_reserved_seating ? (input.venue_id || null) : null,
      seat_map_id: input.has_reserved_seating ? (input.seat_map_id || null) : null,
      squad_booking_enabled: input.squad_booking_enabled,
      squad_timeout_hours: input.squad_timeout_hours,
      is_high_demand: input.is_high_demand,
      queue_admission_window_minutes: input.queue_admission_window_minutes,
      fee_pass_type: input.fee_pass_type,
      refund_policy_type: input.refund_policy_type,
      refund_policy_days: input.refund_policy_days,
      refund_policy_absorb_fee: input.refund_policy_absorb_fee,
      refund_policy_self_service: input.refund_policy_self_service,
    })

  if (eventError) {
    console.error('Event insert error:', eventError)
    return { error: `Failed to create event: ${eventError.message}` }
  }

  // The stream link goes to the vault, where anon has no grant. An in-person
  // event clears any link left over from a previous type.
  const vault = await writeStreamLink(admin, input.eventId, input.event_type === 'in_person' ? null : input.stream_url)
  if (!vault.ok) return { error: vault.error }

  if (input.ticket_tiers.length > 0) {
    const tiers = input.ticket_tiers.map((tier, i) => ({
      event_id: input.eventId,
      name: tier.name,
      description: tier.description || null,
      tier_type: tier.tier_type,
      access_mode: coerceAccessMode(input.event_type, tier.access_mode),
      price: Math.round(tier.price * 100), // convert dollars to cents
      currency: tier.currency,
      total_capacity: tier.total_capacity,
      sale_start: tier.sale_start || null,
      sale_end: tier.sale_end || null,
      min_per_order: tier.min_per_order,
      max_per_order: tier.max_per_order,
      sort_order: tier.sort_order ?? i,
    }))

    const { error: tiersError } = await admin.from('ticket_tiers').insert(tiers)
    if (tiersError) {
      console.error('Ticket tiers insert error:', tiersError)
      return { error: 'Event created but failed to save ticket tiers.' }
    }
  }

  // Materialise seats if reserved seating is enabled and a seat map is selected
  if (input.has_reserved_seating && input.seat_map_id) {
    const { error: matError } = await admin.rpc('materialize_seats', {
      p_event_id: input.eventId,
      p_seat_map_id: input.seat_map_id,
    })
    if (matError) {
      console.error('[events] materialize_seats failed:', matError)
      // Non-fatal: event is created, seats can be materialised later
    }
  }

  // Every surface this event appears on, not just the dashboard. It reads the
  // row rather than trusting fields assembled here, so a field added to the event
  // later cannot be forgotten at this call site. See revalidateEventSurfaces.
  // The user-scoped client, not the admin one: this is a cache hint about an
  // event the caller just created and owns, so it needs no service role, and the
  // generated Database generic on the admin client makes this call site
  // instantiate deeply enough that TypeScript gives up (TS2589).
  await revalidateEventSurfacesById(supabase, input.eventId)

  // Activation metric: event_published (fire-and-forget, never blocks the
  // organiser's publish). A create with status published is always a first
  // publish.
  if (input.status === 'published') {
    void trackEventPublishedServer(`${getSiteUrl()}/events/${slug}`, {
      event_id: input.eventId,
      is_free: input.ticket_tiers.every(t => t.price === 0) ? 1 : 0,
      first_publish: 1,
    })
  }

  return {}
}

export type UpdateEventInput = Omit<CreateEventInput, 'eventId' | 'organisationId'> & {
  eventId: string
}

export async function updateEvent(input: UpdateEventInput): Promise<ActionResult | never> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify ownership via event → org
  const { data: event } = await supabase
    .from('events')
    .select('id, organisation_id, status, slug')
    .eq('id', input.eventId)
    .single()

  if (!event) return { error: 'Event not found' }

  /*
   * THE ONE-WAY RULE, CHECKED HERE SO THE ORGANISER GETS WORDS.
   *
   * The authority is the database trigger (migration 20260820000002), which
   * cannot be bypassed by any writer. But a trigger can only raise AFTER the
   * organiser has filled in a form, and a raw Postgres exception is not an
   * explanation. This reads the current policy and refuses first, saying which
   * way the policy is allowed to move. If the two ever disagree the trigger
   * wins and the disagreement is the bug.
   */
  {
    const { data: current } = await supabase
      .from('events')
      .select('status, published_at, refund_policy_type, refund_policy_days, refund_policy_absorb_fee, refund_policy_self_service')
      .eq('id', input.eventId)
      .single()

    const everPublished = Boolean(current?.published_at) || current?.status !== 'draft'
    if (current && everPublished) {
      const oldPolicy = policyFromEvent(current)
      const newPolicy: RefundPolicy = {
        type: input.refund_policy_type,
        days: input.refund_policy_days,
        absorbFee: input.refund_policy_absorb_fee,
        selfService: input.refund_policy_self_service,
      }
      if (!isLooserOrEqual(oldPolicy, newPolicy)) {
        return { error: explainTightening(oldPolicy, newPolicy) }
      }
    }
  }

  // Verify the caller owns (or co-manages) the event's organisation before any
  // privileged write. Without this an authenticated organiser could pass another
  // org's eventId and overwrite that event or wipe its ticket tiers, because the
  // mutations below run under the service-role admin client (RLS bypassed). The
  // existence SELECT above is not a gate: events RLS lets anyone read any
  // published event. These ownership reads run under the session client, so they
  // only succeed for an org the caller actually owns or manages.
  // Owner OR a member holding owner/admin/manager, unchanged from the pair of
  // session-client reads this replaces. It moves to the service role for the
  // reason recorded in act-for.ts: the `owner_id` filter these reads depend on is
  // denied to `authenticated` once 20260819000002 lands, so the ownership check
  // would have failed before the write it protects ever got the chance to.
  const authority = await assertCallerMayActForOrganisation(
    user.id,
    event.organisation_id,
    'owner_or_manager',
  )
  if (!authority.ok) return { error: 'Event not found' }

  const media = resolveMediaColumns(input)
  if (!media.ok) return { error: media.error }

  if (input.status === 'published' || input.status === 'scheduled') {
    // A livestream cannot go live without a link (one rule, shared with the form).
    if (
      livestreamNeedsLink({
        eventType: input.event_type,
        tierAccessModes: (input.ticket_tiers ?? []).map(t => coerceAccessMode(input.event_type, t.access_mode)),
        streamUrl: input.stream_url,
      })
    ) {
      return { error: STREAM_LINK_REQUIRED_MESSAGE }
    }

    const gate = await checkPublishGate(createAdminClient(), {
      organisationId: event.organisation_id,
      tiersHavePaid: hasPaidTier(input.ticket_tiers),
      coverImageUrl: input.cover_image_url,
      endsAt: input.end_date,
      isPhysical: input.event_type !== 'virtual',
      venueName: input.venue_name || null,
      venueAddress: input.venue_address || null,
    })
    if (!gate.ok) return { error: gate.message, nextAction: gate.nextAction }

    // The edit path publishes too, so a guard only on create would be
    // bypassed by saving a draft and publishing from the edit screen.
    const sellable = checkSellable(input.ticket_tiers ?? [], {
      hasReservedSeating: Boolean(input.has_reserved_seating),
    })
    if (!sellable.ok) return { error: sellable.message }

    const mod = moderateEventMedia({
      coverImageUrl: media.columns.cover_image_url,
      galleryUrls: media.columns.gallery_urls.map((g) => g.url),
      videoUrl: media.columns.video_url,
      videoProvider: media.columns.video_provider,
    })
    if (!mod.ok) return { error: mod.message }
  }

  const now = new Date().toISOString()

  const admin = createAdminClient()

  // Read previous seat_map_id to detect changes
  const { data: prevEvent } = await supabase
    .from('events')
    .select('seat_map_id, has_reserved_seating')
    .eq('id', input.eventId)
    .single()

  const { error: eventError } = await admin
    .from('events')
    .update({
      title: input.title,
      summary: input.summary || null,
      description: input.description || null,
      category_id: input.category_id || null,
      tags: input.tags,
      start_date: input.start_date,
      end_date: input.end_date,
      timezone: input.timezone,
      is_multi_day: input.is_multi_day,
      is_recurring: input.is_recurring,
      recurrence_rule: input.recurrence_rule || null,
      event_type: input.event_type,
      venue_name: input.venue_name || null,
      venue_address: input.venue_address || null,
      venue_city: input.venue_city || null,
      // Kept in step with venue_city on every edit, so moving an event to a
      // new city moves its digest and city-page reach with it.
      city_primary: resolveCitySlug(input.venue_city),
      // Re-resolved on every edit for the same reason: moving the venue moves
      // the district, and a stale district is a wrong answer rather than a
      // missing one.
      suburb_primary: resolveSuburbSlug({
        citySlug: resolveCitySlug(input.venue_city),
        latitude: input.venue_latitude,
        longitude: input.venue_longitude,
      }),
      venue_state: input.venue_state || null,
      venue_country: input.venue_country || null,
      venue_postal_code: input.venue_postal_code || null,
      venue_latitude: input.venue_latitude || null,
      venue_longitude: input.venue_longitude || null,
      // The stream link itself goes to the vault below, never to this row.
      stream_geo_allow:
        input.event_type === 'in_person' || !input.stream_geo_allow || input.stream_geo_allow.length === 0
          ? null
          : normaliseCountryCodes(input.stream_geo_allow),
      cover_image_url: media.columns.cover_image_url,
      cover_image_alt: media.columns.cover_image_alt,
      cover_image_blur: media.columns.cover_image_blur,
      gallery_urls: media.columns.gallery_urls as unknown as Json,
      video_url: media.columns.video_url,
      video_provider: media.columns.video_provider,
      visibility: input.visibility,
      is_age_restricted: input.is_age_restricted,
      age_restriction_min: input.is_age_restricted ? (input.age_restriction_min ?? 18) : null,
      max_capacity: input.max_capacity || null,
      status: input.status,
      published_at: input.status === 'published' && !event.status.includes('published') ? now : undefined,
      scheduled_publish_at: input.status === 'scheduled' ? input.scheduled_publish_at : null,
      has_reserved_seating: input.has_reserved_seating,
      allow_seat_self_service: input.has_reserved_seating ? input.allow_seat_self_service : false,
      venue_id: input.has_reserved_seating ? (input.venue_id || null) : null,
      seat_map_id: input.has_reserved_seating ? (input.seat_map_id || null) : null,
      squad_booking_enabled: input.squad_booking_enabled,
      squad_timeout_hours: input.squad_timeout_hours,
      is_high_demand: input.is_high_demand,
      queue_admission_window_minutes: input.queue_admission_window_minutes,
      fee_pass_type: input.fee_pass_type,
      refund_policy_type: input.refund_policy_type,
      refund_policy_days: input.refund_policy_days,
      refund_policy_absorb_fee: input.refund_policy_absorb_fee,
      refund_policy_self_service: input.refund_policy_self_service,
    })
    .eq('id', input.eventId)

  if (eventError) return { error: `Failed to update event: ${eventError.message}` }

  // The stream link goes to the vault, where anon has no grant. Moving the
  // event to in-person clears it.
  const vault = await writeStreamLink(admin, input.eventId, input.event_type === 'in_person' ? null : input.stream_url)
  if (!vault.ok) return { error: vault.error }

  // Replace ticket tiers: delete existing, re-insert
  await admin.from('ticket_tiers').delete().eq('event_id', input.eventId)

  if (input.ticket_tiers.length > 0) {
    const tiers = input.ticket_tiers.map((tier, i) => ({
      event_id: input.eventId,
      name: tier.name,
      description: tier.description || null,
      tier_type: tier.tier_type,
      access_mode: coerceAccessMode(input.event_type, tier.access_mode),
      price: Math.round(tier.price * 100),
      currency: tier.currency,
      total_capacity: tier.total_capacity,
      sale_start: tier.sale_start || null,
      sale_end: tier.sale_end || null,
      min_per_order: tier.min_per_order,
      max_per_order: tier.max_per_order,
      sort_order: tier.sort_order ?? i,
    }))

    const { error: tiersError } = await admin.from('ticket_tiers').insert(tiers)
    if (tiersError) return { error: `Failed to update ticket tiers: ${tiersError.message}` }
  }

  // Re-materialise seats if seat map changed or reserved seating was just enabled
  const seatMapChanged =
    input.has_reserved_seating &&
    input.seat_map_id &&
    (prevEvent?.seat_map_id !== input.seat_map_id || !prevEvent?.has_reserved_seating)

  if (seatMapChanged) {
    const { error: matError } = await admin.rpc('materialize_seats', {
      p_event_id: input.eventId,
      p_seat_map_id: input.seat_map_id,
    })
    if (matError) {
      // Never a silent no-op: the DB refuses a destructive re-materialise
      // once seats are reserved or sold, and the organiser must hear that
      // in plain words, not discover it at the door.
      console.error('[events] materialize_seats failed on update:', matError)
      const refused = /reserved or sold/i.test(matError.message ?? '')
      return {
        error: refused
          ? 'The seating chart was NOT swapped: this event already has reserved or sold seats. Use "Review chart edits" on the Seats page to apply safe changes, or refund the sold seats first.'
          : `The seating chart could not be applied: ${matError.message}. The rest of your changes were saved.`,
      }
    }
  }

  // THE DEFECT: this used to invalidate the public page only when the event had
  // reserved seating, so an ordinary event's edit was invisible until its 300
  // second ISR window expired, and then only on the request AFTER that.
  await revalidateEventSurfacesById(admin, input.eventId)

  // Activation metric: a draft transitioning to published through the edit
  // path is that event's first publish.
  if (input.status === 'published' && !event.status.includes('published')) {
    void trackEventPublishedServer(`${getSiteUrl()}/events/${event.slug}`, {
      event_id: input.eventId,
      is_free: input.ticket_tiers.every(t => t.price === 0) ? 1 : 0,
      first_publish: 1,
    })
  }

  redirect('/dashboard/events?saved=1')
}

export async function publishEvent(eventId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event } = await supabase
    .from('events')
    .select('status, organisation_id, cover_image_url, slug, has_reserved_seating, end_date, event_type, venue_name, venue_address')
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Event not found' }

  /*
   * OWNERSHIP, ADDED 20 August 2026. There was no explicit check here: the SELECT
   * above is not one, because the events RLS SELECT policy admits any published
   * event, and the protection was the RLS UPDATE policy on the write at the end.
   * That was adequate while the publish gate also ran on the session client. It
   * stops being adequate the moment the gate reads under the service role, because
   * a caller who does not own the organisation would then learn from the refusal
   * message whether somebody else's organisation can take money.
   *
   * Owner or manager, matching updateEvent: publishing is the sibling of updating,
   * and the write below remains RLS-protected regardless, so this narrows what the
   * gate will answer without widening what anyone may actually change.
   */
  const authority = await assertCallerMayActForOrganisation(
    user.id,
    event.organisation_id,
    'owner_or_manager',
  )
  if (!authority.ok) return { error: 'Event not found' }

  if (!canTransition(event.status as EventStatus, 'published')) {
    return { error: `Cannot publish event in '${event.status}' state` }
  }

  const { data: tiers } = await supabase
    .from('ticket_tiers')
    .select('price, name, total_capacity, is_active')
    .eq('event_id', eventId)

  const gate = await checkPublishGate(createAdminClient(), {
    organisationId: event.organisation_id,
    tiersHavePaid: hasPaidTier(tiers ?? []),
    coverImageUrl: event.cover_image_url,
    endsAt: event.end_date,
    isPhysical: event.event_type !== 'virtual',
    venueName: event.venue_name,
    venueAddress: event.venue_address,
  })
  if (!gate.ok) return { error: gate.message, nextAction: gate.nextAction }

  const sellable = checkSellable(tiers ?? [], {
    hasReservedSeating: Boolean(event.has_reserved_seating),
  })
  if (!sellable.ok) return { error: sellable.message }

  const { error } = await supabase
    .from('events')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', eventId)

  if (error) return { error: 'Failed to publish event' }
  // THE DEFECT: publishing used to invalidate NOTHING but the city picker, so a
  // freshly published event did not appear on the listing, the homepage or any
  // discovery surface until each one expired on its own timer.
  await revalidateEventSurfacesById(supabase, eventId)

  // Activation metric: publishing from the events table. A draft going live
  // is a first publish; resuming a paused event is not.
  void trackEventPublishedServer(`${getSiteUrl()}/events/${event.slug}`, {
    event_id: eventId,
    is_free: (tiers ?? []).every(t => t.price === 0) ? 1 : 0,
    first_publish: event.status === 'draft' ? 1 : 0,
  })

  return {}
}

export async function pauseEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event } = await supabase
    .from('events')
    .select('status')
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Event not found' }
  if (!canTransition(event.status as EventStatus, 'paused')) {
    return { error: `Cannot pause event in '${event.status}' state` }
  }

  const { error } = await supabase
    .from('events')
    .update({ status: 'paused' })
    .eq('id', eventId)

  if (error) return { error: 'Failed to pause event' }
  // A paused event that keeps selling from a cached page is the worst version of
  // this defect: it takes money for something the organiser has stopped.
  await revalidateEventSurfacesById(supabase, eventId)
  return {}
}

export async function cancelEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event } = await supabase
    .from('events')
    .select('status')
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Event not found' }
  if (!canTransition(event.status as EventStatus, 'cancelled')) {
    return { error: `Cannot cancel event in '${event.status}' state` }
  }

  const { error } = await supabase
    .from('events')
    .update({ status: 'cancelled' })
    .eq('id', eventId)

  if (error) return { error: 'Failed to cancel event' }
  // Same reasoning as pause, and more urgent: a cancelled event must stop being
  // offered everywhere it is listed, immediately.
  await revalidateEventSurfacesById(supabase, eventId)
  return {}
}

export async function duplicateEvent(eventId: string): Promise<{ error?: string; newEventId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event } = await supabase
    .from('events')
    .select('*, ticket_tiers(*)')
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Event not found' }

  const newSlug = generateSlug(event.title)
  const { id: _id, created_at: _ca, updated_at: _ua, published_at: _pa, ticket_tiers, ...rest } = event

  const { data: newEvent, error: insertError } = await supabase
    .from('events')
    .insert({
      ...rest,
      slug: newSlug,
      status: 'draft',
      published_at: null,
      scheduled_publish_at: null,
      created_by: user.id,
    })
    .select()
    .single()

  if (insertError || !newEvent) return { error: 'Failed to duplicate event' }

  // The stream link lives in the vault, so the row spread above did not carry
  // it. Copy it under the organiser's own session (RLS scopes both events).
  const existingLink = await readStreamLink(supabase, eventId)
  if (existingLink) {
    const copied = await writeStreamLink(supabase, newEvent.id, existingLink)
    if (!copied.ok) return { error: copied.error }
  }

  if (ticket_tiers && ticket_tiers.length > 0) {
    const newTiers = ticket_tiers.map(
      ({ id: _tid, event_id: _eid, created_at: _tca, updated_at: _tua, sold_count: _sc, reserved_count: _rc, ...tierRest }: {
        id: string
        event_id: string
        created_at: string
        updated_at: string
        sold_count: number
        reserved_count: number
        [key: string]: unknown
      }) => ({
        ...tierRest,
        event_id: newEvent.id,
        sold_count: 0,
        reserved_count: 0,
      })
    )
    await supabase.from('ticket_tiers').insert(newTiers)
  }

  // A duplicate lands as a DRAFT, so no public surface changes, but the
  // organiser's own lists must show it at once.
  await revalidateEventSurfacesById(supabase, newEvent.id)
  return { newEventId: newEvent.id }
}

export async function deleteEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event } = await supabase
    .from('events')
    // slug, venue_city and tags are read HERE because after the delete there is
    // no row left to compose the invalidation from, and a deleted event that
    // lingers on a cached listing is a link straight into a 404.
    .select('status, created_by, cover_image_url, gallery_urls, slug, venue_city, tags')
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Event not found' }
  if (event.status !== 'draft') return { error: 'Only draft events can be deleted' }

  const { error } = await supabase.from('events').delete().eq('id', eventId)
  if (error) return { error: 'Failed to delete event' }

  revalidateEventSurfaces({
    slug: event.slug,
    venue_city: event.venue_city,
    tags: Array.isArray(event.tags) ? (event.tags as string[]) : [],
  })

  // Orphan cleanup: remove the event's stored images so deleting an event never
  // leaks storage. Best-effort (the row is already gone); failures are logged.
  const galleryUrls = Array.isArray(event.gallery_urls)
    ? event.gallery_urls
        .map((g) => (typeof g === 'string' ? g : (g as { url?: string } | null)?.url))
        .filter((u): u is string => typeof u === 'string')
    : []
  await cleanupEventMedia({
    eventId,
    createdBy: event.created_by,
    urls: [event.cover_image_url, ...galleryUrls].filter((u): u is string => typeof u === 'string'),
  })
  return {}
}
