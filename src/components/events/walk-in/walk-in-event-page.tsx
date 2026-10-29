import Link from 'next/link'
import { CalendarClock, Clock, XCircle } from 'lucide-react'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { HeroMedia } from '@/components/media/HeroMedia'
import { Reveal } from '@/components/ui/reveal'
import { getFeaturedHeroBackground, eventHeroMediaInput } from '@/lib/images/event-media'
import { isLibraryPhoto, LIBRARY_PHOTO_CREDIT } from '@/lib/listings/listing-photo'
import { EventSchemaJsonLd } from '@/components/features/events/event-schema-jsonld'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import { EventOpenGraphTypeMeta } from '@/components/seo/og-type-meta'
import { EventViewTracker } from '@/components/features/events/event-view-tracker'
import { ShareViewBeacon } from '@/components/broadcast/share-view-beacon'
import { FollowButton } from '@/components/features/follow/follow-button'
import { isEventLinqsListing, shownOrganiser } from '@/lib/listings/shown-organiser'
import { EventGallery } from '@/components/features/events/event-gallery'
import { OrganiserProse } from '@/components/ui/organiser-prose'
import { stripMarkdown } from '@/lib/prose/markdown-subset'
import { parseGallery } from '@/lib/media/event-media-model'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { getSiteUrl } from '@/lib/site-url'
import { formatVenueWithAddress } from '@/lib/venues/format-venue-address'
import type { FullEvent } from '@/lib/events/event-detail-read'
import type { CalendarEvent } from '@/lib/events/calendar-links'
import { FREE_ENTRY_LABEL, FREE_ENTRY_NO_TICKET_NEEDED, FREE_NO_TICKET_NEEDED, NO_TICKET_NEEDED } from '@/lib/events/entry-mode'
import { dayHours, spanDates, type Guide } from '@/lib/walk-in/guide'
import { readPublicGuide } from '@/lib/walk-in/guide-read'
import { remindMeHeading, remindMePurpose } from '@/lib/walk-in/remind-me'
import {
  ABOUT_THIS_EVENT,
  ACCESS,
  CLOSING_THE_NIGHT,
  FROM_PAST_EVENTS,
  GETTING_THERE_AND_ACCESS,
  GET_DIRECTIONS,
  ORGANISED_BY,
  PLAN_YOUR_VISIT,
  datesChip,
  dayLabels,
  entryLine,
  highlightsHeading,
  programHeading,
} from '@/lib/walk-in/page-copy'
import { WalkInDayTabs, type WalkInDayView } from './walk-in-day-tabs'
import { WalkInPanelActions, WalkInPhoneCalendar } from './walk-in-panel-actions'
import { WalkInBottomBar } from './walk-in-bottom-bar'
import { WalkInOutbound } from './walk-in-outbound'
import { freeListingOutbound, type ListingPages } from '@/lib/listings/outbound'
import { readListingPages } from '@/lib/listings/listing-pages-read'
import { readJoinedCollaborators, type JoinedCollaborator } from '@/lib/events/collaborators'
import { CollaboratorsLine } from '@/components/events/collaborators-line'
import { HoursList } from './hours-list'

/**
 * THE FESTIVAL GUIDE: a free walk-in event's page (WI1, locked design A).
 *
 * Drawn to the boards in C:\dev\design\amcf-21oct\locked: Main.dc.html from lg
 * (1024px) up, PhoneA.dc.html below it. The values are the platform's tokens,
 * never the board's raw ones (CLAUDE.md, Design system: the token wins), and
 * every difference is listed in C:\dev\EVIDENCE\WI1\design-match\DESIGN-MATCH.md.
 *
 * WHAT THIS PAGE NEVER RENDERS, and a guard holds it there
 * (scripts/guards/walk-in-page-sells-nothing.mjs): a ticket selector, a price,
 * "Get tickets", or any line EventLinqs writes with "ticket" or "book" in it
 * other than "No ticket needed". Text the organiser supplies shows as written
 * and is marked data-text-source="organiser", so the rendered-page test and the
 * drive know whose words they are reading (Lawal, 21 October 2026).
 *
 * The page route dispatches here BEFORE it builds any ticket UI, so nothing on
 * the ticketed page is computed for a walk-in event.
 */

/** The organiser's words, or EventLinqs' own words for a listing EventLinqs wrote (WI2). */
function textSource(event: FullEvent): 'organiser' | 'eventlinqs' {
  return event.listing_source === 'eventlinqs' ? 'eventlinqs' : 'organiser'
}

/*
 * A NAME is never a line EventLinqs writes, whoever listed the event: the
 * event's title, its venue and its organiser are their own names, shown as they
 * are ("Silent Book Club" is a real free weekly night). Ruling 2 of 21 October
 * 2026 bans only words we write, so names are marked as the event's own words
 * on every listing, while a listing's descriptive lines carry textSource above.
 */
const NAME_SOURCE = 'organiser'

function websiteHost(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Google Maps directions to the venue (developers.google.com/maps/documentation/urls). */
function directionsHref(event: FullEvent): string | null {
  const destination =
    typeof event.venue_latitude === 'number' && typeof event.venue_longitude === 'number'
      ? `${event.venue_latitude},${event.venue_longitude}`
      : formatVenueWithAddress({
          name: event.venue_name,
          address: event.venue_address,
          city: event.venue_city,
          state: event.venue_state,
          country: event.venue_country,
        })
  if (!destination) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

export async function WalkInEventPage({ event }: { event: FullEvent }) {
  const [guide, remindMeOn, media, pages, collaborators] = await Promise.all([
    // The event has already resolved under its own policies; the guide follows it
    // for the public exactly when guideIsPublic says so (src/lib/walk-in/guide-visibility.ts).
    readPublicGuide(event),
    isFeatureEnabled('walk_in_remind_me'),
    // THE SAME RESOLVER the route layout preloads with (eventHeroPreloadLink),
    // and HeroMedia's own default sizes below, so the raster this paints is the
    // raster the head asked for: one download on the LCP path, not two.
    getFeaturedHeroBackground(eventHeroMediaInput(event)),
    // WI3's page: the host's own pages, for the one button that leaves (src/lib/listings/outbound.ts).
    readListingPages(event),
    // Item 15 of the locked plan of 27 October 2026: the venues that joined, named under the organiser.
    readJoinedCollaborators(event.id),
  ])
  // The clock is read here with the other reads, as the ticketed page reads it,
  // so the render below stays pure.
  const now = new Date()
  return (
    <WalkInEventView
      event={event}
      guide={guide}
      remindMeOn={remindMeOn}
      now={now.getTime()}
      baseUrl={getSiteUrl()}
      hero={{ image: media.image, alt: event.cover_image_alt || media.alt, objectPosition: media.objectPosition }}
      pages={pages}
      collaborators={collaborators}
    />
  )
}

export type WalkInEventViewProps = {
  event: FullEvent
  guide: Guide
  remindMeOn: boolean
  /** Milliseconds since the epoch at the read, for "has it ended". */
  now: number
  baseUrl: string
  hero: { image: string | null; alt: string; objectPosition?: string }
  /** The host's own pages, for a curated listing's one button that leaves; none for an organiser's own event. */
  pages?: ListingPages
  /** The venues that joined this event (item 15). */
  collaborators?: readonly JoinedCollaborator[]
}

/** The render, separate from the reads so a test can draw it from a fixture. */
export function WalkInEventView({ event, guide, remindMeOn, now, baseUrl, hero, pages = {}, collaborators = [] }: WalkInEventViewProps) {
  const source = textSource(event)
  const org = event.organisation
  // WI2 ruling A: a listing names its host, never the listings organisation
  // that holds it, and has no organiser page or Follow (src/lib/listings/shown-organiser.ts).
  const shown = shownOrganiser(event, org)
  const organiserName = shown.name
  // WI3's page: a curated listing's one button to its host's own page (Lawal's finding of 27 October 2026).
  // An organiser's own event is its own page here, so it draws none.
  const outbound = isEventLinqsListing(event) ? freeListingOutbound(event.slug, shown.name, pages) : null
  const programPublished = Boolean(guide.program_published_at)
  const eventUrl = `${baseUrl}/events/${event.slug}`
  const dates = guide.days.length > 0 ? guide.days.map((d) => d.date) : spanDates(event.start_date, event.end_date, event.timezone)
  const dayCount = dates.length
  const gallery = parseGallery(event.gallery_urls).filter((g) => g.url)
  const directions = directionsHref(event)
  // The venue and its address, for the phone card when the guide says nothing
  // about getting there (one-venue-address-format).
  const venueLine = formatVenueWithAddress({ name: event.venue_name, address: event.venue_address })
  const host = websiteHost(shown.website)
  const handle = shown.instagram
  const ageLabel = event.is_age_restricted && event.age_restriction_min ? `${event.age_restriction_min}+` : null
  const eyebrowPlace = [event.venue_name, event.venue_city].filter(Boolean).join(', ')
  const eyebrowCategory = event.category?.name ?? null
  // Organiser prose goes through the one door (organiser-prose-one-rule): the
  // one-line intro stripped, the description rendered by OrganiserProse.
  const intro = stripMarkdown(event.summary) || null
  const about = stripMarkdown(event.description)
  const showAbout = about.length > 0 && about !== intro
  const ended = event.status === 'completed' || new Date(event.end_date).getTime() < now
  // The ticketed page's EventStateBanner speaks of refunds and existing tickets,
  // which a walk-in event has neither of, so this page states its own line. It
  // keeps that banner's palettes (light tints of the error and warning tokens,
  // the quiet surface for an ended event), so the two never look like different
  // products: no flat dark band (Design system, light and airy).
  const state: 'cancelled' | 'postponed' | 'past' | null =
    event.status === 'cancelled' ? 'cancelled' : event.status === 'postponed' ? 'postponed' : ended ? 'past' : null

  // The same shape the ticketed page builds for its calendar links.
  const calendarEvent: CalendarEvent = {
    id: event.id,
    title: event.title,
    startDate: event.start_date,
    endDate: event.end_date,
    timezone: event.timezone ?? null,
    location: [event.venue_name, event.venue_city].filter(Boolean).join(', ') || null,
    url: eventUrl,
  }

  const hours = guide.days.map((d) => ({ date: d.date, label: dayLabels(d.date).short, ...dayHours(d) }))
  const days: WalkInDayView[] = guide.days.map((d) => {
    const labels = dayLabels(d.date)
    return { date: d.date, tab: labels.tab, phoneTab: labels.short, long: labels.long, hours: dayHours(d), items: d.items, closer: d.closer }
  })
  // The day by day section only where it says more than the hours already shown above it: a program item, a closer
  // or the program's own note. A curated night carries its hours alone, and drew "The program" with nothing in it
  // but those hours (window 5's finish pass, 27 October 2026).
  const programSaysMore = days.some((d) => d.items.length > 0 || d.closer !== null) || Boolean(guide.program_note)

  const crumbs = [
    { name: 'Events', href: '/events' },
    event.city_primary && event.venue_city ? { name: event.venue_city, href: `/city/${event.city_primary}` } : null,
    event.category ? { name: event.category.name, href: `/categories/${event.category.slug}` } : null,
  ].filter((c): c is { name: string; href: string } => c !== null)

  return (
    <div className="min-h-screen bg-canvas" data-walk-in-page>
      {event.organisation && event.status !== 'archived' && (
        <EventSchemaJsonLd
          event={event}
          organisation={{ ...event.organisation, name: shown.name, slug: shown.slug }}
          ticketTiers={[]}
          state={event.status === 'cancelled' ? 'cancelled' : event.status === 'postponed' ? 'postponed' : ended ? 'past' : 'upcoming'}
          baseUrl={baseUrl}
          performers={[]}
        />
      )}
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: baseUrl },
          { name: 'Events', url: `${baseUrl}/events` },
          { name: event.title, url: eventUrl },
        ]}
      />
      <EventOpenGraphTypeMeta />
      <EventViewTracker
        eventId={event.id}
        eventTitle={event.title}
        category={event.category?.name ?? 'Uncategorised'}
        venueCity={event.venue_city ?? 'Unknown'}
        priceRange={FREE_ENTRY_LABEL}
        soldOut={false}
      />
      <ShareViewBeacon />
      <SiteHeader staticSafe />

      <main id="main-content" className="pb-28 lg:pb-24">
        {state && <WalkInStateLine state={state} organiserSlug={shown.slug} />}

        <div className="mx-auto w-full max-w-7xl lg:px-8 lg:pt-6">
          {crumbs.length > 1 && (
            <nav aria-label="Breadcrumb" className="mb-4 hidden text-sm text-ink-600 lg:block">
              {crumbs.map((c, i) => (
                <span key={c.href}>
                  {i > 0 && <span aria-hidden> / </span>}
                  <Link href={c.href} className="underline underline-offset-2 hover:text-[var(--brand-accent-strong)]">
                    {c.name}
                  </Link>
                </span>
              ))}
            </nav>
          )}

          {/* The cover: full bleed 3:2 on a phone (PhoneA), a contained 16:7
              card from lg (Main). The one priority raster; it never animates.
              The credit sits UNDER the photograph, not on it: the board's pill
              on the picture is words on a photograph, which the hero law routes
              through <HeroCaption> and its wash (scripts/guards/lib/hero-files.mjs),
              and "image alone, all details below the image" is the lighter way
              to keep it. */}
          <figure className="m-0">
            <div className="relative aspect-[3/2] overflow-hidden bg-ink-900 lg:aspect-[16/7] lg:rounded-[var(--radius-card)]">
              {hero.image && <HeroMedia image={hero.image} alt={hero.alt} objectPosition={hero.objectPosition} />}
            </div>
            {guide.cover_credit && (
              <figcaption data-text-source={source} className="mt-2 hidden text-xs font-semibold text-ink-600 lg:block">
                Photo: {guide.cover_credit}
              </figcaption>
            )}
            {/* Lawal's ruling of 27 October 2026, 08:33: a listing night without its
                host's own photo shows EventLinqs' licensed library shot, and says so,
                so it is never read as the venue. */}
            {!guide.cover_credit && isLibraryPhoto(event.cover_image_url) && (
              <figcaption className="mt-2 px-4 text-xs text-ink-600 sm:px-6 lg:px-0">{LIBRARY_PHOTO_CREDIT}</figcaption>
            )}
          </figure>

          <div className="px-4 sm:px-6 lg:mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-12 lg:px-0">
            <div className="flex min-w-0 flex-col gap-8 pt-5 lg:gap-14 lg:pt-0">
              {/* Intro */}
              <section className="flex flex-col gap-3 lg:gap-4">
                {(eyebrowCategory || eyebrowPlace) && (
                  <p className="type-eyebrow font-display text-[var(--brand-accent-strong)]">
                    {eyebrowCategory}
                    {eyebrowCategory && eyebrowPlace && ' · '}
                    {eyebrowPlace && <span data-text-source={NAME_SOURCE}>{eyebrowPlace}</span>}
                  </p>
                )}
                <h1
                  data-text-source={NAME_SOURCE}
                  className="font-headline text-3xl font-extrabold leading-[1.06] tracking-[-0.02em] text-ink-900 lg:text-5xl lg:leading-[1.04]"
                >
                  {event.title}
                </h1>
                {intro && (
                  <p data-text-source={source} className="type-measure text-[17px] leading-[1.5] text-ink-800 lg:text-xl">
                    {intro}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap gap-2 lg:mt-2 lg:gap-2.5">
                  {dates.length > 0 && <Chip>{datesChip(dates)}</Chip>}
                  {event.venue_name && (
                    <span className="hidden lg:inline-flex" data-text-source={NAME_SOURCE}>
                      <Chip>{[event.venue_name, event.venue_city].filter(Boolean).join(', ')}</Chip>
                    </span>
                  )}
                  <Chip gold>
                    <span className="lg:hidden">{FREE_NO_TICKET_NEEDED}</span>
                    <span className="hidden lg:inline">{FREE_ENTRY_NO_TICKET_NEEDED}</span>
                  </Chip>
                  {ageLabel && <Chip>{ageLabel}</Chip>}
                </div>
              </section>

              {/* The one button that leaves, near the top on a phone; from lg it lives in the panel. */}
              {outbound && (
                <div className="lg:hidden">
                  <WalkInOutbound outbound={outbound} />
                </div>
              )}

              {/* Hours, near the top on a phone (PhoneA). From lg they live in the panel. */}
              {hours.length > 0 && (
                <div className="rounded-[var(--radius-card)] bg-white p-5 lg:hidden">
                  <HoursList hours={hours} source={source} />
                </div>
              )}

              {/* Add to calendar, under the hours on a phone and a tablet. From lg it lives in the panel. */}
              {!ended && (
                <div className="lg:hidden" data-testid="phone-calendar">
                  <WalkInPhoneCalendar eventId={event.id} calendar={calendarEvent} />
                </div>
              )}

              {/* At a glance (Main only, organiser facts). */}
              {guide.at_a_glance.length > 0 && (
                <section aria-label="At a glance" className="hidden gap-3 lg:grid lg:grid-cols-4">
                  {guide.at_a_glance.map((g, i) => (
                    <div key={i} data-text-source={source} className="rounded-[var(--radius-card)] bg-white p-5">
                      <p className="font-headline text-3xl font-extrabold text-ink-900">{g.value}</p>
                      <p className="mt-1 text-sm text-ink-600">{g.label}</p>
                    </div>
                  ))}
                </section>
              )}

              {/* From here down, below the fold, each block fade-rises once as it
                  arrives (the Motion law), through the shared <Reveal> the ticketed
                  page's sections use; above it nothing moves but the cover's LCP. */}
              {/* The organiser's description, when they wrote one. The AMCF board has
                  none, so design A draws no such section; an organiser's own words
                  are never dropped, so they render here, through the one door. */}
              {showAbout && (
                <Reveal as="section" className="flex flex-col gap-3 lg:gap-4">
                  <h2 className="type-rail-heading font-headline text-ink-900">{ABOUT_THIS_EVENT}</h2>
                  <div data-text-source={source}>
                    <OrganiserProse
                      text={event.description}
                      className="type-measure space-y-4 text-pretty text-base leading-relaxed text-ink-700"
                    />
                  </div>
                </Reveal>
              )}

              {/* Day by day */}
              {days.length > 0 && programSaysMore && (
                <Reveal as="section" className="flex flex-col gap-3.5 lg:gap-5">
                  <div>
                    <p className="type-eyebrow mb-1.5 hidden font-display text-[var(--brand-accent-strong)] lg:block">
                      {PLAN_YOUR_VISIT}
                    </p>
                    <h2 className="type-rail-heading font-headline text-ink-900">{programHeading(dates)}</h2>
                  </div>
                  <WalkInDayTabs days={days} textSource={source} closingLabel={CLOSING_THE_NIGHT} />
                  {guide.program_note && (
                    <p data-text-source={source} className="text-[13px] text-ink-600">
                      {guide.program_note}
                    </p>
                  )}
                </Reveal>
              )}

              {/* Highlights */}
              {(guide.highlights.length > 0 || guide.highlights_note) && (
                <Reveal as="section" className="flex flex-col gap-2.5 lg:gap-5">
                  <h2 className="type-rail-heading font-headline text-ink-900">{highlightsHeading(dayCount)}</h2>
                  {guide.highlights.length > 0 && (
                    <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3 lg:gap-3">
                      {guide.highlights.map((h, i) => (
                        <div key={i} data-text-source={source} className="rounded-[var(--radius-card)] bg-white p-4 lg:p-5">
                          <h3 className="mb-1 text-base font-bold text-ink-900 lg:mb-1.5 lg:text-[17px]">{h.title}</h3>
                          <p className="text-sm leading-[1.5] text-ink-600 lg:text-[15px]">{h.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {guide.highlights_note && (
                    <p data-text-source={source} className="type-measure hidden text-[15px] leading-[1.6] text-ink-800 lg:block">
                      {guide.highlights_note}
                    </p>
                  )}
                </Reveal>
              )}

              {/* Photos: every tile is a button that opens the viewer (no dead-end tiles). */}
              {gallery.length > 0 && (
                <Reveal as="section" className="flex flex-col gap-2 lg:gap-4">
                  {guide.photos_heading ? (
                    <h2 data-text-source={source} className="type-rail-heading hidden font-headline text-ink-900 lg:block">
                      {guide.photos_heading}
                    </h2>
                  ) : (
                    <h2 className="type-rail-heading hidden font-headline text-ink-900 lg:block">{FROM_PAST_EVENTS}</h2>
                  )}
                  <EventGallery images={gallery} eventTitle={event.title} layout="walk-in" />
                  {guide.photo_credit && (
                    <p data-text-source={source} className="text-xs text-ink-600 lg:text-[13px]">
                      Photos: {guide.photo_credit}.
                    </p>
                  )}
                </Reveal>
              )}

              {/* Quote (Main only). */}
              {guide.quote_text && (
                <Reveal as="figure" data-text-source={source} className="m-0 hidden rounded-[var(--radius-card)] bg-white px-10 py-9 lg:block">
                  <blockquote className="m-0 font-headline text-2xl font-semibold leading-[1.4] tracking-[-0.01em] text-ink-900">
                    &quot;{guide.quote_text}&quot;
                  </blockquote>
                  {guide.quote_attribution && (
                    <figcaption className="mt-4 text-[15px] text-ink-600">{guide.quote_attribution}</figcaption>
                  )}
                </Reveal>
              )}

              {/* Getting there and access */}
              {(event.venue_name || guide.getting_there || guide.access_notes) && (
                <Reveal as="section" className="flex flex-col gap-2.5 lg:gap-4">
                  <h2 className="type-rail-heading font-headline text-ink-900">{GETTING_THERE_AND_ACCESS}</h2>
                  {/* Phone: one card, the link under it (PhoneA). */}
                  <div className="rounded-[var(--radius-card)] bg-white p-4 text-sm leading-[1.6] text-ink-800 lg:hidden">
                    {[event.venue_name, guide.getting_there].filter(Boolean).length > 0 && (
                      <p data-text-source={source} className="m-0">
                        {[guide.getting_there ?? venueLine, guide.access_notes]
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                    )}
                  </div>
                  {directions && (
                    <a href={directions} target="_blank" rel="noopener noreferrer" className="text-[15px] font-bold text-ink-900 underline lg:hidden">
                      {GET_DIRECTIONS}
                    </a>
                  )}
                  {/* lg: two cards (Main). */}
                  <div className="hidden gap-3 lg:grid lg:grid-cols-2">
                    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-white p-6">
                      <h3 data-text-source={NAME_SOURCE} className="m-0 text-[17px] font-bold text-ink-900">
                        {[event.venue_name, event.venue_city].filter(Boolean).join(', ')}
                      </h3>
                      {(guide.getting_there || event.venue_address) && (
                        <p data-text-source={source} className="m-0 text-[15px] leading-[1.6] text-ink-600">
                          {guide.getting_there ?? event.venue_address}
                        </p>
                      )}
                      {directions && (
                        <a href={directions} target="_blank" rel="noopener noreferrer" className="text-[15px] font-bold text-ink-900 underline">
                          {GET_DIRECTIONS}
                        </a>
                      )}
                    </div>
                    {guide.access_notes && (
                      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-white p-6">
                        <h3 className="m-0 text-[17px] font-bold text-ink-900">{ACCESS}</h3>
                        <p data-text-source={source} className="m-0 text-[15px] leading-[1.6] text-ink-600">
                          {guide.access_notes}
                        </p>
                      </div>
                    )}
                  </div>
                </Reveal>
              )}

              {/* Organised by */}
              {org && (
                <Reveal as="section" className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-white p-5 lg:flex-wrap lg:gap-4 lg:px-7 lg:py-6">
                  <div className="min-w-0">
                    <p className="type-eyebrow m-0 font-display text-[var(--brand-accent-strong)]">{ORGANISED_BY}</p>
                    <p data-text-source={NAME_SOURCE} className="m-0 mt-0.5 text-[15px] font-bold text-ink-900 lg:mt-1 lg:font-headline lg:text-xl">
                      {shown.slug ? (
                        <Link href={`/organisers/${shown.slug}`} className="hover:underline">
                          {shown.name}
                        </Link>
                      ) : (
                        shown.name
                      )}
                    </p>
                    <CollaboratorsLine collaborators={collaborators} className="mt-1" />
                    {(host || handle) && (
                      <p className="m-0 mt-1 hidden text-sm text-ink-600 lg:block">
                        {host && (
                          <a href={shown.website!.startsWith('http') ? shown.website! : `https://${shown.website}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {host}
                          </a>
                        )}
                        {host && handle && <span aria-hidden> · </span>}
                        {handle && (
                          <a href={`https://www.instagram.com/${encodeURIComponent(handle)}/`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            @{handle}
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                  {shown.followable && (
                    <FollowButton
                      type="organiser"
                      id={org.id}
                      variant="outline"
                      label={shown.shortName ? `Follow ${shown.shortName}` : 'Follow'}
                      compactLabel="Follow"
                      fromEventId={event.id}
                    />
                  )}
                </Reveal>
              )}
            </div>

            {/* The panel, from lg (Main). Sticky beside the guide. */}
            <aside aria-label="Going to this event" className="hidden lg:sticky lg:top-24 lg:block">
              <div className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-ink-200 bg-white p-7">
                <div>
                  <p className="type-eyebrow m-0 font-display text-[var(--brand-accent-strong)]">{FREE_ENTRY_LABEL}</p>
                  <h2 className="m-0 mt-1 font-headline text-[26px] font-bold text-ink-900">{NO_TICKET_NEEDED}</h2>
                  <p className="m-0 mt-2 text-[15px] leading-[1.5] text-ink-600">{entryLine(dayCount)}</p>
                </div>
                {hours.length > 0 && <HoursList hours={hours} source={source} />}
                {outbound && <WalkInOutbound outbound={outbound} />}
                <WalkInPanelActions
                  eventId={event.id}
                  eventSlug={event.slug}
                  eventTitle={event.title}
                  eventUrl={eventUrl}
                  calendar={calendarEvent}
                  remindMeOn={remindMeOn && !ended && event.status === 'published'}
                  heading={remindMeHeading(programPublished)}
                  purpose={remindMePurpose(shown.shortName ?? organiserName, programPublished)}
                />
              </div>
            </aside>
          </div>
        </div>
      </main>

      <WalkInBottomBar
        eventId={event.id}
        eventSlug={event.slug}
        eventTitle={event.title}
        eventUrl={eventUrl}
        remindMeOn={remindMeOn && !ended && event.status === 'published'}
        programPublished={programPublished}
        heading={remindMeHeading(programPublished)}
        purpose={remindMePurpose(shown.shortName ?? organiserName, programPublished)}
      />
      <SiteFooter />
    </div>
  )
}

/** The state of a walk-in event that is not on as planned, in EventStateBanner's palettes. */
function WalkInStateLine({ state, organiserSlug }: { state: 'cancelled' | 'postponed' | 'past'; organiserSlug: string | null }) {
  if (state === 'cancelled') {
    return (
      <div role="alert" className="border-b border-[#F4BEBE] bg-[#FCE9E9]">
        <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC2626]" aria-hidden />
          <p className="m-0 flex-1 text-sm font-semibold text-[#991B1B]">This event has been cancelled.</p>
        </div>
      </div>
    )
  }
  if (state === 'postponed') {
    return (
      <div role="alert" className="border-b border-[#FCE2B6] bg-[#FEF5E7]">
        <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[#B45309]" aria-hidden />
          <p className="m-0 flex-1 text-sm font-semibold text-[#78350F]">
            This event has been postponed. New dates are still to come.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div role="status" className="border-b border-[var(--surface-2)] bg-[var(--surface-1)]">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-secondary)]" aria-hidden />
        <div className="flex-1 text-sm">
          <p className="m-0 font-semibold text-[var(--text-primary)]">This event has ended.</p>
          <p className="m-0 mt-0.5 text-[var(--text-secondary)]">
            {organiserSlug ? (
              <>
                See{' '}
                <Link
                  href={`/organisers/${organiserSlug}`}
                  className="font-medium text-[var(--brand-accent-strong)] underline hover:no-underline"
                >
                  upcoming events from this organiser
                </Link>{' '}
                or{' '}
                <Link href="/events" className="font-medium text-[var(--brand-accent-strong)] underline hover:no-underline">
                  browse all upcoming events
                </Link>
                .
              </>
            ) : (
              <>
                <Link href="/events" className="font-medium text-[var(--brand-accent-strong)] underline hover:no-underline">
                  Browse upcoming events
                </Link>
                .
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

function Chip({ children, gold = false }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <span
      className={
        gold
          ? 'inline-flex rounded-full border border-[var(--color-gold-400)] bg-[var(--color-gold-100)] px-3 py-1.5 text-[13px] font-bold text-[var(--brand-accent-strong)] lg:px-3.5 lg:py-2 lg:text-sm'
          : 'inline-flex rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-ink-900 lg:px-3.5 lg:py-2 lg:text-sm'
      }
    >
      {children}
    </span>
  )
}
