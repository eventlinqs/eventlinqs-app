'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createEvent, updateEvent } from '@/app/(dashboard)/dashboard/events/actions'
import { EventMediaStep, type MediaImage } from './event-media-step'
import { parseGallery } from '@/lib/media/event-media-model'
import { isPaidPublishBlocked } from '@/lib/events/paid-publish-blocked'
import { STREAM_COUNTRIES, STREAM_REGIONS, normaliseCountryCodes, describeCountries } from '@/lib/stream/countries'
import { isAcceptableStreamLink } from '@/lib/stream/embed'
import { livestreamNeedsLink, coerceAccessMode, STREAM_LINK_REQUIRED_MESSAGE } from '@/lib/stream/publish-rule'
import { AssistantPanel, type PanelSuggestion } from '@/components/ai/assistant-panel'
import { MagicStart } from './magic-start'
import type { MagicStartDraft } from '@/lib/ai/magic-start'
import { addHoursLocal, buildDraftPatch, summariseDraft } from '@/lib/events/magic-draft-apply'
import { getAllCommunities, type CommunitySlug } from '@/lib/communities/data'
import { trackKitStarted } from '@/lib/analytics/plausible'
import {
  communitiesFromTags,
  stripCanonicalCommunityTokens,
  canonicalTokensForCommunities,
} from '@/lib/communities/tag-bridge'
import {
  formatPlatformDateTime,
  fromZonedInputValue,
  toZonedInputValue,
} from '@/lib/dates/event-time'
import { timezoneForVenue, AUSTRALIAN_ZONES } from '@/lib/dates/venue-timezone'

/**
 * The zone a brand new form starts in, before the organiser has typed an address
 * that determines one. Melbourne rather than Sydney because that is where the
 * recruitment effort is pointed, and it is replaced the moment a venue names a
 * state or a known city. See timezoneForVenue.
 */
const DEFAULT_TIMEZONE = 'Australia/Melbourne'
import type {
  EventCategory,
  EventType,
  EventVisibility,
  EventStatus,
  TicketTierType,
  TicketTier,
  FeePassType,
} from '@/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

export type TicketTierInput = {
  id: string // client-side only
  name: string
  description: string
  tier_type: TicketTierType
  /** Who this tier admits: the door, or the livestream (Scope v5 3.11). */
  access_mode: 'in_person' | 'virtual'
  price: string // string for input binding
  currency: string
  total_capacity: string
  sale_start: string
  sale_end: string
  min_per_order: string
  max_per_order: string
  sort_order: number
}

// Heritage communities for the create/edit multi-select, ordered so Aboriginal &
// Torres Strait Islander leads (heritageOrder). Static data, computed once.
const ALL_COMMUNITIES = getAllCommunities().slice().sort((a, b) => a.heritageOrder - b.heritageOrder)

type FormData = {
  // Step 1
  title: string
  summary: string
  description: string
  category_id: string
  tags: string
  community_slugs: CommunitySlug[]
  // Step 2
  start_date: string
  end_date: string
  timezone: string
  is_multi_day: boolean
  is_recurring: boolean
  recurrence_rule: string
  // Step 3
  event_type: EventType
  venue_name: string
  venue_address: string
  venue_city: string
  venue_state: string
  venue_country: string
  venue_postal_code: string
  // The livestream link. Stored in the vault table through src/lib/stream/link.ts,
  // never on the events row, and revealed only to livestream ticket holders after
  // purchase.
  stream_url: string
  // ISO 3166-1 alpha-2 codes the livestream may be watched from; empty = anywhere.
  stream_geo_allow: string[]
  // Step 4 - Event Media Standard: one ordered list (index 0 = cover, 1..9 =
  // gallery) plus one optional video link (raw provider URL; parsed server-side).
  media: MediaImage[]
  video_url: string
  // Step 5
  ticket_tiers: TicketTierInput[]
  // Who carries the fees: pass-on (buyer pays, organiser keeps face value -
  // default) or absorb (deducted from the organiser payout).
  fee_pass_type: FeePassType
  refund_policy_type: 'days_before' | 'no_refunds'
  refund_policy_days: number
  refund_policy_absorb_fee: boolean
  refund_policy_self_service: boolean
  // Step 6
  visibility: EventVisibility
  is_age_restricted: boolean
  age_restriction_min: string
  max_capacity: string
  // M4: Reserved seating
  has_reserved_seating: boolean
  allow_seat_self_service: boolean
  organiser_assigns_seats: boolean
  venue_id: string
  seat_map_id: string
  // Phase 3B: Squad booking
  squad_booking_enabled: boolean
  squad_timeout_hours: string
  // Phase 3C: Virtual queue. queue_admission_rate and queue_open_at are
  // deferred (no live schema columns); only the toggle and the window persist.
  is_high_demand: boolean
  queue_admission_window_minutes: string
}

/**
 * JURISDICTIONAL COMPLETENESS (founder standing rule, 2026-08-23): this platform
 * operates in ALL of Australia, and a partial list is a defect, not an
 * abbreviation.
 *
 * This list used to name five Australian zones by hand: Melbourne, Sydney,
 * Brisbane, Perth and Adelaide. Australia/Hobart and Australia/Darwin were
 * missing, so an organiser in Tasmania or the Northern Territory could not
 * select their own timezone when creating an event and had to pick somebody
 * else's.
 *
 * FOR DARWIN THAT WAS NOT COSMETIC. Australia/Darwin is GMT+09:30 all year
 * because the Northern Territory does not observe daylight saving.
 * Australia/Adelaide, the nearest option that WAS offered, is GMT+10:30 for the
 * whole daylight-saving season. Measured on 2026-01-15: Darwin GMT+09:30,
 * Adelaide GMT+10:30. A Darwin organiser picking the closest available zone
 * therefore had every event time wrong by a full hour from October to April,
 * which is the entire summer festival season.
 *
 * Hobart happens to share Melbourne's offset today, so a Tasmanian organiser was
 * less exposed. That is a coincidence of two independently governed zones, not a
 * reason to omit one.
 *
 * The Australian zones now come from AUSTRALIAN_ZONES, derived from the same
 * STATE_ZONE map that resolves an event's timezone from its venue. One source,
 * so the picker cannot offer a zone the resolver does not know, and the resolver
 * cannot produce a zone the picker will not show.
 */
const TIMEZONES = [
  ...AUSTRALIAN_ZONES,
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Accra',
  'Africa/Johannesburg',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'UTC',
]

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NGN', 'KES', 'GHS', 'ZAR']

const TIER_TYPES: { value: TicketTierType; label: string }[] = [
  { value: 'general_admission', label: 'General Admission' },
  { value: 'vip', label: 'VIP' },
  { value: 'vvip', label: 'VVIP' },
  { value: 'early_bird', label: 'Early Bird' },
  { value: 'group', label: 'Group' },
  { value: 'student', label: 'Student' },
  { value: 'table_booth', label: 'Table / Booth' },
  { value: 'donation', label: 'Donation' },
  { value: 'free', label: 'Free' },
]

const RECURRENCE_OPTIONS = [
  { value: 'FREQ=DAILY', label: 'Daily' },
  { value: 'FREQ=WEEKLY', label: 'Weekly' },
  { value: 'FREQ=MONTHLY', label: 'Monthly' },
]

const STEPS = [
  'Basic Details',
  'Date & Time',
  'Location',
  'Event Media',
  'Tickets',
  'Settings',
  'Review & Publish',
]

function newTier(sort_order: number): TicketTierInput {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    tier_type: 'general_admission',
    access_mode: 'in_person',
    price: '0',
    currency: 'AUD',
    total_capacity: '',
    sale_start: '',
    sale_end: '',
    min_per_order: '1',
    max_per_order: '10',
    sort_order,
  }
}

function getDefaultFormData(): FormData {
  const now = new Date()
  const start = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
  // The seeded default is shown in the SAME zone the form is about to save in,
  // so the organiser is never handed a UTC wall clock labelled as their own.
  const fmt = (d: Date) => toZonedInputValue(d.toISOString(), DEFAULT_TIMEZONE)

  return {
    title: '',
    summary: '',
    description: '',
    category_id: '',
    tags: '',
    community_slugs: [],
    start_date: fmt(start),
    end_date: fmt(end),
    timezone: DEFAULT_TIMEZONE,
    is_multi_day: false,
    is_recurring: false,
    recurrence_rule: 'FREQ=WEEKLY',
    event_type: 'in_person',
    venue_name: '',
    venue_address: '',
    venue_city: '',
    venue_state: '',
    venue_country: 'Australia',
    venue_postal_code: '',
    stream_url: '',
    stream_geo_allow: [],
    media: [],
    video_url: '',
    ticket_tiers: [newTier(0)],
    visibility: 'public',
    is_age_restricted: false,
    age_restriction_min: '18',
    max_capacity: '',
    has_reserved_seating: false,
    allow_seat_self_service: false,
    organiser_assigns_seats: false,
    venue_id: '',
    seat_map_id: '',
    squad_booking_enabled: true,
    squad_timeout_hours: '24',
    is_high_demand: false,
    queue_admission_window_minutes: '10',
    fee_pass_type: 'pass_to_buyer',
    // The DEFAULT IS THE GENEROUS ONE, matching Eventbrite's "Allow refunds"
    // default. It also matters for the one-way rule: an organiser can always
    // loosen later, so starting strict would trap them.
    refund_policy_type: 'days_before',
    refund_policy_days: 7,
    refund_policy_absorb_fee: false,
    refund_policy_self_service: false,
  }
}

// Rebuild the ordered media list (cover first, then gallery) from a saved event.
// Existing images were already valid covers/gallery, so width is set above the
// cover floor to keep them freely reorderable.
function existingMedia(event: {
  cover_image_url: string | null
  cover_image_alt?: string | null
  cover_image_blur?: string | null
  gallery_urls?: unknown
}): MediaImage[] {
  const out: MediaImage[] = []
  if (event.cover_image_url) {
    out.push({
      id: crypto.randomUUID(),
      url: event.cover_image_url,
      alt: event.cover_image_alt ?? '',
      blur: event.cover_image_blur ?? undefined,
      width: 9999,
      height: 0,
      uploading: false,
    })
  }
  for (const g of parseGallery(event.gallery_urls)) {
    out.push({ id: crypto.randomUUID(), url: g.url, alt: g.alt, blur: g.blur, width: 9999, height: 0, uploading: false })
  }
  return out
}

function fromExistingEvent(
  event: {
    title: string
    summary: string | null
    description: string | null
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
    stream_geo_allow?: string[] | null
    cover_image_url: string | null
    cover_image_alt?: string | null
    cover_image_blur?: string | null
    gallery_urls?: unknown
    video_url?: string | null
    visibility: EventVisibility
    is_age_restricted: boolean
    age_restriction_min: number | null
    max_capacity: number | null
    has_reserved_seating?: boolean
    allow_seat_self_service?: boolean
    organiser_assigns_seats?: boolean
    venue_id?: string | null
    seat_map_id?: string | null
    squad_booking_enabled?: boolean | null
    squad_timeout_hours?: number | null
    is_high_demand?: boolean | null
    queue_admission_window_minutes?: number | null
    fee_pass_type?: FeePassType | null
    refund_policy_type?: string | null
    refund_policy_days?: number | null
    refund_policy_absorb_fee?: boolean | null
    refund_policy_self_service?: boolean | null
  },
  tiers: TicketTier[],
  /** Read from the vault by the edit page with the organiser's own session. */
  streamUrl: string | null = null,
): FormData {
  // THE EDIT ROUND TRIP, which is where the shift accumulated. The stored value
  // is a UTC instant; the input must show it as a wall clock in the EVENT's own
  // zone. Slicing the ISO string handed the organiser UTC and called it local,
  // and saving then subtracted the browser's offset from it a second time, so
  // every save moved the event one offset earlier. See fromZonedInputValue.
  const zone = event.timezone
  const fmt = (d: string) => toZonedInputValue(d, zone)
  return {
    title: event.title,
    summary: event.summary ?? '',
    description: event.description ?? '',
    category_id: event.category_id ?? '',
    tags: stripCanonicalCommunityTokens(event.tags).join(', '),
    community_slugs: communitiesFromTags(event.tags),
    start_date: fmt(event.start_date),
    end_date: fmt(event.end_date),
    timezone: event.timezone,
    is_multi_day: event.is_multi_day,
    is_recurring: event.is_recurring,
    recurrence_rule: event.recurrence_rule ?? 'FREQ=WEEKLY',
    event_type: event.event_type,
    venue_name: event.venue_name ?? '',
    venue_address: event.venue_address ?? '',
    venue_city: event.venue_city ?? '',
    venue_state: event.venue_state ?? '',
    venue_country: event.venue_country ?? '',
    venue_postal_code: event.venue_postal_code ?? '',
    stream_url: streamUrl ?? '',
    stream_geo_allow: normaliseCountryCodes(event.stream_geo_allow),
    media: existingMedia(event),
    video_url: event.video_url ?? '',
    ticket_tiers: tiers.map((t, i) => ({
      id: t.id,
      name: t.name,
      description: t.description ?? '',
      tier_type: t.tier_type,
      access_mode: t.access_mode === 'virtual' ? 'virtual' : 'in_person',
      price: (t.price / 100).toString(),
      currency: t.currency,
      total_capacity: t.total_capacity.toString(),
      sale_start: t.sale_start ? toZonedInputValue(t.sale_start, zone) : '',
      sale_end: t.sale_end ? toZonedInputValue(t.sale_end, zone) : '',
      min_per_order: t.min_per_order.toString(),
      max_per_order: t.max_per_order.toString(),
      sort_order: t.sort_order ?? i,
    })),
    visibility: event.visibility,
    is_age_restricted: event.is_age_restricted,
    age_restriction_min: (event.age_restriction_min ?? 18).toString(),
    max_capacity: event.max_capacity?.toString() ?? '',
    has_reserved_seating: event.has_reserved_seating ?? false,
    allow_seat_self_service: event.allow_seat_self_service ?? false,
    organiser_assigns_seats: event.organiser_assigns_seats ?? false,
    venue_id: event.venue_id ?? '',
    seat_map_id: event.seat_map_id ?? '',
    squad_booking_enabled: event.squad_booking_enabled ?? false,
    squad_timeout_hours: (event.squad_timeout_hours ?? 24).toString(),
    is_high_demand: event.is_high_demand ?? false,
    queue_admission_window_minutes: (event.queue_admission_window_minutes ?? 10).toString(),
    fee_pass_type: event.fee_pass_type ?? 'pass_to_buyer',
    refund_policy_type: event.refund_policy_type === 'no_refunds' ? 'no_refunds' : 'days_before',
    refund_policy_days: event.refund_policy_days ?? 7,
    refund_policy_absorb_fee: event.refund_policy_absorb_fee ?? false,
    refund_policy_self_service: event.refund_policy_self_service ?? false,
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface VenueOption {
  id: string
  name: string
  seat_maps: { id: string; name: string; total_seats: number }[]
}

type Props = {
  userId: string
  organisationId: string
  categories: EventCategory[]
  venues?: VenueOption[]
  // For edit mode
  editMode?: boolean
  existingEventId?: string
  existingEvent?: Parameters<typeof fromExistingEvent>[0]
  existingTiers?: TicketTier[]
  /** The vault row for this event, read by the edit page under the organiser's session. */
  existingStreamUrl?: string | null
  existingStatus?: EventStatus
  /** Launch Kit flag (read server-side): publish delivers the kit screen. */
  launchKitEnabled?: boolean
  /** Artists flag (read server-side): prompt the organiser to tag their lineup. */
  lineupEnabled?: boolean
  /** Magic Start flag (read server-side): AI describe-your-event prefill. */
  magicStartEnabled?: boolean
  /**
   * Whether this organisation can currently sell a PAID ticket, resolved on the
   * server with isOrganiserSellable. Used only to make the Publish button look
   * as blocked as it actually is. The real guard stays server-side in
   * checkPublishGate; this never decides anything on its own.
   */
  canSellPaid?: boolean
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EventForm({
  userId: _userId,
  organisationId,
  categories,
  venues = [],
  editMode = false,
  existingEventId,
  existingEvent,
  existingTiers = [],
  existingStreamUrl = null,
  existingStatus = 'draft',
  launchKitEnabled = false,
  lineupEnabled = false,
  magicStartEnabled = false,
  canSellPaid = true,
}: Props) {
  const router = useRouter()
  // A stable event id, generated once. useState (not useRef) so it can be read
  // during render (the seat step passes it down) without a ref-in-render access.
  const [eventId] = useState(() => existingEventId ?? crypto.randomUUID())

  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<FormData>(() =>
    editMode && existingEvent
      ? fromExistingEvent(existingEvent, existingTiers, existingStreamUrl)
      : getDefaultFormData()
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Where the publish gate says to go next, when it says anything. */
  const [errorAction, setErrorAction] = useState<{ label: string; href: string } | null>(null)
  const [stepError, setStepError] = useState<string | null>(null)

  /*
   * Does this event want to charge, and can this organisation take money?
   *
   * eventIsPaid is the SAME predicate the sale gate uses, imported rather than
   * re-derived, so the button and the gate cannot come to different answers
   * about what counts as a paid event. Prices are strings here for input
   * binding, so they are parsed before the shared predicate sees them.
   *
   * It comes from sale-status and NOT from publish-gate, which is the obvious
   * home: publish-gate transitively pulls in `server-only` through the Stripe
   * reconciler, and importing it here failed the build with "'server-only'
   * cannot be imported from a Client Component module". sale-status is already
   * imported by the checkout client component, so it is known client-safe.
   */
  const paidPublishBlocked = useMemo(
    () => isPaidPublishBlocked({ canSellPaid, editMode, tierPrices: formData.ticket_tiers }),
    [canSellPaid, editMode, formData.ticket_tiers],
  )

  const set = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData(d => ({ ...d, [key]: value }))
  }, [])

  /*
   * A livestream cannot go live without a link (src/lib/stream/publish-rule.ts).
   * The server action refuses with the same sentence; this only stops the button
   * looking available right up to that refusal. Edit mode is NOT exempt: an
   * organiser who removes the link from a published livestream is told so.
   */
  const streamLinkMissing = useMemo(
    () =>
      livestreamNeedsLink({
        eventType: formData.event_type,
        tierAccessModes: formData.ticket_tiers.map(t => coerceAccessMode(formData.event_type, t.access_mode)),
        streamUrl: formData.stream_url,
      }),
    [formData.event_type, formData.ticket_tiers, formData.stream_url],
  )

  /*
   * Changing the event type moves every tier with it, exactly as the database
   * trigger does: a virtual event admits everyone online, an in-person event
   * admits everyone at the door, and only a hybrid event asks per tier.
   */
  const chooseEventType = useCallback((type: EventType) => {
    setFormData(d => ({
      ...d,
      event_type: type,
      ticket_tiers: d.ticket_tiers.map(t => ({ ...t, access_mode: coerceAccessMode(type, t.access_mode) })),
    }))
  }, [])

  // Activation metric: kit_started fires once per create-mode session, on the
  // first meaningful input (typing a title, or applying a Magic Start draft).
  const kitStartedRef = useRef(false)
  // Set once the organiser picks a zone by hand, so venue-derived resolution
  // never overwrites a deliberate choice.
  const timezoneTouchedRef = useRef(false)
  const markKitStarted = useCallback(
    (mode: 'wizard' | 'magic_start') => {
      if (editMode || kitStartedRef.current) return
      kitStartedRef.current = true
      trackKitStarted({ mode })
    },
    [editMode],
  )

  /*
   * THE EVENT'S ZONE FOLLOWS THE VENUE, not the browser.
   *
   * This used to read `Intl.DateTimeFormat().resolvedOptions().timeZone` and use
   * it as the event's zone. That is the ORGANISER's zone, and the two are only
   * the same when the organiser is at the venue. It is also coarser than it
   * looks: Windows carries one setting for the whole eastern seaboard, and it
   * resolves to Australia/Sydney, so a Geelong event created on a Melbourne
   * laptop was stored as Sydney. Harmless while the offsets agree, wrong on the
   * label a buyer reads, and wrong outright the day a Perth or Brisbane
   * organiser signs up.
   *
   * The venue decides. It re-resolves as the organiser types the address, so
   * changing the city changes the zone, and it stops the moment the organiser
   * sets the dropdown by hand: `timezoneTouchedRef` records that they overrode
   * it, and their choice is never taken back off them. An address that does not
   * determine a zone leaves whatever is already selected alone.
   */
  useEffect(() => {
    if (editMode || timezoneTouchedRef.current) return
    const resolved = timezoneForVenue({
      state: formData.venue_state,
      city: formData.venue_city,
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from the venue fields; must be an effect so SSR and the client agree
    if (resolved && resolved !== formData.timezone) set('timezone', resolved)
  }, [editMode, formData.venue_state, formData.venue_city, formData.timezone, set])

  const buildPayload = (status: EventStatus) => ({
    eventId: eventId,
    organisationId,
    title: formData.title,
    summary: formData.summary,
    description: formData.description,
    category_id: formData.category_id || null,
    tags: Array.from(new Set([
      ...stripCanonicalCommunityTokens(formData.tags.split(',').map(t => t.trim()).filter(Boolean)),
      ...canonicalTokensForCommunities(formData.community_slugs),
    ])),
    // What the organiser typed, read in the zone THEY chose in this form, not in
    // whatever zone the browser happens to be set to. `new Date("2026-09-01T12:00")`
    // is specified to read a zoneless date-time as the runtime's local time, so
    // the dropdown above was decorative and the browser decided. It decides now.
    start_date: fromZonedInputValue(formData.start_date, formData.timezone),
    end_date: fromZonedInputValue(formData.end_date, formData.timezone),
    timezone: formData.timezone,
    is_multi_day: formData.is_multi_day,
    is_recurring: formData.is_recurring,
    recurrence_rule: formData.is_recurring ? formData.recurrence_rule : null,
    event_type: formData.event_type,
    venue_name: formData.venue_name || null,
    venue_address: formData.venue_address || null,
    venue_city: formData.venue_city || null,
    venue_state: formData.venue_state || null,
    venue_country: formData.venue_country || null,
    venue_postal_code: formData.venue_postal_code || null,
    venue_latitude: null,
    venue_longitude: null,
    stream_url: formData.event_type === 'in_person' ? null : formData.stream_url.trim() || null,
    stream_geo_allow:
      formData.event_type === 'in_person' || formData.stream_geo_allow.length === 0
        ? null
        : normaliseCountryCodes(formData.stream_geo_allow),
    // Index 0 of the media list is the cover; 1..9 are the gallery. Only fully
    // uploaded images (a real url) are persisted.
    cover_image_url: formData.media[0]?.url || null,
    cover_image_alt: formData.media[0]?.alt?.trim() || null,
    cover_image_blur: formData.media[0]?.blur || null,
    gallery: formData.media
      .slice(1)
      .filter(m => !!m.url)
      .map(m => ({ url: m.url, alt: m.alt.trim(), ...(m.blur ? { blur: m.blur } : {}) })),
    video_url: formData.video_url.trim() || null,
    visibility: formData.visibility,
    is_age_restricted: formData.is_age_restricted,
    age_restriction_min: formData.is_age_restricted ? parseInt(formData.age_restriction_min) : null,
    max_capacity: formData.max_capacity ? parseInt(formData.max_capacity) : null,
    status,
    scheduled_publish_at: null,
    has_reserved_seating: formData.has_reserved_seating,
    allow_seat_self_service: formData.has_reserved_seating ? formData.allow_seat_self_service : false,
    organiser_assigns_seats: formData.has_reserved_seating ? formData.organiser_assigns_seats : false,
    venue_id: formData.has_reserved_seating ? (formData.venue_id || null) : null,
    seat_map_id: formData.has_reserved_seating ? (formData.seat_map_id || null) : null,
    squad_booking_enabled: formData.squad_booking_enabled,
    squad_timeout_hours: Math.min(72, Math.max(1, parseInt(formData.squad_timeout_hours) || 24)),
    is_high_demand: formData.is_high_demand,
    queue_admission_window_minutes: Math.min(60, Math.max(5, parseInt(formData.queue_admission_window_minutes) || 10)),
    fee_pass_type: formData.fee_pass_type,
    refund_policy_type: formData.refund_policy_type,
    refund_policy_days: formData.refund_policy_days,
    refund_policy_absorb_fee: formData.refund_policy_absorb_fee,
    refund_policy_self_service: formData.refund_policy_self_service,
    ticket_tiers: formData.ticket_tiers.map((t, i) => ({
      name: t.name,
      description: t.description,
      tier_type: t.tier_type,
      access_mode: coerceAccessMode(formData.event_type, t.access_mode),
      price: parseFloat(t.price) || 0,
      currency: t.currency,
      total_capacity: parseInt(t.total_capacity) || 0,
      // A BLANK sale window stays NULL, and NULL means on sale now. That is the
      // rule create_reservation already enforces (migration 20260704000005) and
      // the rule tierSaleWindowState mirrors. It is stated here because a founder
      // spent a night believing a blank field had put his event on hold.
      sale_start: t.sale_start ? fromZonedInputValue(t.sale_start, formData.timezone) : null,
      sale_end: t.sale_end ? fromZonedInputValue(t.sale_end, formData.timezone) : null,
      min_per_order: parseInt(t.min_per_order) || 1,
      max_per_order: parseInt(t.max_per_order) || 10,
      sort_order: i,
    })),
  })

  const handleSubmit = async (status: EventStatus) => {
    if (!formData.title.trim()) {
      setError('Event title is required.')
      setStep(1)
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const payload = buildPayload(status)
      let result: { error?: string; nextAction?: { label: string; href: string } }
      if (editMode && existingEventId) {
        result = await updateEvent({ ...payload, eventId: existingEventId })
      } else {
        result = await createEvent(payload)
      }
      if (result.error) {
        setError(result.error)
        setErrorAction(result.nextAction ?? null)
        // Only re-enable the buttons on a FAILED submit. On success the
        // component is navigating away, so we deliberately keep isSubmitting
        // true through the navigation: this closes the brief window where a
        // fast second click could re-fire createEvent with the same event id.
        setIsSubmitting(false)
      } else if (!editMode && status === 'published' && launchKitEnabled) {
        // The signature moment: publish delivers the launch kit. The organiser
        // lands on their kit screen, never silently back on the events table.
        router.push(`/dashboard/events/${eventId}/launch-kit?published=1`)
        router.refresh()
      } else {
        router.push('/dashboard/events')
        router.refresh()
      }
    } catch (err: unknown) {
      // Re-throw Next.js redirect/navigation errors so they propagate correctly
      if (err !== null && typeof err === 'object' && 'digest' in err) throw err
      setError('Something went wrong. Please try again.')
      setIsSubmitting(false)
    }
  }

  const handleContinue = () => {
    if (step === 2) {
      if (formData.start_date && formData.end_date) {
        if (new Date(formData.end_date) <= new Date(formData.start_date)) {
          setStepError('End date and time must be after start date and time.')
          return
        }
      }
    }
    // Event Media (step 4): never advance while a cover or gallery image is
    // still uploading. The media step lives in local state and unmounts when
    // the wizard moves on, so leaving mid-upload would strand the finished
    // upload on an unmounted component and silently lose the cover, leaving
    // the organiser stuck at Review with "No cover yet". Waiting here is the
    // root fix for that race.
    if (step === 4) {
      if (formData.media.some(m => m.uploading)) {
        setStepError('Your cover is still uploading. Give it a moment, then continue.')
        return
      }
    }
    if (step === 5) {
      const eventStart = formData.start_date ? new Date(formData.start_date) : null
      const eventEnd = formData.end_date ? new Date(formData.end_date) : null
      for (let i = 0; i < formData.ticket_tiers.length; i++) {
        const tier = formData.ticket_tiers[i]
        const label = tier.name.trim() || `Tier ${i + 1}`
        if (tier.sale_start && tier.sale_end) {
          if (new Date(tier.sale_end) <= new Date(tier.sale_start)) {
            setStepError(`${label}: Sale end date must be after sale start date.`)
            return
          }
        }
        if (tier.sale_end && eventEnd) {
          if (new Date(tier.sale_end) > eventEnd) {
            setStepError(`${label}: Sale end date cannot be after the event ends.`)
            return
          }
        }
        if (tier.sale_start && eventStart) {
          if (new Date(tier.sale_start) > eventStart) {
            setStepError(`${label}: Sale start date cannot be after the event starts.`)
            return
          }
        }
      }
    }
    setStepError(null)
    setStep(s => Math.min(s + 1, 7))
  }

  // ─── Step Renderers ────────────────────────────────────────────────────────

  // Magic Start: land one description as an editable prefilled draft. Only
  // fields the AI resolved are written; blanks stay blank. Never publishes.
  const [magicSummary, setMagicSummary] = useState<{
    filled: string[]
    assumed: string[]
    stillNeeded: string[]
  } | null>(null)

  /**
   * Land a Magic Start draft. The write and the status message both come from
   * ONE pure function (src/lib/events/magic-draft-apply.ts), so a field can
   * never be reported as filled and missing at the same time, which is what
   * defect C1 was.
   */
  const applyMagicDraft = (draft: MagicStartDraft) => {
    markKitStarted('magic_start')
    const application = buildDraftPatch(draft, {
      categories,
      allowedCommunitySlugs: ALL_COMMUNITIES.map(c => c.slug),
      newId: () => crypto.randomUUID(),
    })
    setFormData(d => {
      const next = { ...d, ...application.patch } as typeof d
      // Catch-all invariant: the wizard and publish both reject end <= start,
      // so clamp whatever combination of fields the draft produced.
      const s = new Date(next.start_date).getTime()
      const e = new Date(next.end_date).getTime()
      if (Number.isFinite(s) && (!Number.isFinite(e) || e <= s)) {
        next.end_date = addHoursLocal(next.start_date, 2)
      }
      return next
    })
    setMagicSummary(summariseDraft(application))
    setStep(1)
  }

  const applyHelperSuggestion = (s: PanelSuggestion) => {
    if (s.kind === 'title') {
      set('title', s.value.slice(0, 200))
    } else if (s.kind === 'description') {
      set('description', s.value.slice(0, 5000))
    } else if (s.kind === 'category') {
      const match = categories.find(c => c.name.trim().toLowerCase() === s.value.trim().toLowerCase())
      if (match) set('category_id', match.id)
    }
  }

  const renderStep1 = () => (
    <div className="space-y-5">
      {magicStartEnabled && !editMode && (
        <>
          <MagicStart onDraft={applyMagicDraft} />
          {magicSummary && (
            <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-ink-900">
              <p className="font-semibold">
                Your draft is built.
                {magicSummary.filled.length > 0 ? ` Filled from what you said: ${magicSummary.filled.join(', ')}.` : ''}
              </p>
              {magicSummary.assumed.length > 0 && (
                <p className="mt-1 text-ink-600">
                  Assumed for you: {magicSummary.assumed.join('; ')}. Change it below if that is not right.
                </p>
              )}
              {magicSummary.stillNeeded.length > 0 ? (
                <p className="mt-1 text-ink-600">
                  Still needs you: {magicSummary.stillNeeded.join(', ')}. Everything is editable below before you publish.
                </p>
              ) : (
                <p className="mt-1 text-ink-600">
                  Nothing is missing. Read it through, change anything you want, then continue.
                </p>
              )}
            </div>
          )}
        </>
      )}
      <details className="group rounded-xl border border-gold-400/40 bg-gold-100/40">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
          <span className="text-gold-800">Need a hand with the title, description, or category?</span>
          <span className="ml-auto text-xs text-ink-600 group-open:hidden">Open the helper</span>
          <span className="ml-auto hidden text-xs text-ink-600 group-open:inline">Close</span>
        </summary>
        <div className="border-t border-gold-400/30 p-3">
          <AssistantPanel
            assistant="event-helper"
            title="Event writing helper"
            intro="Ask for title ideas, a full description, or the right category. Tap Use this to drop a suggestion straight into the form."
            placeholder="e.g. Write a description for my Afrobeats night in Geelong"
            getDraft={() => ({ title: formData.title, description: formData.description })}
            onApplySuggestion={applyHelperSuggestion}
            starters={[
              'Suggest three titles for my event',
              'Write my event description',
              'Which category fits my event?',
            ]}
          />
        </div>
      </details>

      <div>
        <label htmlFor="event-title-1" className="block text-sm font-medium text-ink-600 mb-1">
          Event Title <span className="text-red-500">*</span>
        </label>
        <input id="event-title-1"
          type="text"
          value={formData.title}
          onChange={e => {
            markKitStarted('wizard')
            set('title', e.target.value)
          }}
          placeholder="e.g. Summer Music Festival 2026"
          className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </div>

      <div>
        <label htmlFor="short-summary-200-2" className="block text-sm font-medium text-ink-600 mb-1">
          Short Summary
          <span className="ml-2 text-xs text-ink-400">({formData.summary.length}/200)</span>
        </label>
        <input id="short-summary-200-2"
          type="text"
          value={formData.summary}
          onChange={e => e.target.value.length <= 200 && set('summary', e.target.value)}
          placeholder="A brief one-line description shown on event cards"
          className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="description-3" className="block text-sm font-medium text-ink-600">Description</label>
          <span className={`text-xs ${formData.description.length > 4900 ? 'text-amber-500' : 'text-ink-400'}`}>
            {formData.description.length}/5000
          </span>
        </div>
        <textarea id="description-3"
          rows={6}
          value={formData.description}
          onChange={e => e.target.value.length <= 5000 && set('description', e.target.value)}
          placeholder="Describe your event in detail…"
          className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </div>

      <div>
        <label htmlFor="category-4" className="block text-sm font-medium text-ink-600 mb-1">Category</label>
        <select id="category-4"
          value={formData.category_id}
          onChange={e => set('category_id', e.target.value)}
          className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        >
          <option value="">Select a category</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="tags-comma-separated-5" className="block text-sm font-medium text-ink-600 mb-1">
          Tags
          <span className="ml-2 text-xs text-ink-400">Comma-separated</span>
        </label>
        <input id="tags-comma-separated-5"
          type="text"
          value={formData.tags}
          onChange={e => set('tags', e.target.value)}
          placeholder="music, outdoor, family-friendly"
          className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-600 mb-1">
          Communities
          <span className="ml-2 text-xs text-ink-400">Optional. Tick any that fit; your event then shows on their community pages.</span>
        </label>
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {ALL_COMMUNITIES.map(c => {
            const checked = formData.community_slugs.includes(c.slug)
            return (
              <label key={c.slug} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-ink-200 px-3 py-2 text-sm transition-colors hover:bg-ink-100">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    set(
                      'community_slugs',
                      checked
                        ? formData.community_slugs.filter(s => s !== c.slug)
                        : [...formData.community_slugs, c.slug],
                    )
                  }
                  className="h-4 w-4 rounded border-ink-300 text-gold-500 focus:ring-gold-500"
                />
                <span className="text-ink-700">{c.displayName}</span>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="start-date-time-7" className="block text-sm font-medium text-ink-600 mb-1">
            Start Date & Time <span className="text-red-500">*</span>
          </label>
          <input id="start-date-time-7"
            type="datetime-local"
            value={formData.start_date}
            onChange={e => set('start_date', e.target.value)}
            className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>
        <div>
          <label htmlFor="end-date-time-8" className="block text-sm font-medium text-ink-600 mb-1">
            End Date & Time <span className="text-red-500">*</span>
          </label>
          <input id="end-date-time-8"
            type="datetime-local"
            value={formData.end_date}
            onChange={e => set('end_date', e.target.value)}
            className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="timezone-9" className="block text-sm font-medium text-ink-600 mb-1">Timezone</label>
        <select id="timezone-9"
          value={formData.timezone}
          onChange={e => {
            // The organiser has overridden the venue-derived zone. Record it, so
            // a later address edit never silently takes their choice back.
            timezoneTouchedRef.current = true
            set('timezone', e.target.value)
          }}
          className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        >
          {formData.timezone && !TIMEZONES.includes(formData.timezone) && (
            <option value={formData.timezone}>{formData.timezone} (detected)</option>
          )}
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      <label htmlFor="this-is-a-multi-day-event-10" className="flex items-center gap-3 cursor-pointer">
        <input id="this-is-a-multi-day-event-10"
          type="checkbox"
          checked={formData.is_multi_day}
          onChange={e => set('is_multi_day', e.target.checked)}
          className="h-4 w-4 rounded border-ink-200 text-gold-500 focus:ring-gold-500"
        />
        <span className="text-sm font-medium text-ink-600">This is a multi-day event</span>
      </label>

      <label htmlFor="this-is-a-recurring-event-11" className="flex items-center gap-3 cursor-pointer">
        <input id="this-is-a-recurring-event-11"
          type="checkbox"
          checked={formData.is_recurring}
          onChange={e => set('is_recurring', e.target.checked)}
          className="h-4 w-4 rounded border-ink-200 text-gold-500 focus:ring-gold-500"
        />
        <span className="text-sm font-medium text-ink-600">This is a recurring event</span>
      </label>

      {formData.is_recurring && (
        <div>
          <label htmlFor="recurrence-12" className="block text-sm font-medium text-ink-600 mb-1">Recurrence</label>
          <select id="recurrence-12"
            value={formData.recurrence_rule}
            onChange={e => set('recurrence_rule', e.target.value)}
            className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          >
            {RECURRENCE_OPTIONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-ink-600 mb-2">Event Type</label>
        <div className="flex gap-3">
          {(['in_person', 'virtual', 'hybrid'] as EventType[]).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => chooseEventType(type)}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium capitalize transition-colors ${
                formData.event_type === type
                  ? 'border-gold-500 bg-gold-100 text-gold-600'
                  : 'border-ink-200 text-ink-600 hover:border-ink-400'
              }`}
            >
              {type.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {(formData.event_type === 'in_person' || formData.event_type === 'hybrid') && (
        <div className="space-y-4">
          <div>
            <label htmlFor="venue-name-13" className="block text-sm font-medium text-ink-600 mb-1">Venue Name</label>
            <input id="venue-name-13"
              type="text"
              value={formData.venue_name}
              onChange={e => set('venue_name', e.target.value)}
              placeholder="e.g. Melbourne Convention Centre"
              className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          <div>
            <label htmlFor="address-14" className="block text-sm font-medium text-ink-600 mb-1">Address</label>
            <input id="address-14"
              type="text"
              value={formData.venue_address}
              onChange={e => set('venue_address', e.target.value)}
              placeholder="Street address"
              className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="city-15" className="block text-sm font-medium text-ink-600 mb-1">City</label>
              <input id="city-15"
                type="text"
                value={formData.venue_city}
                onChange={e => set('venue_city', e.target.value)}
                className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>
            <div>
              <label htmlFor="state-region-16" className="block text-sm font-medium text-ink-600 mb-1">State / Region</label>
              <input id="state-region-16"
                type="text"
                value={formData.venue_state}
                onChange={e => set('venue_state', e.target.value)}
                className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="country-17" className="block text-sm font-medium text-ink-600 mb-1">Country</label>
              <input id="country-17"
                type="text"
                value={formData.venue_country}
                onChange={e => set('venue_country', e.target.value)}
                className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>
            <div>
              <label htmlFor="postal-code-18" className="block text-sm font-medium text-ink-600 mb-1">Postal Code</label>
              <input id="postal-code-18"
                type="text"
                value={formData.venue_postal_code}
                onChange={e => set('venue_postal_code', e.target.value)}
                className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>
          </div>
        </div>
      )}

      {(formData.event_type === 'virtual' || formData.event_type === 'hybrid') && (
        <div className="space-y-5 rounded-xl border border-ink-200 bg-canvas p-5">
          <div>
            <label htmlFor="stream-link" className="block text-sm font-medium text-ink-600 mb-1">
              Stream link
            </label>
            <input
              id="stream-link"
              type="url"
              value={formData.stream_url}
              onChange={e => set('stream_url', e.target.value)}
              placeholder="https://www.youtube.com/live/..."
              className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
            <p className="mt-1.5 text-xs text-ink-600">
              YouTube Live, Zoom, StreamYard, any https page, or an rtmp address. It is revealed only to
              livestream ticket holders after they buy, and it never appears on your event page.
            </p>
            {formData.stream_url.trim() !== '' && !isAcceptableStreamLink(formData.stream_url) && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-error-strong">
                That does not look like a link viewers can open. It needs to start with https:// or rtmp://.
              </p>
            )}
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-ink-600 mb-1">Who can watch</legend>
            <p className="mb-3 text-xs text-ink-600">
              Leave every box clear to stream anywhere. Tick countries to restrict the livestream to viewers there.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {STREAM_REGIONS.map(region => (
                <button
                  key={region.name}
                  type="button"
                  onClick={() =>
                    set('stream_geo_allow', normaliseCountryCodes([...formData.stream_geo_allow, ...region.codes]))
                  }
                  className="min-h-[36px] rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 hover:border-gold-500 hover:text-ink-900"
                >
                  {region.name}
                </button>
              ))}
              {formData.stream_geo_allow.length > 0 && (
                <button
                  type="button"
                  onClick={() => set('stream_geo_allow', [])}
                  className="min-h-[36px] rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 hover:border-gold-500 hover:text-ink-900"
                >
                  Anywhere
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
              {STREAM_COUNTRIES.map(c => (
                <div key={c.code} className="flex min-h-[40px] items-center gap-2">
                  <input
                    id={`geo-${c.code}`}
                    type="checkbox"
                    checked={formData.stream_geo_allow.includes(c.code)}
                    onChange={e =>
                      set(
                        'stream_geo_allow',
                        e.target.checked
                          ? normaliseCountryCodes([...formData.stream_geo_allow, c.code])
                          : formData.stream_geo_allow.filter(code => code !== c.code),
                      )
                    }
                    className="h-4 w-4 rounded border-ink-200 text-gold-600 focus:ring-gold-500"
                  />
                  <label htmlFor={`geo-${c.code}`} className="text-sm text-ink-600">
                    {c.name}
                  </label>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-600">
              {formData.stream_geo_allow.length === 0
                ? 'Streams anywhere.'
                : `Streams to viewers in ${describeCountries(formData.stream_geo_allow)}.`}
            </p>
          </fieldset>

          {formData.event_type === 'hybrid' && (
            <p className="text-xs text-ink-600">
              On the tickets step, choose which tiers admit at the door and which admit to the livestream.
            </p>
          )}
        </div>
      )}
    </div>
  )

  const renderStep4 = () => (
    <EventMediaStep
      eventId={eventId}
      images={formData.media}
      onImagesChange={imgs => set('media', imgs)}
      video={formData.video_url}
      onVideoChange={v => set('video_url', v)}
      // The LIVE form values, so a designed cover carries the details the
      // organiser has typed rather than the ones last written to the row.
      title={formData.title}
      startLocal={formData.start_date}
      venueName={formData.venue_name}
      venueCity={formData.venue_city}
      organisationId={organisationId}
    />
  )

  const renderStep5 = () => (
    <div className="space-y-6">
      {formData.ticket_tiers.map((tier, idx) => (
        <div key={tier.id} className="rounded-lg border border-ink-200 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink-900">
              Ticket Tier {idx + 1}
            </h4>
            {formData.ticket_tiers.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const tiers = formData.ticket_tiers.filter((_, i) => i !== idx)
                  set('ticket_tiers', tiers)
                }}
                className="text-xs text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`tier-name-${idx}`} className="block text-xs font-medium text-ink-600 mb-1">Name</label>
              <input id={`tier-name-${idx}`}
                type="text"
                value={tier.name}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], name: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                placeholder="e.g. General Admission"
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>

            <div>
              <label htmlFor="type-21" className="block text-xs font-medium text-ink-600 mb-1">Type</label>
              <select id="type-21"
                value={tier.tier_type}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], tier_type: e.target.value as TicketTierType }
                  set('ticket_tiers', tiers)
                }}
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              >
                {TIER_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {formData.event_type === 'hybrid' && (
              <div>
                <label htmlFor={`tier-admits-${idx}`} className="block text-xs font-medium text-ink-600 mb-1">Who this ticket admits</label>
                <select
                  id={`tier-admits-${idx}`}
                  value={tier.access_mode}
                  onChange={e => {
                    const tiers = [...formData.ticket_tiers]
                    tiers[idx] = { ...tiers[idx], access_mode: e.target.value === 'virtual' ? 'virtual' : 'in_person' }
                    set('ticket_tiers', tiers)
                  }}
                  className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                >
                  <option value="in_person">In person, at the door</option>
                  <option value="virtual">Livestream viewers</option>
                </select>
              </div>
            )}
            {formData.event_type === 'virtual' && (
              <p className="self-end rounded-lg border border-ink-200 bg-ink-100 px-3 py-2 text-xs text-ink-600">
                Admits livestream viewers. A virtual event admits everyone online.
              </p>
            )}

            <div>
              <label htmlFor={`tier-price-${idx}`} className="block text-xs font-medium text-ink-600 mb-1">Price</label>
              <div className="flex gap-2">
                {/* The "Price" label used to point HERE, at the currency
                    dropdown, so pressing it focused the currency and the price
                    field itself was reachable only through its aria-label. The
                    label now points at the price input; the currency carries its
                    own name. Found by journey 2 on 2026-08-28: filling the field
                    the label named produced a $0 ticket on a paid event. */}
                <select
                  aria-label="Currency"
                  value={tier.currency}
                  onChange={e => {
                    const tiers = [...formData.ticket_tiers]
                    tiers[idx] = { ...tiers[idx], currency: e.target.value }
                    set('ticket_tiers', tiers)
                  }}
                  className="w-24 rounded-lg border border-ink-200 px-2 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                >
                  {CURRENCIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  id={`tier-price-${idx}`}
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label={`Ticket price for tier ${idx + 1}`}
                  value={tier.price}
                  onChange={e => {
                    const tiers = [...formData.ticket_tiers]
                    tiers[idx] = { ...tiers[idx], price: e.target.value }
                    set('ticket_tiers', tiers)
                  }}
                  placeholder="0.00"
                  className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor={`tier-capacity-${idx}`} className="block text-xs font-medium text-ink-600 mb-1">Total Capacity</label>
              <input id={`tier-capacity-${idx}`}
                type="number"
                min="1"
                value={tier.total_capacity}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], total_capacity: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                placeholder="Enter capacity"
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>

            <div>
              <label htmlFor="sale-starts-24" className="block text-xs font-medium text-ink-600 mb-1">Sale Starts</label>
              <input id="sale-starts-24"
                type="datetime-local"
                value={tier.sale_start}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], sale_start: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>

            <div>
              <label htmlFor="sale-ends-25" className="block text-xs font-medium text-ink-600 mb-1">Sale Ends</label>
              <input id="sale-ends-25"
                type="datetime-local"
                value={tier.sale_end}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], sale_end: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>

            <div>
              <label htmlFor="min-per-order-26" className="block text-xs font-medium text-ink-600 mb-1">Min per Order</label>
              <input id="min-per-order-26"
                type="number"
                min="1"
                value={tier.min_per_order}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], min_per_order: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>

            <div>
              <label htmlFor="max-per-order-27" className="block text-xs font-medium text-ink-600 mb-1">Max per Order</label>
              <input id="max-per-order-27"
                type="number"
                min="1"
                value={tier.max_per_order}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], max_per_order: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="description-optional-28" className="block text-xs font-medium text-ink-600 mb-1">Description (optional)</label>
              <input id="description-optional-28"
                type="text"
                value={tier.description}
                onChange={e => {
                  const tiers = [...formData.ticket_tiers]
                  tiers[idx] = { ...tiers[idx], description: e.target.value }
                  set('ticket_tiers', tiers)
                }}
                placeholder="What's included in this ticket?"
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => {
          set('ticket_tiers', [...formData.ticket_tiers, newTier(formData.ticket_tiers.length)])
        }}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-ink-200 px-4 py-3 text-sm font-medium text-ink-600 hover:border-gold-400 hover:text-gold-500 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Ticket Tier
      </button>

      {/* Squad Booking */}
      <div className="rounded-lg border border-ink-200 p-5">
        <label className="flex cursor-pointer items-start gap-4 min-h-[44px]">
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink-900">Enable Squad Booking</p>
            <p className="mt-1 text-xs text-ink-400">
              Allow buyers to start a squad with friends and split payment. Each member pays
              their own share. Unfilled squads are automatically refunded after the fill window.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={formData.squad_booking_enabled}
            aria-label="Enable squad booking"
            onClick={() => set('squad_booking_enabled', !formData.squad_booking_enabled)}
            className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 ${
              formData.squad_booking_enabled ? 'bg-gold-500' : 'bg-ink-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                formData.squad_booking_enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </label>

        {formData.squad_booking_enabled && (
          <div className="mt-4 border-t border-ink-100 pt-4">
            <label htmlFor="squad-fill-window-hours-1-72-29" className="block text-xs font-medium text-ink-600 mb-1.5">
              Squad fill window
              <span className="ml-1.5 font-normal text-ink-400">(hours, 1-72)</span>
            </label>
            <input id="squad-fill-window-hours-1-72-29"
              type="number"
              min="1"
              max="72"
              value={formData.squad_timeout_hours}
              onChange={e => {
                const raw = e.target.value
                // Allow free typing; clamp only on buildPayload
                set('squad_timeout_hours', raw)
              }}
              onBlur={e => {
                const val = parseInt(e.target.value)
                if (isNaN(val) || val < 1) set('squad_timeout_hours', '1')
                else if (val > 72) set('squad_timeout_hours', '72')
              }}
              className="w-28 rounded-lg border border-ink-200 px-3 py-2 text-base focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
            <p className="mt-1.5 text-xs text-ink-400">
              Friends have this long to join after the squad is created. Default is 24 hours.
            </p>
          </div>
        )}
      </div>

      {/* Virtual Queue */}
      <div className="rounded-lg border border-ink-200 p-5">
        <label className="flex cursor-pointer items-start gap-4 min-h-[44px]">
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink-900">Enable Virtual Queue</p>
            <p className="mt-1 text-xs text-ink-400">
              For high-demand events. Attendees join a FIFO waiting room before reaching
              checkout. Prevents site crashes and bot scalping.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={formData.is_high_demand}
            aria-label="Enable virtual queue"
            onClick={() => set('is_high_demand', !formData.is_high_demand)}
            className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 ${
              formData.is_high_demand ? 'bg-gold-500' : 'bg-ink-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                formData.is_high_demand ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </label>

        {formData.is_high_demand && (
          <div className="mt-4 border-t border-ink-100 pt-4">
            <div>
              <label htmlFor="checkout-window-mins-5-60-30" className="block text-xs font-medium text-ink-600 mb-1.5">
                Checkout window
                <span className="ml-1 font-normal text-ink-400">(mins, 5-60)</span>
              </label>
              <input id="checkout-window-mins-5-60-30"
                type="number"
                min="5"
                max="60"
                value={formData.queue_admission_window_minutes}
                onChange={e => set('queue_admission_window_minutes', e.target.value)}
                onBlur={e => {
                  const val = parseInt(e.target.value)
                  if (isNaN(val) || val < 5) set('queue_admission_window_minutes', '5')
                  else if (val > 60) set('queue_admission_window_minutes', '60')
                }}
                className="w-full sm:max-w-xs rounded-lg border border-ink-200 px-3 py-2 text-base focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
              <p className="mt-1 text-xs text-ink-400">Time to complete purchase once admitted.</p>
            </div>
          </div>
        )}
      </div>

      {/* Booking fee: who pays (per-event). Pass-on is the default so the
          organiser keeps the full face value; absorb deducts the fee from the
          payout. The buyer always sees the true all-in total before checkout.
          ONE fee since 15 August 2026: card processing is inside it, so no
          surface may name a separate processing charge. */}
      <div className="rounded-lg border border-ink-200 p-5">
        <p className="text-sm font-semibold text-ink-900">Booking fee</p>
        <p className="mt-1 text-xs text-ink-400">
          Choose who pays the EventLinqs service fee, which includes card
          processing. Free tickets are never charged a fee.
        </p>
        <div className="mt-4 space-y-3">
          {([
            {
              value: 'pass_to_buyer',
              label: 'Pass the fee to the buyer (recommended)',
              desc: 'The buyer pays the fee on top at checkout and you keep the full ticket face value. The all-in total is shown to the buyer up front.',
            },
            {
              value: 'absorb',
              label: 'Absorb the fee',
              desc: 'The buyer pays only the ticket price and the fee is deducted from your payout.',
            },
          ] as { value: FeePassType; label: string; desc: string }[]).map(opt => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 p-4 hover:bg-ink-100"
            >
              <input
                type="radio"
                name="fee_pass_type"
                value={opt.value}
                checked={formData.fee_pass_type === opt.value}
                onChange={() => set('fee_pass_type', opt.value)}
                className="mt-0.5 h-4 w-4 border-ink-200 text-gold-500 focus:ring-gold-500"
              />
              <div>
                <p className="text-sm font-medium text-ink-900">{opt.label}</p>
                <p className="text-xs text-ink-400">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {/* THE PER-EVENT REFUND POLICY.
          *  Sits with the fee setting because both are money terms the buyer sees
          *  before paying. Two modes, matching Eventbrite: allow refunds up to N
          *  days before, or no refunds. The self-service switch is the Humanitix
          *  model, where a qualifying request refunds itself.
          *
          *  THE ONE-WAY WARNING IS SHOWN HERE, not discovered on save. Once the
          *  event is published the policy may only become MORE generous, because
          *  buyers paid under the terms shown at the time. */}
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-ink-900">Refund policy</h3>
          <p className="mt-1 text-xs text-ink-400">
            Shown on your event page before anyone buys, and in every confirmation email.
            Once this event is published you can only make it more generous.
          </p>

          <div className="mt-4 space-y-3">
            {([
              {
                value: 'days_before' as const,
                label: 'Allow refund requests (recommended)',
                desc: 'Buyers can ask for a refund up until a cut-off you choose.',
              },
              {
                value: 'no_refunds' as const,
                label: 'No refunds',
                desc: 'Buyers cannot request a refund. If you cancel the event they are still refunded in full, which no policy can override.',
              },
            ]).map(opt => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 p-4 hover:bg-ink-100"
              >
                <input
                  type="radio"
                  name="refund_policy_type"
                  value={opt.value}
                  checked={formData.refund_policy_type === opt.value}
                  onChange={() => set('refund_policy_type', opt.value)}
                  className="mt-0.5 h-4 w-4 border-ink-200 text-gold-500 focus:ring-gold-500"
                />
                <div>
                  <p className="text-sm font-medium text-ink-900">{opt.label}</p>
                  <p className="text-xs text-ink-400">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {formData.refund_policy_type === 'days_before' && (
            <div className="mt-4 rounded-lg border border-ink-200 p-4">
              <label htmlFor="refund_policy_days" className="block text-sm font-medium text-ink-900">
                Cut-off, in days before the event starts
              </label>
              <input
                id="refund_policy_days"
                type="number"
                min={0}
                max={365}
                value={formData.refund_policy_days}
                onChange={e => set('refund_policy_days', Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
                className="mt-2 w-32 rounded-lg border border-ink-200 p-2.5 text-sm text-ink-900"
              />
              <p className="mt-2 text-xs text-ink-400">
                {formData.refund_policy_days === 0
                  ? 'Buyers can ask right up until the event starts. This is the most generous setting.'
                  : `Buyers can ask until ${formData.refund_policy_days} day${formData.refund_policy_days === 1 ? '' : 's'} before the event. A SMALLER number is more generous, because it lets people ask later.`}
              </p>

              <label htmlFor="refund-qualifying-requests-automatically-33" className="mt-4 flex cursor-pointer items-start gap-3">
                <input id="refund-qualifying-requests-automatically-33"
                  type="checkbox"
                  checked={formData.refund_policy_self_service}
                  onChange={e => set('refund_policy_self_service', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-ink-200 text-gold-500 focus:ring-gold-500"
                />
                <span>
                  <span className="block text-sm font-medium text-ink-900">Refund qualifying requests automatically</span>
                  <span className="block text-xs text-ink-400">
                    A request inside your cut-off is refunded straight away without waiting on you.
                    Anything outside it still comes to you to decide.
                  </span>
                </span>
              </label>

              <label htmlFor="cover-the-booking-fee-on-refunds-the-buy-34" className="mt-4 flex cursor-pointer items-start gap-3">
                <input id="cover-the-booking-fee-on-refunds-the-buy-34"
                  type="checkbox"
                  checked={formData.refund_policy_absorb_fee}
                  onChange={e => set('refund_policy_absorb_fee', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-ink-200 text-gold-500 focus:ring-gold-500"
                />
                <span>
                  <span className="block text-sm font-medium text-ink-900">Cover the booking fee on refunds</span>
                  <span className="block text-xs text-ink-400">
                    The buyer gets the full ticket price back and you carry the fee. Leave this off and the fee is retained.
                  </span>
                </span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderStep6 = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-ink-600 mb-3">Visibility</label>
        <div className="space-y-3">
          {([
            { value: 'public', label: 'Public', desc: 'Listed on EventLinqs and visible to everyone' },
            { value: 'private', label: 'Private', desc: 'Only visible to invited attendees' },
            { value: 'unlisted', label: 'Unlisted', desc: 'Accessible via direct link only, not listed publicly' },
          ] as { value: EventVisibility; label: string; desc: string }[]).map(opt => (
            <label key={opt.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 p-4 hover:bg-ink-100">
              <input
                type="radio"
                name="visibility"
                value={opt.value}
                checked={formData.visibility === opt.value}
                onChange={() => set('visibility', opt.value)}
                className="mt-0.5 h-4 w-4 border-ink-200 text-gold-500 focus:ring-gold-500"
              />
              <div>
                <p className="text-sm font-medium text-ink-900">{opt.label}</p>
                <p className="text-xs text-ink-400">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="age-restriction-applies-36" className="flex items-center gap-3 cursor-pointer">
          <input id="age-restriction-applies-36"
            type="checkbox"
            checked={formData.is_age_restricted}
            onChange={e => set('is_age_restricted', e.target.checked)}
            className="h-4 w-4 rounded border-ink-200 text-gold-500 focus:ring-gold-500"
          />
          <span className="text-sm font-medium text-ink-600">Age restriction applies</span>
        </label>
        {formData.is_age_restricted && (
          <div className="mt-3 ml-7">
            <label htmlFor="minimum-age-37" className="block text-xs font-medium text-ink-600 mb-1">Minimum Age</label>
            <input id="minimum-age-37"
              type="number"
              min="1"
              max="99"
              value={formData.age_restriction_min}
              onChange={e => set('age_restriction_min', e.target.value)}
              className="w-24 rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
        )}
      </div>

      <div>
        <label htmlFor="max-event-capacity-optional-leave-blank--38" className="block text-sm font-medium text-ink-600 mb-1">
          Max Event Capacity
          <span className="ml-2 text-xs text-ink-400">Optional - leave blank if unlimited</span>
        </label>
        <input id="max-event-capacity-optional-leave-blank--38"
          type="number"
          min="1"
          value={formData.max_capacity}
          onChange={e => set('max_capacity', e.target.value)}
          placeholder="e.g. 500"
          className="w-full rounded-lg border border-ink-200 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
        />
      </div>

      <div className="rounded-lg border border-ink-200 p-4 space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={formData.has_reserved_seating}
            onClick={() => {
              set('has_reserved_seating', !formData.has_reserved_seating)
              if (formData.has_reserved_seating) {
                set('venue_id', '')
                set('seat_map_id', '')
              }
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              formData.has_reserved_seating ? 'bg-gold-500' : 'bg-ink-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                formData.has_reserved_seating ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <div>
            <p className="text-sm font-medium text-ink-900">Reserved seating</p>
            <p className="text-xs text-ink-400">Buyers pick specific seats from an interactive seat map</p>
          </div>
        </label>

        {formData.has_reserved_seating && (
          <div className="ml-14 space-y-3">
            {venues.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                No venues found. <a href="/dashboard/venues" target="_blank" rel="noopener noreferrer" className="underline">Create a venue</a> and import a seat map first.
              </p>
            ) : (
              <>
                <div>
                  <label htmlFor="venue-39" className="block text-xs font-medium text-ink-600 mb-1">Venue</label>
                  <select id="venue-39"
                    value={formData.venue_id}
                    onChange={e => {
                      set('venue_id', e.target.value)
                      set('seat_map_id', '')
                    }}
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                  >
                    <option value="">Select a venue…</option>
                    {venues.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>

                {formData.venue_id && (
                  <div>
                    <label htmlFor="seat-map-40" className="block text-xs font-medium text-ink-600 mb-1">Seat Map</label>
                    {(() => {
                      const venue = venues.find(v => v.id === formData.venue_id)
                      const maps = venue?.seat_maps ?? []
                      return maps.length === 0 ? (
                        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                          This venue has no seat maps yet. Create one in <a href="/dashboard/venues" target="_blank" rel="noopener noreferrer" className="underline">Venues</a> before continuing.
                        </p>
                      ) : (
                        <select id="seat-map-40"
                          value={formData.seat_map_id}
                          onChange={e => set('seat_map_id', e.target.value)}
                          className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                        >
                          <option value="">Select a seat map…</option>
                          {maps.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.total_seats} seats)
                            </option>
                          ))}
                        </select>
                      )
                    })()}
                  </div>
                )}
                {formData.seat_map_id && (() => {
                  // Capacity reconciliation: warn when the ticket capacity does
                  // not cover the chart's seats (the "see issue" check), using
                  // the selected map's seat count and the entered tier
                  // capacities. Seated tiers bind by name; this is the coverage
                  // signal an organiser needs before publishing.
                  const venue = venues.find(v => v.id === formData.venue_id)
                  const map = venue?.seat_maps?.find(m => m.id === formData.seat_map_id)
                  const seatCount = map?.total_seats ?? 0
                  const tierCapacity = formData.ticket_tiers.reduce((s, t) => s + (parseInt(t.total_capacity) || 0), 0)
                  if (seatCount === 0) return null
                  const covered = tierCapacity >= seatCount
                  const shortfall = seatCount - tierCapacity
                  return (
                    <div className={`rounded-lg px-3 py-2 text-xs ${covered ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                      {covered
                        ? `Capacity check: your tickets cover all ${seatCount} seats in this chart.`
                        : `Capacity check: this chart has ${seatCount} seats but your tickets only cover ${tierCapacity}.`}
                      {!covered && (
                        <button
                          type="button"
                          onClick={() => {
                            // One-action fix: raise the first tier's capacity by
                            // the shortfall so every seat can sell.
                            const tiers = formData.ticket_tiers.map((t, i) =>
                              i === 0
                                ? { ...t, total_capacity: ((parseInt(t.total_capacity) || 0) + shortfall).toString() }
                                : t,
                            )
                            set('ticket_tiers', tiers)
                          }}
                          className="ml-2 rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                        >
                          Fix it: add {shortfall} to {formData.ticket_tiers[0]?.name || 'the first tier'}
                        </button>
                      )}
                    </div>
                  )
                })()}
                <label htmlFor="i-apos-ll-assign-seats-myself-buyers-pur-41" className="flex items-start gap-3 rounded-lg border border-ink-100 bg-ink-50/50 p-3">
                  <input id="i-apos-ll-assign-seats-myself-buyers-pur-41"
                    type="checkbox"
                    checked={formData.organiser_assigns_seats}
                    onChange={e => set('organiser_assigns_seats', e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-ink-300 text-gold-500 focus:ring-gold-400"
                  />
                  <span className="text-sm text-ink-700">
                    <span className="font-medium text-ink-900">I&apos;ll assign seats myself</span>
                    <span className="block text-xs text-ink-500">
                      Buyers purchase tickets without picking seats; you allocate seats from Seat Management
                      after each sale. Tickets, QR codes and the door scan update the moment you assign.
                    </span>
                  </span>
                </label>
                <label htmlFor="let-attendees-change-their-own-seat-buye-42" className="flex items-start gap-3 rounded-lg border border-ink-100 bg-ink-50/50 p-3">
                  <input id="let-attendees-change-their-own-seat-buye-42"
                    type="checkbox"
                    checked={formData.allow_seat_self_service}
                    onChange={e => set('allow_seat_self_service', e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-ink-300 text-gold-500 focus:ring-gold-400"
                  />
                  <span className="text-sm text-ink-700">
                    <span className="font-medium text-ink-900">Let attendees change their own seat</span>
                    <span className="block text-xs text-ink-500">
                      Buyers can move themselves to another available seat after purchase. Their ticket updates
                      automatically. Great for friends who want to sit together.
                    </span>
                  </span>
                </label>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )

  const renderStep7 = () => {
    const totalCapacity = formData.ticket_tiers.reduce(
      (sum, t) => sum + (parseInt(t.total_capacity) || 0), 0
    )
    // Free means EVERY tier is $0 (the fee-system definition), not just the
    // cheapest tier: an event with a free tier plus paid tiers is a paid event.
    const tierPrices = formData.ticket_tiers.map(t => parseFloat(t.price) || 0)
    const isFree = tierPrices.length === 0 || tierPrices.every(p => p === 0)
    const minPaidPrice = isFree ? 0 : Math.min(...tierPrices.filter(p => p > 0))

    return (
      <div className="space-y-6">
        {editMode && existingStatus === 'published' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This event is live. Changes you save will be visible to the public immediately.
          </div>
        )}

        <div className="rounded-lg border border-ink-200 divide-y divide-ink-100">
          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-3">Basic Details</h3>
            <p className="text-sm font-semibold text-ink-900">{formData.title || <em className="text-ink-400">Untitled</em>}</p>
            {formData.summary && <p className="mt-1 text-sm text-ink-600">{formData.summary}</p>}
            {formData.tags && <p className="mt-1 text-xs text-ink-400">Tags: {formData.tags}</p>}
          </div>

          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-2">Date & Time</h3>
            <p className="text-sm text-ink-600">
              {formData.start_date ? formatPlatformDateTime(formData.start_date) : ':'} →{' '}
              {formData.end_date ? formatPlatformDateTime(formData.end_date) : ':'}
            </p>
            <p className="text-xs text-ink-400">{formData.timezone}</p>
          </div>

          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-2">Location</h3>
            <p className="text-sm text-ink-600 capitalize">{formData.event_type.replace('_', ' ')}</p>
            {formData.venue_name && <p className="text-sm text-ink-600">{formData.venue_name}</p>}
            {formData.venue_city && (
              <p className="text-xs text-ink-400">
                {[formData.venue_city, formData.venue_state, formData.venue_country].filter(Boolean).join(', ')}
              </p>
            )}
          </div>

          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-2">Tickets</h3>
            <p className="text-sm text-ink-600">
              {formData.ticket_tiers.length} tier{formData.ticket_tiers.length !== 1 ? 's' : ''} · {totalCapacity.toLocaleString('en-AU')} total capacity
            </p>
            <p className="text-xs text-ink-400">
              {isFree ? 'Free event' : `From ${formData.ticket_tiers[0]?.currency} ${minPaidPrice.toFixed(2)}`}
            </p>
          </div>

          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-2">Media</h3>
            <p className="text-sm text-ink-600">
              {formData.media[0]?.url
                ? `Cover set${formData.media.length > 1 ? ` + ${formData.media.length - 1} gallery image${formData.media.length - 1 === 1 ? '' : 's'}` : ''}`
                : 'No cover yet'}
            </p>
            {formData.video_url.trim() && <p className="text-xs text-ink-400">Video linked</p>}
          </div>

          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-2">Settings</h3>
            <p className="text-sm text-ink-600 capitalize">{formData.visibility}</p>
            {formData.is_age_restricted && (
              <p className="text-xs text-ink-400">Age restricted: {formData.age_restriction_min}+</p>
            )}
          </div>
        </div>

        {!formData.media[0]?.url && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Add a cover image in the Event Media step before publishing. You can still save as a draft.
          </div>
        )}

        {error && (
          /*
           * role=alert so the refusal is ANNOUNCED, not just rendered. An
           * organiser at the bottom of a seven-step wizard pressing Publish, and
           * anyone using a screen reader, previously got no signal at all that
           * the press had been refused.
           *
           * The link is the gate's own nextAction. It already knew where to send
           * them; the caller used to throw it away, so "Connect Stripe" was
           * advice with no door.
           */
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            {errorAction && (
              <a href={errorAction.href} className="ml-2 font-semibold underline underline-offset-2">
                {errorAction.label}
              </a>
            )}
          </div>
        )}

        {launchKitEnabled && !editMode && (
          <div className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-3 text-sm text-ink-900">
            <span className="font-semibold">Publishing delivers your launch kit:</span>{' '}
            your live page link, a print-ready QR poster, share cards and captions for every
            channel, and the tickets each channel sold you, all on one screen.
          </div>
        )}

        {/* The lineup loop prompt. The event row does not exist until this
            submit, so tagging itself lives on the kit that publishing opens;
            this sets the expectation and sells the benefit in the organiser's
            own terms. */}
        {lineupEnabled && (
          <div className="rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900">
            <span className="font-semibold">Playing with other acts?</span>{' '}
            Tag them on your lineup {editMode ? 'from your event dashboard' : 'on the next screen'}.
            Each act gets their own tracked share link and their own spot on your event page, so
            they sell to their following and you see exactly how many tickets each one brought.
          </div>
        )}

        {/*
          AN HONEST DISABLED STATE.

          Found 3 September 2026: this button was disabled only for isSubmitting,
          an empty title and a missing cover. An organiser with a PAID tier and no
          connected Stripe account saw a live, gold, clickable Publish button,
          pressed it, and was refused by the server.

          The refusal was announced and carried a link, which is good, but the
          control still looked available right up to the press. A button that
          cannot do the thing it names should say so before it is pressed.

          THIS DOES NOT REPLACE THE GUARD. checkPublishGate on the server is
          still the only thing that decides, and it re-reads Stripe before it
          refuses. This is presentation catching up with a decision already made
          server-side, which is why canSellPaid defaults to true: if the page did
          not resolve it, the button behaves exactly as it did before and the
          server still refuses. It can never create a refusal of its own.
        */}
        {paidPublishBlocked && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">This event has a paid ticket, so it needs Stripe connected before it can go live.</span>{' '}
            Save it as a draft now, connect Stripe, and publish when you come back.
            <a href="/dashboard/payouts" className="ml-2 font-semibold underline underline-offset-2">
              Connect Stripe
            </a>
          </div>
        )}

        {streamLinkMissing && (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">{STREAM_LINK_REQUIRED_MESSAGE}</span>{' '}
            Save as a draft, add the link on the location step, and publish when it is there.
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => handleSubmit('draft')}
            disabled={isSubmitting}
            className="flex-1 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-600 hover:bg-ink-100 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Saving…' : 'Save as Draft'}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit('published')}
            disabled={isSubmitting || !formData.title.trim() || !formData.media[0]?.url || formData.media.some(m => m.uploading) || paidPublishBlocked || streamLinkMissing}
            className="flex-1 rounded-lg bg-gold-500 px-4 py-3 text-sm font-medium text-ink-900 hover:bg-gold-600 disabled:opacity-50 transition-colors"
          >
            {isSubmitting
              ? 'Publishing…'
              : editMode
              ? 'Save Changes'
              : launchKitEnabled
              ? 'Publish and get your launch kit'
              : 'Publish Now'}
          </button>
        </div>
      </div>
    )
  }

  const stepContent = [
    renderStep1,
    renderStep2,
    renderStep3,
    renderStep4,
    renderStep5,
    renderStep6,
    renderStep7,
  ]

  return (
    <div className="mx-auto max-w-2xl">
      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-ink-400">Step {step} of {STEPS.length}</span>
          <span className="text-sm font-medium text-ink-900">{STEPS[step - 1]}</span>
        </div>
        <div className="flex gap-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < step ? 'bg-gold-500' : i === step - 1 ? 'bg-gold-400' : 'bg-ink-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ink-900 mb-6">{STEPS[step - 1]}</h2>
        {stepContent[step - 1]()}
      </div>

      {/* Navigation */}
      {step < 7 && (
        <>
          {stepError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {stepError}
            </div>
          )}
          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={() => { setStep(s => Math.max(s - 1, 1)); setStepError(null) }}
              disabled={step === 1}
              className="rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-medium text-ink-600 hover:bg-ink-100 disabled:invisible transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleContinue}
              className="rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-medium text-ink-900 hover:bg-gold-600 transition-colors"
            >
              Continue
            </button>
          </div>
        </>
      )}

      {step === 7 && (
        <div className="mt-6 flex justify-start">
          <button
            type="button"
            onClick={() => setStep(s => Math.max(s - 1, 1))}
            className="rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-medium text-ink-600 hover:bg-ink-100 transition-colors"
          >
            Back
          </button>
        </div>
      )}
    </div>
  )
}
