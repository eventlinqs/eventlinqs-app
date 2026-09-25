/**
 * THE SCHEMA.ORG EVENT PAYLOAD. A PURE MODULE, ON PURPOSE.
 *
 * It lives in src/lib/seo rather than beside the component, and it carries no
 * JSX, because scripts/guards/event-structured-data.mjs EXECUTES it: it loads
 * this module through scripts/lib/src-alias-loader.mjs, which strips types but
 * does not transpile, so a module holding a React element cannot be reached by
 * a guard at all. A guard that can only grep is a guard that passes on a
 * serialiser emitting a hard-coded price.
 *
 * It builds the structured-data payload Google's rich-results pipeline
 * uses to surface event details directly in search (date, venue,
 * price, availability, organizer). Per the Batch 8.1 brief this is a
 * launch blocker - without it our event pages don't compete in
 * Google's event-rich-results carousel against Ticketmaster, DICE
 * and Eventbrite.
 *
 * The payload follows https://schema.org/Event with the recommended
 * sub-types (MusicEvent, ComedyEvent, etc.) when available, plus
 * Place + PostalAddress for venue, Organization for organizer, and
 * one Offer per available ticket tier with availability state.
 */

import type { Event, TicketTier, Organisation } from '@/types/database'
import { stripMarkdown } from '@/lib/prose/markdown-subset'
import { toZonedIso8601 } from '@/lib/dates/event-time'
import { pruneJsonLd } from '@/lib/seo/structured-data'

type EventStatus = 'upcoming' | 'sold-out' | 'cancelled' | 'postponed' | 'past'

/**
 * A tier as the PAGE shows it, which is not always as the row stores it.
 *
 * `display_price_cents` is what `resolvePrice` in src/app/events/[slug]/page.tsx
 * puts on the screen: a live demand-price move when one is running, the stored
 * price otherwise. It is optional here only so a caller with no dynamic pricing
 * in play can pass a bare row; every call site that HAS the displayed price must
 * hand it over, and the guard checks the event page does.
 */
type SchemaTier = Pick<TicketTier, 'id' | 'name' | 'price' | 'currency'> & {
  display_price_cents?: number
}

export interface EventSchemaProps {
  event: Event
  organisation: Pick<Organisation, 'name' | 'slug' | 'description'>
  ticketTiers: SchemaTier[]
  state: EventStatus
  baseUrl: string
  /**
   * The confirmed lineup, in billing order, for the `performer` property.
   *
   * Google documents `performer` as recommended: "The participants performing
   * at the event, such as artists and comedians. Use a nested PerformingGroup
   * or Person, one for each performer."
   * (developers.google.com/search/docs/appearance/structured-data/event,
   * fetched 2026-08-23.)
   *
   * A production audit on 23 August 2026 found this property missing on 36 of
   * 36 event pages, while the event page was ALREADY loading the lineup to
   * render it visibly. The data was on the page and simply never reached the
   * markup, so every event we publish was leaving its richest recommended
   * property empty on a platform whose lead category is music.
   */
  performers?: { id: string; slug: string; name: string }[]
}

/**
 * Drops keys whose value is null, undefined, or an empty/whitespace string, at
 * EVERY depth.
 *
 * WHY. The emitter used `?? ''` on every optional venue field, so an event with
 * no street address published `"streetAddress": ""` rather than omitting it. An
 * empty string is not "absent": it is a positive claim that the value is empty,
 * and validators read it as a malformed value rather than a missing optional
 * one. Omission is the honest encoding.
 *
 * IT USED TO STOP AT THE TOP LEVEL, and the push gate found out on 14 September
 * 2026: a ticket tier named '' put `Offer.name: ""` into a nested node this
 * function had already declared clean. The walk now lives in `pruneJsonLd`
 * (src/lib/seo/structured-data.ts) with the whole argument written beside it,
 * because `<JsonLd>` needs the same walk and two copies of a cleaning rule is
 * how two page types come to disagree about what clean means.
 */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return pruneJsonLd(obj) as Partial<T>
}

/**
 * ISO 3166-1 alpha-2 for the country, from whatever the organiser's form left in
 * the row.
 *
 * WHY. Production emits `"addressCountry": "Australia"`, because that is the raw
 * database value, and SEO1 step 3 asks for `AU`. A live Eventbrite AU event page
 * (fetched 2026-09-14, C:\dev\EVIDENCE\SEO1\eb-event.html) emits `"AU"`.
 *
 * ONLY the spellings of Australia are mapped, and anything else is passed
 * through UNCHANGED. Guessing a code for a country we have not seen is exactly
 * the "wrong address is worse than no address" failure step 8 forbids, and the
 * platform is Australian: a value that is not one of these is a data problem to
 * look at, not one to normalise away.
 */
function countryCode(raw: string | null | undefined): string | null | undefined {
  if (!raw) return raw
  const t = raw.trim()
  if (/^(au|aus|australia)$/i.test(t)) return 'AU'
  return t
}

/**
 * Does an event in this status get described to a search engine at all?
 *
 * SEO1 step 4: "An unpublished, draft or deleted event emits no markup at all."
 * A deleted event has no row to render, so the answer is the two unpublished
 * statuses plus archived, which is noindex and shown to a ticket holder only.
 *
 * CANCELLED, POSTPONED AND COMPLETED ALL STILL EMIT, and that is not an
 * oversight. Google is explicit that a cancelled event keeps its markup:
 * "Don't remove or change other properties (for example, don't remove startDate
 * or location); instead, keep all values as the same as they were before the
 * cancelation, and update the eventStatus to EventCancelled."
 * (developers.google.com/search/docs/appearance/structured-data/event, fetched
 * 2026-09-14.) Silently dropping the block is how a cancelled event stays listed
 * as scheduled in search for weeks.
 */
function statusIsDescribable(status: Event['status']): boolean {
  return status !== 'draft' && status !== 'scheduled' && status !== 'archived'
}

/**
 * An event with no physical place is not described at all, and this is the
 * SEO1 v2 correction rather than a preference.
 *
 * Google withdrew support for online events from its event structured data on
 * 5 June 2025, and with it every online-event property. The page now carries a
 * single note where the attendance-mode documentation used to be:
 *
 *   "June 05, 2025 ... Removing documentation for online events: We're
 *    deprecating the online events feature. ... While the properties are no
 *    longer documented, you can leave them on your site; it won't cause any
 *    issues."
 *   https://developers.google.com/search/docs/appearance/structured-data/event
 *   (fetched 2026-09-14, C:\dev\EVIDENCE\SEO1\google-event-docs-2026-09-14.html)
 *
 * SEO1 v2, FAULT ONE, in the owner's words: "Do not emit eventAttendanceMode
 * and do not emit any online event property."
 *
 * That leaves one honest answer for a `virtual` row and it is not "emit it
 * anyway". `location` is one of Google's four REQUIRED properties and it must
 * be a Place with a PostalAddress. An online event has no street, so the only
 * way to emit the block is to invent an address or to publish a Place carrying
 * nothing but `addressCountry: "AU"`, which says the event physically happens
 * somewhere in Australia. SEO1 step 8 forbids exactly that: "a wrong address is
 * worse than no address".
 *
 * So a virtual event emits no Event block. It keeps its canonical, its title,
 * its description, its Open Graph and Twitter cards, and its page: it is simply
 * not claimed to be eligible for an experience Google has withdrawn.
 *
 * A HYBRID event DOES emit, because it has a real venue. All 8 hybrid rows on
 * TEST carry a venue_address (enumerated 2026-09-14), and there are 0 virtual
 * rows, so nothing on the platform loses markup today. The rule is written for
 * the first virtual event an organiser creates, not for a row we already hold.
 */
function hasPhysicalPlace(eventType: Event['event_type']): boolean {
  return eventType !== 'virtual'
}

/** Map our event_type to a Schema.org sub-type when there's a clean match. */
function schemaEventType(eventCategorySlug: string | null | undefined): string {
  if (!eventCategorySlug) return 'Event'
  const slug = eventCategorySlug.toLowerCase()
  if (slug === 'music' || slug === 'concert') return 'MusicEvent'
  if (slug === 'comedy') return 'ComedyEvent'
  if (slug === 'theatre' || slug === 'theater') return 'TheaterEvent'
  if (slug === 'sport' || slug === 'sports') return 'SportsEvent'
  if (slug === 'festival') return 'Festival'
  if (slug === 'food-drink' || slug === 'food') return 'FoodEvent'
  return 'Event'
}

/** Map our event state to Schema.org eventStatus. */
function schemaEventStatus(state: EventStatus): string {
  switch (state) {
    case 'cancelled': return 'https://schema.org/EventCancelled'
    case 'postponed': return 'https://schema.org/EventPostponed'
    default: return 'https://schema.org/EventScheduled'
  }
}

/** Map per-tier availability. */
function schemaAvailability(state: EventStatus): string {
  if (state === 'sold-out') return 'https://schema.org/SoldOut'
  if (state === 'past') return 'https://schema.org/SoldOut'
  if (state === 'cancelled') return 'https://schema.org/SoldOut'
  return 'https://schema.org/InStock'
}

/**
 * Builds the JSON-LD payload. Exported as a PURE FUNCTION, separately from the
 * component, so the markup an event page will actually ship can be validated in
 * a unit test against Google's published required set rather than eyeballed or
 * grepped for in the source.
 *
 * tests/unit/seo/event-structured-data.test.ts runs the output of this function
 * through the same validator the production audit script uses
 * (scripts/verify/event-structured-data-audit.mjs), so the test and the audit
 * cannot drift into disagreeing about what "valid" means.
 */
export function buildEventSchemaPayload({
  event,
  organisation,
  ticketTiers,
  state,
  baseUrl,
  performers = [],
}: EventSchemaProps & { event: Event & { category?: { slug: string | null; name: string } | null } }) {
  // An event nobody can reach is not described to anybody. Returning null rather
  // than an "empty" payload means the caller needs no condition of its own:
  // <JsonLd> renders nothing for null, so a forgotten branch cannot ship an
  // invalid block. See statusIsDescribable for why cancelled is NOT in this set.
  if (!statusIsDescribable(event.status)) return null
  // See hasPhysicalPlace: an online event cannot carry the required Place, and
  // Google withdrew the online-event properties that used to describe one.
  if (!hasPhysicalPlace(event.event_type)) return null

  const eventUrl = `${baseUrl}/events/${event.slug}`
  // Every date this payload emits is written in the EVENT'S zone, never the
  // server's. `events.timezone` is NOT NULL and was already on this page.
  const zoned = (iso: string) => toZonedIso8601(iso, event.timezone)

  /**
   * The date this event was originally scheduled for, when it has since been
   * moved to a new one. Read defensively because `previous_start_date` is added
   * by migration 20260823000002 and the generated database types trail it.
   *
   * A STILL-POSTPONED event is excluded on purpose: it has been moved off its
   * old date but has no new one, so `startDate` is not yet "the newly scheduled
   * start date" that Google requires alongside previousStartDate.
   */
  const rescheduledFromDate =
    state !== 'postponed' && state !== 'cancelled'
      ? (event as { previous_start_date?: string | null }).previous_start_date ?? null
      : null

  /*
   * ONE OFFER PER TIER, WHICH IS WHAT GOOGLE ASKS FOR AND WHAT WE WERE NOT DOING.
   *
   *   "offers | Offer | A nested Offer, one for each ticket type."
   *   developers.google.com/search/docs/appearance/structured-data/event
   *   (fetched 2026-09-14)
   *
   * The shipped emitter sent ONE AggregateOffer for any event with two or more
   * tiers, so a three-tier show told Google a price range and nothing about what
   * was actually on sale. SEO1 step 3 says the same thing in the owner's words:
   * "Where the platform sells tiers, emit one Offer per tier rather than a single
   * minimum price." A live Eventbrite AU page emits the AggregateOffer form; the
   * requirement and the instruction agree with each other and outrank a
   * competitor's choice.
   *
   * THE PRICE IS THE ONE THE PAGE SHOWS. `display_price_cents` carries a live
   * demand-price move; `price` is the stored value. The emitter was handed the
   * raw rows and read `price`, so any event with a price move advertised a
   * figure nobody could buy at. Google's own note on this property is
   * "Don't forget to update it as prices change or tickets sell out."
   */
  const priceOf = (tier: SchemaTier) => tier.display_price_cents ?? tier.price
  const sortedTiers = [...ticketTiers].sort((a, b) => priceOf(a) - priceOf(b))
  const lowestPrice = sortedTiers.length > 0 ? priceOf(sortedTiers[0]) / 100 : 0

  const offers = sortedTiers.map(tier => ({
    '@type': 'Offer',
    name: tier.name,
    price: (priceOf(tier) / 100).toFixed(2),
    priceCurrency: tier.currency ?? 'AUD',
    availability: schemaAvailability(state),
    url: eventUrl,
    validFrom: event.created_at,
  }))

  const payload = {
    '@context': 'https://schema.org',
    '@type': schemaEventType(event.category?.slug),
    name: event.title,
    startDate: zoned(event.start_date),
    endDate: zoned(event.end_date),
    /*
     * RESCHEDULED, WITH ITS REQUIRED PARTNER PROPERTY.
     *
     * Google states the pairing as a hard requirement, not a suggestion: "If you
     * add previousStartDate, you must also add the eventStatus property and set
     * the eventStatus to EventRescheduled. Don't use other event statuses. For
     * rescheduled events, the startDate property must only be used for the newly
     * scheduled start date."
     * (developers.google.com/search/docs/appearance/structured-data/event,
     * fetched 2026-08-23)
     *
     * So the two are emitted from ONE expression rather than two independent
     * ones. Emitting either alone is a documented violation, and two separate
     * conditions are how they end up disagreeing.
     *
     * A still-postponed event is NOT rescheduled and correctly keeps
     * EventPostponed: it has no new date to point at yet.
     */
    ...(rescheduledFromDate
      ? {
          eventStatus: 'https://schema.org/EventRescheduled',
          previousStartDate: zoned(rescheduledFromDate),
        }
      : { eventStatus: schemaEventStatus(state) }),
    /*
     * NO ATTENDANCE MODE, AND NO ONLINE-EVENT PROPERTY OF ANY KIND.
     *
     * The shipped payload emitted an attendance mode on every event and a
     * VirtualLocation on a virtual one. Google removed that whole family from
     * its event documentation on 5 June 2025; see hasPhysicalPlace above for the
     * citation. SEO1 v2, FAULT ONE: "Emitting it is writing dead code."
     *
     * `location` is therefore always a real Place, and an event that cannot have
     * one never reaches this object at all.
     */
    location: {
      '@type': 'Place',
      ...compact({ name: event.venue_name }),
      address: compact({
        '@type': 'PostalAddress',
        streetAddress: event.venue_address,
        addressLocality: event.venue_city,
        addressRegion: event.venue_state,
        // Google's own address example carries it ("postalCode": "19019")
        // and SEO1 step 3 requires it. `events.venue_postal_code` has
        // existed and been loaded by this page all along; nothing read it,
        // so every event page shipped an address one field short.
        postalCode: event.venue_postal_code,
        addressCountry: countryCode(event.venue_country) ?? 'AU',
      }),
      ...(typeof event.venue_latitude === 'number' && typeof event.venue_longitude === 'number'
        ? {
            geo: {
              '@type': 'GeoCoordinates',
              latitude: event.venue_latitude,
              longitude: event.venue_longitude,
            },
          }
        : {}),
    },
    image: event.cover_image_url ? [event.cover_image_url] : undefined,
    // Structured data is machine-read plain text: markdown syntax here reaches
    // a search result verbatim. Tags were stripped, markdown was not (UX1.1).
    description:
      stripMarkdown(event.summary) ||
      (event.description
        ? stripMarkdown(event.description.replace(/<[^>]*>/g, '')).slice(0, 500)
        : undefined),
    organizer: {
      '@type': 'Organization',
      name: organisation.name,
      url: `${baseUrl}/organisers/${organisation.slug}`,
    },
    // One node per performer, in billing order, each linking to its own artist
    // profile so the entity is resolvable rather than a bare string. Omitted
    // entirely when the lineup is empty: an empty array is a claim that nobody
    // is performing.
    ...(performers.length > 0
      ? {
          performer: performers.map(a => ({
            '@type': 'PerformingGroup',
            name: a.name,
            url: `${baseUrl}/artists/${a.slug}`,
          })),
        }
      : {}),
    // An array of one is still an array, so every event describes its tickets in
    // the same shape and a reader never has to branch on how many there are.
    offers: offers.length > 0 ? offers : undefined,
    ...(lowestPrice === 0 ? { isAccessibleForFree: true } : {}),
    url: eventUrl,
  }

  /*
   * THE OBJECT AND THE BYTES MUST AGREE.
   *
   * `image` and `description` were written as `... : undefined`, so the key was
   * PRESENT on the returned object and absent from the JSON. JSON.stringify
   * drops an undefined value, so nothing reaching Google was ever wrong, and
   * that is exactly why it survived: the only reader who could see the
   * difference was a test, and the test was written to the bytes.
   *
   * Compacting here makes `'image' in payload` mean what a reader assumes it
   * means, so the assertion in the acceptance test is about the contract rather
   * than about a serialisation side effect.
   */
  return compact(payload)
}

