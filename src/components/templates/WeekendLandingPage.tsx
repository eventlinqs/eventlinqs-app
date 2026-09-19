import Link from 'next/link'
import { CalendarDays, Ticket, Wallet, ArrowRight } from 'lucide-react'
import type { ComponentType } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { Prose } from '@/components/ui/Prose'
import { PhotographicCategoryHero } from '@/components/templates/PhotographicCategoryHero'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import { CommunityOrganiserCtaPanel } from '@/components/features/community/community-organiser-cta'
import { EventCard } from '@/components/features/events/event-card'
import { eventGridIntrinsicSize } from '@/lib/ui/event-grid-intrinsic'
import type { EventCardData } from '@/components/features/events/event-card'
import type { WeekendDay } from '@/lib/events/weekend-days'

export interface WeekendCityLink {
  slug: string
  name: string
  /** How many of this weekend's events are in that city. Shown, never guessed. */
  count: number
}

interface Props {
  /** "Saturday 19 and Sunday 20 September", built from the shared window. */
  weekend: string
  /** Every publicly visible event in the window, uncapped. */
  total: number
  /** The events split by their own local day, in order. */
  days: WeekendDay<EventCardData>[]
  /** Resolved by the page from the licensed library. */
  heroImage: string
  heroAlt: string
  heroObjectPosition?: string
  /** Cities that actually hold one of this weekend's events. */
  cities: WeekendCityLink[]
}

/**
 * THE WEEKEND LANDING, `/this-weekend`.
 *
 * ============================================================================
 * WHY THE PLATFORM NEEDED A PAGE AND NOT A FIFTH DOOR INTO A QUERY STRING
 * ============================================================================
 *
 * Close-out AQ3: "People search for things to do before they search for an
 * organiser. A ticketing platform aggregates supply and is the only party
 * positioned to own that search."
 *
 * Four doors already pointed at the weekend and all four opened on
 * `/events?preset=weekend`, which self-canonicalises to `/events`. So the
 * platform answered the question and could not be found answering it. This is
 * the same defect close-out SEO3 measured on the twenty-two categories, where
 * `/events?category=comedy` meant nothing could rank for "comedy tickets", and
 * it has the same remedy: a real URL with its own copy, its own structured data
 * and its own place in the sitemap.
 *
 * EVIDENCE, and it is the competitor's own page rather than a guess. Eventbrite
 * publishes this exact page type at a real path,
 * `https://www.eventbrite.com.au/d/australia--melbourne/events--this-weekend/`,
 * under the h1 "Events and Things to do in Melbourne, Australia this weekend"
 * (fetched 19 September 2026). Their scope is a city and ours is the country,
 * which is the honest shape for a platform whose supply is national and thin
 * per city: a city-scoped family would be twenty-four pages, most of them empty
 * most weekends, and AQ3's own reversal condition refuses exactly that.
 *
 * ============================================================================
 * SHAPE, AND WHY EACH PART IS THE SHAPE IT IS
 * ============================================================================
 *
 *   1. The hero            the shared PhotographicCategoryHero at the platform
 *                          hero scale. One treatment, not a second one.
 *   2. The orientation     two short paragraphs that say WHICH weekend, how
 *                          many events are on it and what the fee promise is.
 *                          It is written from the data, so it cannot become the
 *                          stale template copy Law 1 refuses.
 *   3. A GRID PER DAY      the part that is this page and no other. A single
 *                          undivided grid would make a reader scan dates on
 *                          forty cards to answer "what is on Sunday", which is
 *                          the actual question a weekend page is asked.
 *   4. The city strip      where this weekend is on, linking to the city pages
 *                          that hold it. Built from the events present, so
 *                          every link leads to a page with something on it.
 *   5. The organiser closer shared with the community and category landings
 *                          rather than re-rolled, per the one-implementation
 *                          rule.
 *
 * The zero-event state is the SHARED CategoryHeroEmpty, the same designed empty
 * state behind every community, city and category page. The page still renders,
 * still carries its copy and still self-canonicalises; only the robots directive
 * moves, and that is decided in the route, not here.
 */
export function WeekendLandingPage({
  weekend,
  total,
  days,
  heroImage,
  heroAlt,
  heroObjectPosition,
  cities,
}: Props) {
  const plural = total === 1 ? 'event' : 'events'

  return (
    <PageShell>
      <PhotographicCategoryHero
        slug="this-weekend"
        eyebrow="This weekend in Australia"
        title="What's on this weekend"
        subtitle={
          total > 0
            ? `${total} ${plural} on ${weekend}, all-in prices, no fee sprung at checkout.`
            : `Nothing is on sale for ${weekend} yet. The first event of the weekend could be yours.`
        }
        fallbackImage={heroImage}
        fallbackAlt={heroAlt}
        fallbackObjectPosition={heroObjectPosition}
      />

      <ContentSection surface="base" width="default" reveal>
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            {weekend}
          </p>
          <Prose>
            <h2 id="about-this-weekend">Every event on sale for this weekend, in one place</h2>
            <p>
              The weekend here is Saturday and Sunday, and an event stays on this page until it has
              actually finished rather than disappearing the minute it starts. Anything still
              running on Saturday afternoon is still listed on Saturday afternoon.
            </p>
            <p>
              Prices are all in from the first click. The number on the card is the number at
              checkout, which is how a ticket price should be quoted and is what Australian
              Consumer Law asks of anyone selling one.
            </p>
          </Prose>
          <p className="mt-6">
            <Link
              href="/events"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-accent-strong)] transition-colors hover:text-[var(--brand-accent-strong-hover)]"
            >
              Browse every upcoming event
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </p>
        </div>
      </ContentSection>

      {days.length > 0 ? (
        days.map((day, index) => (
          <WeekendDaySection key={day.key} day={day} first={index === 0} />
        ))
      ) : (
        <ContentSection surface="base" width="wide" topBorder reveal>
          <CategoryHeroEmpty
            eyebrow="This weekend in Australia"
            headline="The first event of this weekend could be yours."
            subhead={`Nothing is on sale for ${weekend} yet. Set up in five minutes, take payments, and keep every attendee relationship.`}
            primaryAction={{ label: 'Start selling tickets', href: '/organisers/signup' }}
            secondaryAction={{ label: 'Browse all events', href: '/events' }}
            trustPillars={[
              { icon: CalendarDays as ComponentType<{ className?: string }>, label: 'Live in five minutes' },
              { icon: Ticket as ComponentType<{ className?: string }>, label: 'Zero fees on free events' },
              { icon: Wallet as ComponentType<{ className?: string }>, label: 'Payouts after the event' },
            ]}
          />
        </ContentSection>
      )}

      {cities.length > 0 && (
        <ContentSection surface="alt" width="wide" topBorder reveal>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            Where the weekend is on
          </p>
          <h2 className="mb-5 font-display text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">
            Cities with something on
          </h2>
          <ul role="list" className="flex flex-wrap gap-2">
            {cities.map(city => (
              <li key={city.slug}>
                <Link
                  href={`/city/${city.slug}`}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[var(--surface-2)] bg-[var(--surface-0)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--brand-accent)]/50 hover:text-[var(--text-primary)]"
                >
                  {city.name}
                  <span className="text-xs font-semibold text-[var(--brand-accent-strong)]">
                    {city.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </ContentSection>
      )}

      {/*
       * The community landings' closer, reused rather than re-rolled, exactly as
       * the category landings reuse it. `contactInterest` is the one thing this
       * page has to say differently: the default would send an organiser to
       * /contact carrying the subject "Organiser interested in This Weekend
       * events", which is not a thing anybody runs.
       */}
      <CommunityOrganiserCtaPanel
        communitySlug="this-weekend"
        communityName="weekend"
        contactInterest="create-event"
        organiserPersonas={[
          'Promoters running a Friday to Sunday run of shows',
          'Markets and community groups that sell out on a Saturday morning',
          'Venues with a quiet Sunday to fill',
        ]}
        heading="Your event, on the page people check on a Friday night."
        body="One clear fee, payouts you can plan around, and every attendee relationship stays yours. List by Friday and you are on this page for the weekend."
      />
    </PageShell>
  )
}

/**
 * One day of the weekend: its heading, its count and its grid.
 *
 * WHY THIS IS ITS OWN COMPONENT and not a block inside the map above. The grid
 * has to declare its own height so `content-visibility` can skip it without
 * guessing (close-out C8B.3), and the guard that holds that rule reads the
 * ContentSection's opening tag and the array the grid maps, then checks the two
 * name the SAME array. `eventGridIntrinsicSize(day.events.length)` beside
 * `day.events.map(...)` is correct and unreadable to that guard, which is a
 * guard firing on a right answer. Destructuring once makes both sides say
 * `events`, which is what the rule actually means.
 */
function WeekendDaySection({ day, first }: { day: WeekendDay<EventCardData>; first: boolean }) {
  const { events } = day
  const plural = events.length === 1 ? 'event' : 'events'

  return (
    <ContentSection
      surface="base"
      width="wide"
      topBorder
      reveal
      intrinsicSize={eventGridIntrinsicSize(events.length)}
    >
      {/*
       * `mb-6`, an eyebrow and a heading, and NOTHING ELSE IN THIS BLOCK.
       *
       * That is not a style choice, it is the shape `SECTION_CHROME_PX` in
       * src/lib/ui/event-grid-intrinsic.ts was MEASURED against on the city and
       * suburb templates (112/84/84 at 390/768/1440). The first version of this
       * section used `mb-8` and carried the day's count on a third line, and the
       * two together made every day section 36px taller than it reserved:
       * measured on this page at 1440, the Sunday group came back 613px against
       * 549px reserved, which is 10.4% and outside the drive's 10% budget. The
       * count moved into the eyebrow, where it costs no height at all.
       */}
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
          {events.length} {plural} {first ? 'on sale' : 'also on'}
        </p>
        <h2
          id={`day-${day.key}`}
          className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl"
        >
          {day.heading}
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {events.map(event => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </ContentSection>
  )
}
