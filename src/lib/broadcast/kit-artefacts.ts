import { createAdminClient } from '@/lib/supabase/admin'
import { ARTEFACT_CHANNELS } from '@/lib/broadcast/artefact-channels'
import { broadcastCta, broadcastPriceLabel } from '@/lib/broadcast/price-line'
import type { Cta } from '@/lib/events/cta'
import { buildShortUrl, getOrCreateShareLink, type ShareChannel } from '@/lib/broadcast/share-links'
import type { CaptionInput, CaptionPlatform } from '@/lib/broadcast/captions'
import type { SocialCardInput } from '@/lib/broadcast/social-cards'
import { stripMarkdown } from '@/lib/prose/markdown-subset'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { artefactOrganiser } from './artefact-organiser'

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
  /**
   * Sold on another site (WI3: external_ticket_url), so not ticketed here: its card says "Listed on EVENTLINQS" and
   * "Scan for details", never "Ticketing by" or "Scan to buy". Absent where a context is built by hand.
   */
  listing?: boolean
  /** The call to action every artefact says (src/lib/events/cta.ts). Absent where a context is built by hand. */
  cta?: Cta
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

/**
 * The channels an artefact can be minted for. ONE list, defined in
 * src/lib/broadcast/artefact-channels.ts (pure, so a script outside the bundle
 * can read it) and re-exported here so every existing import keeps reading the
 * same array.
 */
export { ARTEFACT_CHANNELS }

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
  ticket_tiers: { price: number; currency: string | null; is_active?: boolean | null }[] | null
  is_free: boolean | null
  entry_mode: string | null
  organisation: { name: string | null; logo_url: string | null } | null
  listing_source: string | null
  external_ticket_url: string | null
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
  const data = await readOrThrow('the launch kit event', () =>
    admin
      .from('events')
      .select(
        'slug, title, start_date, timezone, cover_image_url, venue_name, venue_city, summary, organisation_id, listing_source, external_ticket_url, is_free, entry_mode, category:event_categories(name, slug), ticket_tiers(price, currency, is_active), organisation:organisations(name, logo_url)',
      )
      .eq('id', eventId)
      .maybeSingle(),
  )
  const event = data as EventRow | null
  if (!event) return null

  const { dateLabel, shortDateLabel, timeLabel } = formatParts(event.start_date, event.timezone)
  const eventUrl = `${origin}/events/${event.slug}`

  const links = { fallback: eventUrl } as ArtefactContext['links']
  for (const platform of ARTEFACT_CHANNELS) links[platform] = eventUrl
  links.qr = eventUrl

  if (mintLinks) {
    // Every artefact channel, plus the QR the poster carries. The six are the
    // one list; this used to be a fourth hand-typed copy of it.
    const channels: ShareChannel[] = [...ARTEFACT_CHANNELS, 'qr']
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
  const organiser = artefactOrganiser(event, fallbackOrganiserName)
  const categoryName = event.category?.name ?? null
  const eyebrow = [categoryName, city].filter(Boolean).join(' · ') || 'Live event'
  const cta = broadcastCta(event)

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
    priceLabel: broadcastPriceLabel(event),
    listing: !cta.ticketingByEventLinqs,
    cta,
    // Composed onto a printed poster and a story card, so markdown here is
    // asterisks in ink. Law 6 renders what the organiser supplies; it does not
    // render their syntax (UX1.1).
    summary: stripMarkdown(event.summary) || null,
    categorySlug: event.category?.slug ?? null,
    categoryName,
    // An EventLinqs listing names its host, never the listings organisation.
    organiserName: organiser.name,
    organiserLogoUrl: organiser.logoUrl,
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
    ...(context.listing ? { listing: true } : {}),
    ...(context.cta ? { scanLabel: context.cta.scan } : {}),
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
    ...(context.cta ? { cta: context.cta } : {}),
  }
}
