import { buildCaptions, type CaptionInput } from '@/lib/broadcast/captions'
import { buttonOf, priceToShow, PROVIDER_NAMES, type BookingLink } from '@/lib/events/booking-links'
import { ctaFor, ctaPriceLine, type Cta } from '@/lib/events/cta'
import { outboundHost } from '@/lib/listings/outbound'
import type { SocialFormat, SocialPlatform } from './cadence'

/**
 * WHAT EVENTLINQS POSTS THIS WEEK, AND WHAT EACH POST MAY SAY (item 11, the social engine; docs/SOCIAL-ENGINE.md).
 *
 * Ported from Bookedproof's src/lib/social/plan.ts. Each post is planned from the listing's own row and rendered by the
 * Launch Kit (the card through src/lib/broadcast/social-cards.tsx, the words through src/lib/broadcast/captions.ts), so
 * nothing is generated and nothing is typed: the post states the event's own name, date, place and price line and
 * carries its own tracked link. Two formats per event on Instagram, the 4:5 feed card (Meta: "Must be within a 4:5 to 1.91:1
 * range", https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media, as
 * src/lib/broadcast/social-card-spec.ts quotes it) and the story.
 *
 * WHO IS POSTED. A published, public event starting within the next seven days that has not ended, has not sold out
 * and has no post yet on that network and format; with its photo first, then the soonest. An unlisted event (AMCF's
 * page) is never posted: its owner chose not to be found.
 *
 * Pure: the reads and writes are src/lib/social/store.ts's.
 */

export const PLAN_AHEAD_DAYS = 7
export const PLATFORMS: readonly SocialPlatform[] = ['instagram']
export const FORMATS: readonly SocialFormat[] = ['feed', 'story']

export interface PlanCandidate {
  readonly eventId: string
  readonly title: string
  readonly startDate: string
  readonly endDate: string
  readonly status: string
  readonly visibility: string
  readonly city: string | null
  readonly hasPhoto: boolean
  readonly soldOut: boolean
}

export interface PlanItem {
  readonly eventId: string
  readonly platform: SocialPlatform
  readonly format: SocialFormat
}

export const postKey = (eventId: string, platform: SocialPlatform, format: SocialFormat): string => `${eventId}|${platform}|${format}`

/** The posts to plan now, each event once per network and format, photo first then soonest. */
export function plan(candidates: readonly PlanCandidate[], planned: ReadonlySet<string>, now: Date): PlanItem[] {
  const until = now.getTime() + PLAN_AHEAD_DAYS * 86_400_000
  const due = candidates
    .filter((c) => c.status === 'published' && c.visibility === 'public' && !c.soldOut)
    .filter((c) => new Date(c.endDate).getTime() > now.getTime() && new Date(c.startDate).getTime() <= until)
    .sort((a, b) => Number(b.hasPhoto) - Number(a.hasPhoto) || a.startDate.localeCompare(b.startDate) || a.eventId.localeCompare(b.eventId))
  const out: PlanItem[] = []
  for (const c of due)
    for (const platform of PLATFORMS)
      for (const format of FORMATS) if (!planned.has(postKey(c.eventId, platform, format))) out.push({ eventId: c.eventId, platform, format })
  return out
}

const dollars = (cents: number): string => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`)

/** A listing EventLinqs does not ticket: its call to action from the button WI3 chose (src/lib/events/cta.ts). */
export function listingCta(links: readonly BookingLink[], isFree: boolean | null): Cta {
  const button = buttonOf(links)
  return ctaFor({
    isFree,
    externalTicketUrl: button?.url ?? null,
    externalKind: button?.kind ?? null,
    providerName: button ? (PROVIDER_NAMES[button.provider] ?? outboundHost(button.url)) : null,
  })
}

/**
 * The price line for a listing EventLinqs does not ticket, by the one call to action: the button's price where it was
 * read within the day (WI3's priceToShow), else where it sells; free only where the listing says so; else no price.
 */
export function listingPriceLabel(links: readonly BookingLink[], isFree: boolean | null, now: Date): string | null {
  const button = buttonOf(links)
  if (button !== null && button.availability === 'sold_out') return null
  const cents = button ? priceToShow(button, now) : null
  return ctaPriceLine(listingCta(links, isFree), { outsideChecked: cents !== null && cents > 0 ? `From ${dollars(cents)}` : null })
}

/** The listing's own words a post may state. */
export function factsOf(input: CaptionInput): string[] {
  return [input.title, input.dateLabel, input.timeLabel, input.shortDateLabel, input.venueName, input.city, input.priceLabel, input.summary, input.organiserName].filter(
    (f): f is string => typeof f === 'string' && f.trim() !== '',
  )
}

/** The Launch Kit's own caption for the network, carrying this post's link. */
export function kitCaption(input: CaptionInput, platform: SocialPlatform, link: string): string {
  const withLink: CaptionInput = { ...input, links: { ...input.links, [platform]: link, fallback: link } }
  const caption = buildCaptions(withLink).find((c) => c.platform === platform)
  if (caption === undefined) throw new Error(`the Launch Kit writes no ${platform} caption`)
  return caption.text
}
