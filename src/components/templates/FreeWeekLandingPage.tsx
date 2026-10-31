import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { Prose } from '@/components/ui/Prose'
import { PhotographicCategoryHero } from '@/components/templates/PhotographicCategoryHero'
import { EmptyCollectionNote } from '@/components/ui/empty-collection-note'
import { CommunityOrganiserCtaPanel } from '@/components/features/community/community-organiser-cta'
import { EventCard } from '@/components/features/events/event-card'
import type { EventCardData } from '@/components/features/events/event-card'
import { FreeWeekShareButton } from '@/components/features/listings/free-week-share-button'
import { eventGridIntrinsicSize } from '@/lib/ui/event-grid-intrinsic'
import { FREE_ENTRY_NO_TICKET_NEEDED } from '@/lib/events/entry-mode'
import { FREE_TICKET_NEEDED, type FreeWeekDay } from '@/lib/listings/free-week'

export interface FreeWeekCategoryLink {
  slug: string
  name: string
  /** How many of this week's events carry it. Shown, never guessed. */
  count: number
}

export interface FreeWeekCityLink {
  slug: string
  name: string
  href: string
}

interface Props {
  cityName: string
  citySlug: string
  /** The city's own page, or null where the platform has none. */
  cityHref: string | null
  /** "Saturday 24 to Friday 30 October", built from the window in the city's zone. */
  week: string
  /** Every free event on this week in the city, uncapped. */
  total: number
  /** How many the page shows (the cap), so a capped week says so rather than hiding it. */
  shown: number
  days: FreeWeekDay<EventCardData>[]
  /** The categories this week holds, each with its count; the chips are built from these. */
  categories: FreeWeekCategoryLink[]
  /** The chosen category's slug, or null for every free event. */
  activeCategory: string | null
  pageUrl: string
  pagePath: string
  heroImage: string | null
  /** The other guide cities. */
  cities: FreeWeekCityLink[]
}

/**
 * THE CITY GUIDE'S WEEK, `/free/<city>/this-week` (WI2 Part 2).
 *
 * `/this-weekend`'s shape (src/components/templates/WeekendLandingPage.tsx says
 * why each part is the shape it is), for a week of free events in one city:
 *
 *   1. The hero            the shared PhotographicCategoryHero at the platform
 *                          hero scale, the city's own licensed photo.
 *   2. The orientation     which week, how many, and what the two labels mean,
 *                          written from the data, with the share button.
 *   3. The categories      chips built from this week's events, each with its
 *                          count; a chosen one is a real URL whose canonical is
 *                          the page (`?category=`), as /events does.
 *   4. A GRID PER DAY      today first. "What is free on Thursday" is the
 *                          question the page answers.
 *   5. The other guides    every other guide city's week.
 *   6. The organiser closer, shared.
 */
export function FreeWeekLandingPage({
  cityName,
  citySlug,
  cityHref,
  week,
  total,
  shown,
  days,
  categories,
  activeCategory,
  pageUrl,
  pagePath,
  heroImage,
  cities,
}: Props) {
  const plural = total === 1 ? 'free event' : 'free events'
  const active = categories.find((c) => c.slug === activeCategory) ?? null

  return (
    <PageShell>
      <PhotographicCategoryHero
        slug={`free-week-${citySlug}`}
        eyebrow={`Free in ${cityName}`}
        title={`Free things to do in ${cityName} this week`}
        subtitle={
          total > 0
            ? `${total} ${plural} from ${week}. Every one of them free to go to.`
            : `Nothing free is listed in ${cityName} for ${week} yet.`
        }
        fallbackImage={heroImage}
        fallbackAlt={`${cityName} on EventLinqs`}
      />

      <ContentSection surface="base" width="default" reveal>
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">{week}</p>
          <Prose>
            <h2 id="about-this-week">Every free event in {cityName} this week, day by day</h2>
            <p>
              Each event says which kind of free it is. {FREE_ENTRY_NO_TICKET_NEEDED} means you just turn up.{' '}
              {FREE_TICKET_NEEDED} means it costs nothing, and you grab a free ticket first so the organiser knows
              you are coming.
            </p>
            <p>
              An event stays here until it has finished, and the week moves on every day, so today is always first.
            </p>
          </Prose>
          {total > shown && (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">
              Showing the first {shown} of {total}, soonest first.{' '}
              <Link href="/events?preset=free" className="font-semibold text-[var(--brand-accent-strong)] hover:underline">
                Every free event
              </Link>
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <FreeWeekShareButton url={pageUrl} title={`Free things to do in ${cityName} this week`} citySlug={citySlug} />
            {/* The week as Instagram cards, drawn from this page's own events (Law 6). */}
            <a
              href={`${pagePath}/card/story`}
              download={`free-in-${citySlug}-this-week-story.jpg`}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-[var(--brand-accent-strong)] hover:underline"
            >
              Instagram story card
            </a>
            <a
              href={`${pagePath}/card/square`}
              download={`free-in-${citySlug}-this-week-square.jpg`}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-[var(--brand-accent-strong)] hover:underline"
            >
              Instagram post card
            </a>
            {cityHref && (
              <Link
                href={cityHref}
                className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-[var(--brand-accent-strong)] transition-colors hover:text-[var(--brand-accent-strong-hover)]"
              >
                Everything on in {cityName}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </ContentSection>

      {categories.length > 1 && (
        <ContentSection surface="base" width="wide" topBorder>
          <nav aria-label={`Free events in ${cityName} this week, by kind`}>
            <ul role="list" className="flex flex-wrap gap-2">
              <li>
                <Link
                  href={pagePath}
                  aria-current={active ? undefined : 'page'}
                  className={chipClass(!active)}
                >
                  All
                  <span className="text-xs font-semibold text-[var(--brand-accent-strong)]">{total}</span>
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`${pagePath}?category=${encodeURIComponent(c.slug)}`}
                    aria-current={active?.slug === c.slug ? 'page' : undefined}
                    className={chipClass(active?.slug === c.slug)}
                  >
                    {c.name}
                    <span className="text-xs font-semibold text-[var(--brand-accent-strong)]">{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </ContentSection>
      )}

      {days.length > 0 ? (
        days.map((day) => <FreeWeekDaySection key={day.key} day={day} />)
      ) : (
        <ContentSection surface="base" width="wide" topBorder reveal>
          <EmptyCollectionNote message={`Nothing free is listed in ${cityName} for ${week} yet.`} />
        </ContentSection>
      )}

      {cities.length > 0 && (
        <ContentSection surface="alt" width="wide" topBorder reveal>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            The free guides
          </p>
          <h2 className="mb-5 font-display text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">
            Free this week in other cities
          </h2>
          <ul role="list" className="flex flex-wrap gap-2">
            {cities.map((city) => (
              <li key={city.slug}>
                <Link href={city.href} className={chipClass(false)}>
                  {city.name}
                </Link>
              </li>
            ))}
          </ul>
        </ContentSection>
      )}

      <CommunityOrganiserCtaPanel
        communitySlug={`free-week-${citySlug}`}
        communityName={`free in ${cityName}`}
        contactInterest="create-event"
        organiserPersonas={[
          'Venues with a free weekly night',
          'Libraries, galleries and councils running free sessions',
          'Community groups with a free meet up',
        ]}
        heading={`Your free event, on the page ${cityName} checks for the week.`}
        body="Free events list for nothing. Walk-in nights need no tickets at all, and every attendee relationship stays yours."
      />
    </PageShell>
  )
}

function chipClass(active: boolean): string {
  return [
    'inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors',
    active
      ? 'border-[var(--brand-accent)] bg-[var(--surface-0)] font-semibold text-[var(--text-primary)]'
      : 'border-[var(--surface-2)] bg-[var(--surface-0)] text-[var(--text-secondary)] hover:border-[var(--brand-accent)]/50 hover:text-[var(--text-primary)]',
  ].join(' ')
}

/**
 * One day: its heading, its count and its grid. Its own component for the
 * reason WeekendDaySection is: the reserved height and the grid must name the
 * same `events` array (scripts/guards/event-grid-reserves-its-own-height.mjs).
 */
function FreeWeekDaySection({ day }: { day: FreeWeekDay<EventCardData> }) {
  const { events } = day
  const plural = events.length === 1 ? 'free event' : 'free events'

  return (
    <ContentSection surface="base" width="wide" topBorder reveal intrinsicSize={eventGridIntrinsicSize(events.length)}>
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
          {events.length} {plural}
        </p>
        <h2 id={`day-${day.key}`} className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          {day.heading}
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <EventCard key={event.id} event={event} freeLabels />
        ))}
      </div>
    </ContentSection>
  )
}
