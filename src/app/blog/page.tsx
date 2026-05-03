import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'

export const metadata: Metadata = {
  title: 'Journal | EventLinqs',
  description:
    'Organiser playbooks, culture spotlights, product notes, and the working notebook of EventLinqs - the ticketing platform built for every culture.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Journal | EventLinqs',
    description:
      'Organiser playbooks, culture spotlights, and product notes from the EventLinqs team.',
    url: '/blog',
    type: 'website',
  },
}

type Beat = {
  eyebrow: string
  title: string
  blurb: string
  status: string
}

const UPCOMING: Beat[] = [
  {
    eyebrow: 'Organiser playbook',
    title: 'How to price an Afrobeats night that actually fills a venue',
    blurb:
      'A working pricing model from organisers running 1,500-cap rooms in Melbourne and Sydney, including how to handle early-bird tiers, presale codes, and the door rate that does not undercut online sales.',
    status: 'In edit',
  },
  {
    eyebrow: 'Product notes',
    title: 'Why we ship all-in pricing and never drip-priced fees',
    blurb:
      'A look at how booking fees are surfaced on EventLinqs vs the dominant Australian platforms, and why our pricing rules table is intentionally a single source of truth at checkout.',
    status: 'In edit',
  },
  {
    eyebrow: 'Culture spotlight',
    title: 'Detty December: the global circuit of West African end-of-year events',
    blurb:
      'Detty December is no longer just a Lagos phenomenon. We map the calendar from Accra to Houston to Melbourne and break down what makes the week between Christmas and New Year the most productive ticketing window of the year for African-rooted events.',
    status: 'Drafting',
  },
  {
    eyebrow: 'Engineering',
    title: 'Streaming-SSR and Lighthouse on a culturally rich homepage',
    blurb:
      'How the EventLinqs homepage flushes a static shell, streams below-fold rails in parallel Suspense boundaries, and stays in the Lighthouse 90+ band on mobile while still rendering 30+ rich event cards on first paint.',
    status: 'Drafting',
  },
  {
    eyebrow: 'Organiser playbook',
    title: 'The one spreadsheet every organiser still maintains and what we are doing about it',
    blurb:
      'Most organisers run their event from a Google Sheet that tracks tier prices, comp lists, door allocations, and split-pay arrangements with co-promoters. We unpack what that sheet really tracks and how the EventLinqs dashboard is rebuilt around it.',
    status: 'Outlined',
  },
  {
    eyebrow: 'Culture spotlight',
    title: 'How Bollywood weddings became a ticketed business in Sydney',
    blurb:
      'Wedding-adjacent celebrations like sangeet, mehendi, and reception nights are now a measurable secondary market for cultural organisers. We talk to three Sydney organisers about pricing, programming, and platform expectations.',
    status: 'Outlined',
  },
]

const BEATS = [
  {
    title: 'Organiser playbook',
    body: 'Pricing strategy, marketing playbooks, ops checklists, and post-event reviews from organisers who fill rooms.',
  },
  {
    title: 'Culture spotlight',
    body: 'Deep features on the cultural rhythms EventLinqs serves: Afrobeats, Caribbean, Bollywood, Latin, Lunar, Gospel, Amapiano, K-Pop, Reggae and beyond.',
  },
  {
    title: 'Product notes',
    body: 'How we make decisions about pricing, search, payouts, refunds, and discovery, written by the people who actually shipped them.',
  },
  {
    title: 'Engineering',
    body: 'Behind-the-scenes of how the platform is built: streaming SSR, Lighthouse work, Stripe destination charges, and the database choices that scale to thousands of organisers.',
  },
]

export default function BlogPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="JOURNAL"
        title="The EventLinqs Journal"
        subtitle="Organiser playbooks, culture spotlights, product notes, and the occasional engineering deep-dive. Coming weekly from launch in mid-2026."
        variant="premium"
      />

      <ContentSection surface="base" width="wide">
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
              What we publish
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-[var(--text-primary)] md:text-4xl">
              Four beats. Real depth. No content marketing fluff.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
              The Journal is the working notebook of the team building
              EventLinqs. We publish about the things we are actually
              shipping and the organisers we are actually working with.
            </p>
          </div>

          <ul className="grid gap-6 sm:grid-cols-2">
            {BEATS.map(beat => (
              <li
                key={beat.title}
                className="rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-6"
              >
                <div
                  aria-hidden="true"
                  className="mb-3 h-1 w-8 rounded-full bg-[var(--brand-accent)]"
                />
                <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                  {beat.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {beat.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </ContentSection>

      <ContentSection surface="alt" width="wide" topBorder>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
              Coming soon
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-[var(--text-primary)] md:text-4xl">
              The first run of pieces.
            </h2>
          </div>
          <p className="max-w-md text-sm text-[var(--text-secondary)]">
            We will publish in order of usefulness, not vanity. Subscribe
            below to get each piece the morning it lands.
          </p>
        </div>

        <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {UPCOMING.map(piece => (
            <li
              key={piece.title}
              className="flex h-full flex-col rounded-2xl bg-[var(--surface-0)] p-6"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
                  {piece.eyebrow}
                </span>
                <span className="inline-flex h-6 items-center rounded-full bg-[var(--surface-1)] px-3 text-xs font-semibold text-[var(--text-secondary)]">
                  {piece.status}
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-bold leading-snug text-[var(--text-primary)]">
                {piece.title}
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                {piece.blurb}
              </p>
            </li>
          ))}
        </ul>
      </ContentSection>

      <ContentSection surface="dark" width="default">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr] md:items-end">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-gold-400)]">
              Stay in the loop
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-white md:text-5xl">
              Get the Journal in your inbox.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
              One email per piece, no roundup spam, no sponsored sections,
              never sold or shared. Unsubscribe in one click.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
            <Button
              href="mailto:journal@eventlinqs.com?subject=Subscribe%20to%20the%20Journal"
              variant="primary"
              size="lg"
              className="w-full sm:w-auto"
            >
              Subscribe by email
            </Button>
            <Link
              href="/contact"
              className="inline-flex h-12 items-center justify-center rounded-lg px-6 text-base font-medium text-white/90 underline-offset-4 hover:underline"
            >
              Pitch a story
            </Link>
          </div>
        </div>
      </ContentSection>
    </PageShell>
  )
}
