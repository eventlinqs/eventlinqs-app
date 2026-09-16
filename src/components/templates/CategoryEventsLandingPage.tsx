import Link from 'next/link'
import { Zap, Heart, Wallet, ArrowRight } from 'lucide-react'
import type { ComponentType } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { Prose } from '@/components/ui/Prose'
import { PhotographicCategoryHero } from '@/components/templates/PhotographicCategoryHero'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import { CommunityOrganiserCtaPanel } from '@/components/features/community/community-organiser-cta'
import { EventCard } from '@/components/features/events/event-card'
import type { EventCardData } from '@/components/features/events/event-card'
import type { CategoryEditorial } from '@/lib/categories/category-editorial'

export interface CategorySibling {
  slug: string
  name: string
}

interface Props {
  /** The live row: the name is the database's, never a second copy. */
  name: string
  editorial: CategoryEditorial
  /** Resolved by the page when neither the spine nor a bundled raster covers it. */
  heroImage: string | null
  events: EventCardData[]
  /** Every other category that is a real page, for the cross-link strip. */
  siblings: CategorySibling[]
}

/**
 * THE REAL CATEGORY LANDING, `/categories/[slug]` for the live taxonomy.
 *
 * ============================================================================
 * WHY THIS IS A PAGE AND NOT A REDIRECT, WHICH IT WAS UNTIL TODAY
 * ============================================================================
 *
 * On 25 August 2026 every real category slug was made to permanently redirect to
 * `/events?category=<slug>`, and the reasoning written into that route was
 * sound at the time: "inventing twenty-two landing pages of editorial nobody
 * wrote would be the generic template Law 1 exists to refuse".
 *
 * What that reasoning did not account for is what the redirect cost in search.
 * `/events?category=music` canonicalises to `/events`, so the platform had no
 * page that could rank for "comedy tickets", "festivals near me" or any other
 * head category query, and the nine category tiles on the homepage spent their
 * internal link equity pointing at a page that could not rank for the term each
 * one named. Close-out SEO3 measured the result: a total indexable inventory of
 * roughly 37 pages.
 *
 * The answer to "no editorial exists" is to write it, which is what
 * src/lib/categories/category-editorial.ts is, and to make the build refuse a
 * category page that has none, which is what
 * scripts/guards/discovery-indexability.mjs does. The answer is not a redirect
 * that keeps the surface invisible.
 *
 * ============================================================================
 * SHAPE, AND WHY EACH PART IS THE SHAPE IT IS
 * ============================================================================
 *
 *   1. PhotographicCategoryHero  the platform hero scale, one treatment.
 *   2. The story                 the unique copy. Two paragraphs, its own h2.
 *   3. The events                a GRID, not a rail. `/community/[slug]` is the
 *                                closest existing page type and it uses a grid,
 *                                and the competitor evidence for a category page
 *                                is a grid rather than a horizontal scroller: on
 *                                a page whose whole job is the inventory, a rail
 *                                shows four of it.
 *   4. The sibling strip         every other category page, linked. This is the
 *                                half the query-string tiles were never doing:
 *                                twenty-two pages that link to each other are a
 *                                crawlable section, and twenty-two orphans are
 *                                twenty-two orphans.
 *   5. The organiser closer      shared with the community landings rather than
 *                                re-rolled, per the one-implementation rule.
 *
 * The zero-event state is the SHARED CategoryHeroEmpty, the same designed empty
 * state behind every community, city and category page, never a bare "no
 * results" (CLAUDE.md, Scene layer). The page still renders, still carries its
 * copy and still self-canonicalises; only the robots directive moves, and that
 * is decided in the route, not here.
 */
export function CategoryEventsLandingPage({ name, editorial, heroImage, events, siblings }: Props) {
  const { slug, eyebrow, h1, intro, storyHeadline, storyParagraphs, personas, seeAlso } = editorial

  return (
    <PageShell>
      <PhotographicCategoryHero
        slug={slug}
        eyebrow={eyebrow}
        title={h1}
        subtitle={intro}
        fallbackImage={heroImage}
      />

      <ContentSection surface="base" width="default" reveal>
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            Why {name} on EventLinqs
          </p>
          <Prose>
            <h2 id="story">{storyHeadline}</h2>
            {storyParagraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </Prose>
          {seeAlso && (
            <p className="mt-6">
              <Link
                href={seeAlso.href}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-accent-strong)] transition-colors hover:text-[var(--brand-accent-strong-hover)]"
              >
                {seeAlso.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </p>
          )}
        </div>
      </ContentSection>

      <ContentSection surface="base" width="wide" topBorder reveal>
        {events.length > 0 ? (
          <>
            <div className="mb-8">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
                On sale now
              </p>
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                {name} events across Australia
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {events.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </>
        ) : (
          <CategoryHeroEmpty
            eyebrow={eyebrow}
            headline={`The first ${name} event on EventLinqs could be yours.`}
            subhead={`${intro} Set up in five minutes, take payments, and keep every attendee relationship.`}
            primaryAction={{ label: 'Start selling tickets', href: '/organisers/signup' }}
            secondaryAction={{ label: 'Browse all events', href: '/events' }}
            trustPillars={[
              { icon: Zap as ComponentType<{ className?: string }>, label: 'Set up in five minutes' },
              { icon: Heart as ComponentType<{ className?: string }>, label: 'Zero fees on free events' },
              { icon: Wallet as ComponentType<{ className?: string }>, label: 'Payouts after the event' },
            ]}
          />
        )}
      </ContentSection>

      {siblings.length > 0 && (
        <ContentSection surface="alt" width="wide" topBorder reveal>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
            Browse every category
          </p>
          <h2 className="mb-5 font-display text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">
            More of what is on
          </h2>
          <ul role="list" className="flex flex-wrap gap-2">
            {siblings.map(sibling => (
              <li key={sibling.slug}>
                <Link
                  href={`/categories/${sibling.slug}`}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-[var(--surface-2)] bg-[var(--surface-0)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--brand-accent)]/50 hover:text-[var(--text-primary)]"
                >
                  {sibling.name}
                </Link>
              </li>
            ))}
          </ul>
        </ContentSection>
      )}

      {/*
       * The community landings' closer, reused rather than re-rolled. It renders
       * from a name and a persona list and carries no community-specific logic,
       * so a second copy of the same band would be one more place for the two to
       * drift apart. The two copy lines it would otherwise hardcode are passed
       * in, so the champion surface is unchanged by this reuse.
       */}
      <CommunityOrganiserCtaPanel
        communitySlug={slug}
        communityName={name}
        organiserPersonas={personas}
        heading={`Built for the people who run ${name} events.`}
        body={`One clear fee, payouts you can plan around, and every attendee relationship stays yours. That is the whole pitch for ${name} organisers.`}
      />
    </PageShell>
  )
}
