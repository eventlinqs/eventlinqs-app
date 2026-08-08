import { createAdminClient } from '@/lib/supabase/admin'
import { priceLabel } from '@/lib/events/price-label'
import { buildShortUrl, getOrCreateShareLink, type ShareChannel } from '@/lib/broadcast/share-links'
import type { CaptionInput, CaptionPlatform } from '@/lib/broadcast/captions'
import type { SocialCardInput } from '@/lib/broadcast/social-cards'

/**
 * ONE source for everything the artefacts are made of.
 *
 * The card renderer, the caption engine and the kit screen all describe the
 * same event, so they all read it here. Two surfaces reading the event twice is
 * how a poster ends up saying something the caption does not.
 */

export type ArtefactContext = {
  eventId: string
  slug: string
  title: string
  /** "Saturday 12 September" */
  dateLabel: string
  /** "Sat 12 Sep" */
  shortDateLabel: string
  /** "8:00 pm" */
  timeLabel: string
  venueName: string | null
  city: string | null
  placeLabel: string
  priceLabel: string
  summary: string | null
  categorySlug: string | null
  categoryName: string | null
  organiserName: string
  organiserLogoUrl: string | null
  coverImageUrl: string | null
  /** The gold chip on every card: what it is and where it is. */
  eyebrow: string
  /** Tracked short link per channel, plus the plain event URL as the floor. */
  links: Record<CaptionPlatform, string> & { fallback: string; qr: string }
}

/** The channels an artefact can be minted for, and their caption platform. */
export const ARTEFACT_CHANNELS: readonly CaptionPlatform[] = [
  'instagram',
  'facebook',
  'whatsapp',
  'x',
  'linkedin',
  'email',
]

function formatParts(iso: string | null, timezone: string | null) {
  if (!iso) return { dateLabel: '', shortDateLabel: '', timeLabel: '' }
  const zone = timezone ?? 'Australia/Melbourne'
  const date = new Date(iso)
  const dateLabel = new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: zone,
  }).format(date)
  const shortDateLabel = new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: zone,
  }).format(date)
  const timeLabel = new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: zone,
  })
    .format(date)
    .toLowerCase()
  return { dateLabel, shortDateLabel, timeLabel }
}

type EventRow = {
  slug: string
  title: string
  start_date: string | null
  timezone: string | null
  cover_image_url: string | null
  venue_name: string | null
  venue_city: string | null
  summary: string | null
  organisation_id: string | null
  category: { name: string | null; slug: string | null } | null
  ticket_tiers: { price: number; currency: string | null }[] | null
  organisation: { name: string | null; logo_url: string | null } | null
}

/**
 * Load the context and mint the tracked link for every channel. Links are
 * minted once and reused (getOrCreateShareLink), so the same channel always
 * gets the same code and the reach panel stays one row per channel.
 */
export async function loadArtefactContext(
  eventId: string,
  origin: string,
  createdBy: string | null,
  fallbackOrganiserName: string,
  /**
   * Mint tracked links. False when the broadcast feature is off, in which case
   * every artefact carries the plain event URL: still a working link, still a
   * sale, simply not attributed. Nothing is written to share_links.
   */
  mintLinks = true,
): Promise<ArtefactContext | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select(
      'slug, title, start_date, timezone, cover_image_url, venue_name, venue_city, summary, organisation_id, category:event_categories(name, slug), ticket_tiers(price, currency), organisation:organisations(name, logo_url)',
    )
    .eq('id', eventId)
    .maybeSingle()
  const event = data as EventRow | null
  if (!event) return null

  const { dateLabel, shortDateLabel, timeLabel } = formatParts(event.start_date, event.timezone)
  const eventUrl = `${origin}/events/${event.slug}`

  const links = { fallback: eventUrl } as ArtefactContext['links']
  for (const platform of ARTEFACT_CHANNELS) links[platform] = eventUrl
  links.qr = eventUrl

  if (mintLinks) {
    const channels: ShareChannel[] = [
      'instagram',
      'facebook',
      'whatsapp',
      'x',
      'linkedin',
      'email',
      'qr',
    ]
    // Minted in parallel and reused, so the same channel always resolves to the
    // same code and the reach panel stays one row per channel.
    const minted = await Promise.all(
      channels.map(channel =>
        getOrCreateShareLink({
          eventId,
          channel,
          createdBy,
          eventSlug: event.slug,
          eventStartDate: event.start_date,
          eventTimezone: event.timezone,
        }).then(link => ({
          channel,
          link,
        })),
      ),
    )
    for (const { channel, link } of minted) {
      if (!link) continue
      links[channel as keyof ArtefactContext['links']] = buildShortUrl(origin, link.code)
    }
  }

  const city = event.venue_city ?? null
  const categoryName = event.category?.name ?? null
  const eyebrow = [categoryName, city].filter(Boolean).join(' · ') || 'Live event'

  return {
    eventId,
    slug: event.slug,
    title: event.title,
    dateLabel,
    shortDateLabel,
    timeLabel,
    venueName: event.venue_name ?? null,
    city,
    placeLabel: [event.venue_name, city].filter(Boolean).join(', '),
    priceLabel: priceLabel(event.ticket_tiers ?? [], 'Free entry'),
    summary: event.summary ?? null,
    categorySlug: event.category?.slug ?? null,
    categoryName,
    organiserName: event.organisation?.name ?? fallbackOrganiserName,
    organiserLogoUrl: event.organisation?.logo_url ?? null,
    coverImageUrl: event.cover_image_url ?? null,
    eyebrow,
    links,
  }
}

/** The card renderer's view of the context, for one channel's tracked link. */
export function toCardInput(
  context: ArtefactContext,
  channel: CaptionPlatform | 'qr',
): Omit<SocialCardInput, 'cover' | 'qr' | 'organiserLogo'> {
  return {
    title: context.title,
    dateLabel: context.dateLabel,
    timeLabel: context.timeLabel,
    placeLabel: context.placeLabel,
    priceLabel: context.priceLabel,
    shortUrl: context.links[channel] ?? context.links.fallback,
    eyebrow: context.eyebrow,
    organiserName: context.organiserName,
  }
}

/** The caption engine's view of the same context. */
export function toCaptionInput(context: ArtefactContext): CaptionInput {
  return {
    title: context.title,
    summary: context.summary,
    dateLabel: context.dateLabel,
    timeLabel: context.timeLabel,
    shortDateLabel: context.shortDateLabel,
    venueName: context.venueName,
    city: context.city,
    priceLabel: context.priceLabel,
    organiserName: context.organiserName,
    categorySlug: context.categorySlug,
    links: context.links,
  }
}
