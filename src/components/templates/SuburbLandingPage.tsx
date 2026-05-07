import Link from 'next/link'
import { Suspense } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { ContentSection } from '@/components/layout/ContentSection'
import { CityHero } from '@/components/features/city/city-hero'
import { DateFilterChips } from '@/components/features/city/date-filter-chips'
import { CityEditorialSection } from '@/components/features/city/city-editorial-section'
import { MobileStickyBar } from '@/components/features/city/mobile-sticky-bar'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { CityTileImage } from '@/components/media/CityTileImage'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import { Zap, Heart, Wallet } from 'lucide-react'
import type { ComponentType } from 'react'
import type { CityContent, SuburbContent } from '@/lib/cities/data'
import { getSuburb } from '@/lib/cities/data'

interface Props {
  city: CityContent
  suburb: SuburbContent
  heroImage: string | null
  events: EventCardData[]
  weekendEvents: EventCardData[]
  /** Map of related-suburb slug -> Pexels landscape URL. */
  relatedSuburbImages: Record<string, string | null>
}

/**
 * SuburbLandingPage - the /city/[slug]/[suburb] template.
 *
 * 8 sections per the Batch 6 spec:
 *   SS1 CityHero (suburb scoped)
 *   SS2 DateFilterChips
 *   SS3 CityEditorialSection (100-150 word suburb prose)
 *   SS4 This Week + This Weekend combined rail
 *   SS5 All [Suburb] Events Grid
 *   SS6 Related Suburbs Rail
 *   SS7 Back to [City] CTA
 *   SS8 MobileStickyBar (≤768px)
 */
export function SuburbLandingPage({
  city,
  suburb,
  heroImage,
  events,
  weekendEvents,
  relatedSuburbImages,
}: Props) {
  const relatedItems = suburb.relatedSuburbs
    .map(s => getSuburb(s))
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const cityFacingSlug = suburb.slug.startsWith(`${city.slug}-`)
    ? suburb.slug.slice(city.slug.length + 1)
    : suburb.slug

  return (
    <PageShell>
      <CityHero
        eyebrow={`${suburb.name.toUpperCase()} · ${city.name.toUpperCase()}`}
        title={`Things to do in ${suburb.name}`}
        subtitle={`${city.name}'s ${suburb.characterDescriptor}`}
        imageSrc={heroImage}
        primaryCtaLabel={`Browse ${suburb.name} events`}
        secondaryCtaLabel={`Back to ${city.name}`}
        secondaryCtaHref={`/city/${city.slug}`}
      />

      <Suspense fallback={null}>
        <DateFilterChips anchorId="all-events" />
      </Suspense>

      <CityEditorialSection
        eyebrow={`About ${suburb.name}`}
        heading={suburb.characterDescriptor}
        paragraphs={[suburb.editorial]}
      />

      {weekendEvents.length >= 4 ? (
        <ContentSection surface="alt" width="wide" topBorder>
          <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
              This week and weekend
            </p>
            <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
              On in {suburb.name} now
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {weekendEvents.slice(0, 6).map(e => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </ContentSection>
      ) : null}

      <ContentSection id="all-events" surface="base" width="wide" topBorder>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
              All upcoming
            </p>
            <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
              All {suburb.name} events
            </h2>
          </div>
          <Link
            href={`/events?city=${city.slug}&suburb=${cityFacingSlug}`}
            className="text-sm font-medium text-[var(--brand-accent)] hover:text-[var(--brand-accent-hover)]"
          >
            Open in browse view &rsaquo;
          </Link>
        </div>
        {events.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.slice(0, 24).map(e => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        ) : (
          <CategoryHeroEmpty
            eyebrow={suburb.name.toUpperCase()}
            headline={`The first ${suburb.name} event on EventLinqs could be yours.`}
            subhead={`Set up in 5 minutes, take payments in 7 days, share to WhatsApp in one tap.`}
            primaryAction={{
              label: 'Talk to us about listing',
              href: `/contact?topic=organiser&city=${city.slug}&suburb=${cityFacingSlug}`,
            }}
            secondaryAction={{ label: `Browse all ${city.name} events`, href: `/city/${city.slug}` }}
            trustPillars={[
              { icon: Zap as ComponentType<{ className?: string }>, label: 'Set up in 5 minutes' },
              { icon: Heart as ComponentType<{ className?: string }>, label: 'Zero fees on free events' },
              { icon: Wallet as ComponentType<{ className?: string }>, label: 'Payouts in 7 days' },
            ]}
          />
        )}
      </ContentSection>

      {relatedItems.length > 0 ? (
        <ContentSection surface="alt" width="wide" topBorder>
          <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
              Across {city.name}
            </p>
            <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
              Other {city.name} suburbs
            </h2>
          </div>
          <ul role="list" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {relatedItems.map(s => {
              const img = relatedSuburbImages[s.slug] ?? null
              const sub = s.slug.startsWith(`${city.slug}-`) ? s.slug.slice(city.slug.length + 1) : s.slug
              return (
                <li key={s.slug}>
                  <Link
                    href={`/city/${city.slug}/${sub}`}
                    className="group block overflow-hidden rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-navy-950)]">
                      {img ? (
                        <CityTileImage src={img} alt={`${s.name} - ${city.name}`} />
                      ) : (
                        <div
                          aria-hidden
                          className="absolute inset-0"
                          style={{
                            background:
                              'linear-gradient(135deg, var(--color-navy-950), color-mix(in oklab, var(--brand-accent) 30%, var(--color-navy-950)))',
                          }}
                        />
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-display text-sm font-semibold text-[var(--text-primary)]">
                        {s.name}
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </ContentSection>
      ) : null}

      <ContentSection surface="dark" width="wide" topBorder>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
              City directory
            </p>
            <h2 className="mt-2 font-display text-xl font-bold text-white sm:text-2xl">
              See what else is on across {city.name}.
            </h2>
          </div>
          <Link
            href={`/city/${city.slug}`}
            className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-full bg-[var(--brand-accent)] px-6 text-sm font-semibold text-[var(--color-navy-950)] transition hover:bg-[var(--brand-accent-strong)]"
          >
            Back to {city.name} &rarr;
          </Link>
        </div>
      </ContentSection>

      <MobileStickyBar
        cityName={suburb.name}
        weekendCount={weekendEvents.length}
        anchorId="all-events"
      />
    </PageShell>
  )
}
