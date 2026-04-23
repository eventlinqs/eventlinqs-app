import Link from 'next/link'
import type { ComponentType } from 'react'
import {
  Zap,
  Heart,
  Wallet,
  Users,
  Sparkles,
  Globe2,
  MessagesSquare,
  Star,
  Music,
  type LucideProps,
} from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Prose } from '@/components/ui/Prose'
import { Button } from '@/components/ui/Button'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'
import { EventCard } from '@/components/features/events/event-card'
import type { EventCardData } from '@/components/features/events/event-card'
import type { HeroCategory } from '@/lib/hero-categories'

/** Map string icon names (stored in data file) to actual Lucide components. */
const ICON_MAP: Record<string, ComponentType<LucideProps>> = {
  Zap,
  Heart,
  Wallet,
  Users,
  Sparkles,
  Globe2,
  MessagesSquare,
  Star,
  Music,
}

function resolveIcon(name: string): ComponentType<{ className?: string }> {
  return (ICON_MAP[name] ?? Sparkles) as ComponentType<{ className?: string }>
}

interface CategoryLandingPageProps {
  category: HeroCategory
  liveEvents?: EventCardData[]
}

export function CategoryLandingPage({ category, liveEvents = [] }: CategoryLandingPageProps) {
  const {
    slug,
    displayName,
    eyebrowLabel,
    heroHeadline,
    heroBody,
    storyHeadline,
    storyParagraphs,
    valuePillars,
    sampleOrganiserPersonas,
    relatedCities,
  } = category

  return (
    <PageShell>
      {/* ── 1. Hero — premium variant ─────────────────────────────── */}
      <PageHero
        eyebrow={eyebrowLabel}
        title={heroHeadline}
        subtitle={heroBody}
        variant="premium"
      />

      {/* ── 2. Story / Why this category ─────────────────────────── */}
      <ContentSection surface="base" width="default">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
            Why {displayName} on EventLinqs
          </p>
          <Prose>
            <h2 id="story">{storyHeadline}</h2>
            {storyParagraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </Prose>
        </div>
      </ContentSection>

      {/* ── 3. Value pillar cards ─────────────────────────────────── */}
      <ContentSection surface="alt" width="default" topBorder>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {valuePillars.map((pillar) => {
            const Icon = resolveIcon(pillar.icon)
            return (
              <div
                key={pillar.title}
                className="group rounded-xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg"
              >
                {/* Icon in soft circle */}
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-accent)]/10 transition-colors group-hover:bg-[var(--brand-accent)]/15">
                  <Icon className="h-6 w-6 text-[var(--brand-accent)]" />
                </div>
                {/* Title with accent underline */}
                <h3 className="mt-4 inline-block border-b-2 border-[var(--brand-accent)]/30 pb-0.5 text-base font-semibold text-[var(--text-primary)] transition-colors group-hover:border-[var(--brand-accent)]/70">
                  {pillar.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {pillar.body}
                </p>
              </div>
            )
          })}
        </div>
      </ContentSection>

      {/* ── 4. Live events OR CategoryHeroEmpty ──────────────────── */}
      <ContentSection surface="base" width="wide">
        {liveEvents.length > 0 ? (
          <>
            <div className="mb-8 flex items-end justify-between gap-4">
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                Live {displayName} events
              </h2>
              <Link
                href={`/events?category=${slug}`}
                className="shrink-0 text-sm font-medium text-[var(--brand-accent)] hover:text-[var(--brand-accent-hover)] transition-colors"
              >
                View all &rsaquo;
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {liveEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </>
        ) : (
          <CategoryHeroEmpty
            eyebrow={eyebrowLabel}
            headline={`The first ${displayName} event on EventLinqs could be yours.`}
            subhead={`${category.tagline} We're built for this. Set up in 5 minutes, take payments in 7 days, share to WhatsApp in one tap.`}
            primaryAction={{
              // TODO(Session 2): replace with direct signup once /auth/signup?role=organiser is built
              label: 'Talk to us about listing',
              href: `/contact?topic=organiser&interest=${slug}`,
            }}
            secondaryAction={{
              label: 'Browse all events',
              href: '/events',
            }}
            trustPillars={[
              { icon: Zap as ComponentType<{ className?: string }>, label: 'Set up in 5 minutes' },
              { icon: Heart as ComponentType<{ className?: string }>, label: 'Zero fees on free events' },
              { icon: Wallet as ComponentType<{ className?: string }>, label: 'Payouts in 7 days' },
            ]}
          />
        )}
      </ContentSection>

      {/* ── 5. Made for organisers like… — pill layout ───────────── */}
      <ContentSection surface="alt" width="default">
        <div className="flex flex-col gap-10 lg:flex-row lg:gap-16">
          {/* Persona pills */}
          <div className="flex-1">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
              Built for
            </p>
            <h3 className="mb-5 font-display text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">
              Made for organisers like&hellip;
            </h3>
            <div className="flex flex-wrap gap-2">
              {sampleOrganiserPersonas.map((persona) => (
                <span
                  key={persona}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-accent)]/25 bg-[var(--brand-accent)]/8 px-3.5 py-1.5 text-sm text-[var(--text-primary)]"
                >
                  <Users className="h-3.5 w-3.5 shrink-0 text-[var(--brand-accent)]" aria-hidden="true" />
                  {persona}
                </span>
              ))}
            </div>
          </div>

          {/* Active cities */}
          <div className="shrink-0 lg:w-64">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
              Active in
            </p>
            <div className="flex flex-wrap gap-2">
              {relatedCities.map((city) => (
                <span
                  key={city}
                  className="rounded-full border border-[var(--surface-2)] bg-[var(--surface-0)] px-3 py-1 text-sm text-[var(--text-secondary)]"
                >
                  {city}
                </span>
              ))}
            </div>
          </div>
        </div>
      </ContentSection>

      {/* ── 6. Final CTA — dark band, single centred button ──────── */}
      <section className="relative overflow-hidden bg-[var(--surface-dark)] py-20 md:py-28 lg:py-32 [content-visibility:auto] [contain-intrinsic-size:auto_560px]">
        {/* Top accent border */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, var(--brand-accent) 50%, transparent 100%)',
            opacity: 0.6,
          }}
          aria-hidden="true"
        />
        {/* Radial glow — brand accent, centre-right */}
        <div
          className="pointer-events-none absolute"
          style={{
            top: '-20%',
            right: '-10%',
            width: '65%',
            height: '140%',
            background: 'radial-gradient(ellipse 70% 60% at 100% 50%, var(--brand-accent), transparent 60%)',
            opacity: 0.10,
          }}
          aria-hidden="true"
        />
        {/* Radial glow — white, bottom-left */}
        <div
          className="pointer-events-none absolute"
          style={{
            bottom: '-10%',
            left: '-5%',
            width: '55%',
            height: '80%',
            background: 'radial-gradient(ellipse 60% 50% at 0% 100%, rgb(255 255 255), transparent 50%)',
            opacity: 0.04,
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-8 text-center">
            <div className="max-w-2xl">
              {/* Section marker */}
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
                For Organisers
              </p>
              <h2 className="font-display text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
                Ready to put your {displayName} event on the map?
              </h2>
              <p className="mt-4 text-base leading-relaxed text-white/65 sm:text-lg">
                Join the organisers who&apos;ve made EventLinqs their home. Transparent fees,
                real human support, and a platform that actually understands the culture.
              </p>
            </div>
            {/* TODO(Session 2): replace with /auth/signup?role=organiser once built */}
            <Button
              variant="primary"
              size="lg"
              onSurface="dark"
              href={`/contact?topic=organiser&interest=${slug}`}
            >
              Talk to us about your event
            </Button>
          </div>
        </div>
      </section>
    </PageShell>
  )
}
