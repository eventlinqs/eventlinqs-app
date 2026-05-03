import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'

export const metadata: Metadata = {
  title: 'About | EventLinqs',
  description:
    'EventLinqs is the ticketing platform built for every culture. All-in pricing, guest checkout, and tools that respect both organisers and attendees. Headquartered in Geelong, Australia, serving organisers nationwide.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About | EventLinqs',
    description:
      'The ticketing platform built for every culture. All-in pricing, guest checkout, and tools that respect both organisers and attendees.',
    url: '/about',
    type: 'website',
  },
}

const VALUES = [
  {
    title: 'Fan first',
    body:
      'Every product decision starts with the person buying the ticket. If a feature makes the seller richer but the buyer more frustrated, it does not ship.',
  },
  {
    title: 'All-in pricing',
    body:
      'The price you see on the listing is the price you pay at checkout. No drip pricing, no surprise service fees, no resort-fee tactics imported from US ticketing.',
  },
  {
    title: 'Culture-led, not generic',
    body:
      'Afrobeats, Caribbean, Bollywood, Latin, Italian, Filipino, Lunar, Gospel, Amapiano, Comedy, Spanish, K-Pop, Reggae, and more. We learn the rhythms before we promise discovery.',
  },
  {
    title: 'Built for trust',
    body:
      'Stripe payments, PCI-DSS compliance, GDPR aligned, real Australian business behind the platform. Organisers get paid on time, fans get refunded when things go wrong.',
  },
  {
    title: 'Mobile-first by default',
    body:
      'The vast majority of ticket purchases happen on a phone, often on patchy carrier data on the way to a venue. Every screen is built for that reality first.',
  },
  {
    title: 'No dark patterns',
    body:
      'No countdown manipulation, no shame-based unsubscribe, no auto-opt-in marketing, no fake urgency. We win on product, not psychology tricks.',
  },
]

const STATS = [
  { value: '2026', label: 'Founded' },
  { value: 'AU · UK · US · EU', label: 'Launch markets' },
  { value: '18', label: 'Cultures from day one' },
  { value: '100%', label: 'All-in pricing' },
]

const PRINCIPLES = [
  {
    title: 'Transparent fees',
    body:
      'Every fee on the platform is read from a single pricing rules table at checkout. Nothing is hardcoded. Free events pay zero platform fees, unconditionally.',
  },
  {
    title: 'Guest checkout',
    body:
      'You should not have to create an account to buy a ticket. Email + payment, two taps, done. Account creation is opt-in afterwards.',
  },
  {
    title: 'Every culture, marketed properly',
    body:
      'Discovery is organised by cultural rhythm, not generic genre buckets. Browse by Afrobeats, Caribbean, Bollywood, Latin, Italian, Filipino, Lunar, Gospel, Amapiano, Comedy, Spanish, K-Pop, Reggae, West African, European, Asian, African, South Asian.',
  },
  {
    title: 'Sustainable economics',
    body:
      'Ticketing is a service, not an attention business. We charge a small, fully disclosed platform fee and a payment processor fee. We do not sell your data, run ads against your event, or upsell add-ons we did not earn.',
  },
]

export default function AboutPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="ABOUT"
        title="Built for every culture"
        subtitle="The ticketing platform built for every culture. All-in pricing, guest checkout, and tools that respect both organisers and attendees."
        variant="premium"
      />

      <ContentSection surface="base" width="default">
        <div className="grid gap-12 md:grid-cols-3 md:gap-16">
          <div className="md:col-span-2">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
              Our mission
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-[var(--text-primary)] md:text-4xl">
              Make every event easier to find, buy, and put on.
            </h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">
              <p>
                Australian ticketing has spent two decades being run by global
                gatekeepers who treat every cultural event the same: a search
                box, a stack of fees, a checkout that fights the buyer. The
                people putting on Afrobeats nights in Melbourne, Bollywood
                weddings in Sydney, Caribbean carnivals on the Gold Coast,
                Filipino festivals in Brisbane, and Lunar New Year galas in
                Perth deserve better infrastructure than that.
              </p>
              <p>
                EventLinqs is a fan-first ticketing platform that takes every
                culture seriously, treats every organiser like an actual
                business partner, and refuses to dress up a checkout fee as
                a service charge. The product is the work. We measure ourselves
                against the global benchmarks (Ticketmaster, DICE, Eventbrite,
                Humanitix) and iterate until we beat them on every public
                surface that matters: search, discovery, pricing transparency,
                checkout speed, and post-event experience.
              </p>
            </div>
          </div>

          <dl className="space-y-6 border-l border-[var(--surface-2)] pl-8 md:pl-10">
            {STATS.map(stat => (
              <div key={stat.label}>
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  {stat.label}
                </dt>
                <dd className="mt-1 font-display text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </ContentSection>

      <ContentSection surface="alt" width="wide" topBorder>
        <div className="max-w-3xl">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
            What we believe
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-[var(--text-primary)] md:text-4xl">
            Six rules we keep coming back to.
          </h2>
        </div>
        <ul className="mt-12 grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {VALUES.map(v => (
            <li key={v.title}>
              <div
                aria-hidden="true"
                className="mb-4 h-1 w-10 rounded-full bg-[var(--brand-accent)]"
              />
              <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
                {v.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
                {v.body}
              </p>
            </li>
          ))}
        </ul>
      </ContentSection>

      <ContentSection surface="base" width="default">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
              Founder
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-[var(--text-primary)] md:text-4xl">
              Started in Geelong. Built for everywhere.
            </h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">
              <p>
                EventLinqs was founded by Lawal Adams in Geelong, Victoria.
                Australian-Nigerian, sole founder, building the platform he
                wished existed when his community had to use a patchwork of
                Eventbrite, Facebook events, and bank-transfer DMs to put on
                cultural events that mattered.
              </p>
              <p>
                The platform is operated as an Australian sole trader (ABN
                30 837 447 587) and will convert to a Pty Ltd structure once
                investor onboarding or revenue justifies it. Every line of
                code, every brand decision, and every pricing rule sits
                inside that single accountable entity.
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--surface-1)] p-8 md:p-10">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
              Operating principles
            </p>
            <ul className="mt-6 space-y-6">
              {PRINCIPLES.map(p => (
                <li key={p.title}>
                  <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                    {p.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {p.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </ContentSection>

      <ContentSection surface="dark" width="wide">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:gap-16">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-gold-400)]">
              Get involved
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-white md:text-5xl">
              Every culture. Every event. One platform.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
              Whether you are putting on your first event or running a
              cultural calendar that fills venues every weekend, the
              platform is built to work for you. Free for free events.
              Transparent for paid ones.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Button href="/organisers" variant="primary" size="lg" className="w-full sm:w-auto">
              For organisers
            </Button>
            <Button
              href="/events"
              variant="secondary"
              onSurface="dark"
              size="lg"
              className="w-full sm:w-auto"
            >
              Browse events
            </Button>
            <Link
              href="/contact"
              className="inline-flex h-12 items-center justify-center rounded-lg px-6 text-base font-medium text-white/90 underline-offset-4 hover:underline"
            >
              Talk to a human
            </Link>
          </div>
        </div>
      </ContentSection>
    </PageShell>
  )
}
