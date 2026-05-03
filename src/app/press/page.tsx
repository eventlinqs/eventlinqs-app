import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'

export const metadata: Metadata = {
  title: 'Press | EventLinqs',
  description:
    'Press resources, founder bio, brand assets, and media contact for EventLinqs - the ticketing platform built for every culture.',
  alternates: { canonical: '/press' },
  openGraph: {
    title: 'Press | EventLinqs',
    description:
      'Press resources, founder bio, brand assets, and media contact for EventLinqs.',
    url: '/press',
    type: 'website',
  },
}

const FACTS = [
  { label: 'Company', value: 'EventLinqs' },
  { label: 'Founded', value: '2026' },
  { label: 'Founder', value: 'Lawal Adams' },
  { label: 'Headquarters', value: 'Geelong, Victoria, Australia' },
  { label: 'Business entity', value: 'Australian sole trader, ABN 30 837 447 587' },
  { label: 'Launch markets', value: 'Australia, United Kingdom, United States, European Union' },
  { label: 'Categories supported at launch', value: '18 cultural rhythms across music, festival, comedy, family, and community events' },
  { label: 'Payments', value: 'Stripe (PCI-DSS, GDPR aligned)' },
  { label: 'Press email', value: 'press@eventlinqs.com' },
]

const ASSETS = [
  {
    title: 'Brand assets',
    body:
      'Logo lockups, wordmark, brand colours, and approved photography for editorial use. Available on request.',
    cta: 'Request assets',
    href: 'mailto:press@eventlinqs.com?subject=Brand%20asset%20request',
  },
  {
    title: 'Founder photography',
    body:
      'Studio and lifestyle portraits of founder Lawal Adams, with location and credit information. Available on request.',
    cta: 'Request photography',
    href: 'mailto:press@eventlinqs.com?subject=Founder%20photography%20request',
  },
  {
    title: 'Product imagery',
    body:
      'Approved screenshots of the EventLinqs web product (homepage, event detail, organiser dashboard). Available on request.',
    cta: 'Request imagery',
    href: 'mailto:press@eventlinqs.com?subject=Product%20imagery%20request',
  },
]

const STORYLINES = [
  {
    title: 'Why Australian ticketing was overdue for rebuild',
    body:
      'Booking fees as high as 18%, drip pricing, generic genre buckets, and checkout flows still optimised for desktop. The cultural events market was being served by infrastructure built for stadium tours.',
  },
  {
    title: 'Culture-first discovery, by design',
    body:
      'Browse rails are organised by cultural rhythm rather than generic music genre. Afrobeats, Caribbean, Bollywood, Latin, Italian, Filipino, Lunar, Gospel, Amapiano, Comedy, Spanish, K-Pop, Reggae, West African, European, Asian, African, South Asian.',
  },
  {
    title: 'A solo Australian-Nigerian founder',
    body:
      'Geelong-based, sole founder, building toward national launch in mid-2026 without venture funding. The product is the work, the platform is the proof.',
  },
  {
    title: 'All-in pricing as a structural commitment',
    body:
      'Every fee on the platform is read from a single pricing rules table at checkout, never hardcoded. Free events pay zero platform fees, unconditionally. The price you see is the price you pay.',
  },
]

export default function PressPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="PRESS"
        title="EventLinqs in the press"
        subtitle="Founder bio, fact sheet, brand assets, and direct media contact. We aim to reply to journalists within one business day."
        variant="premium"
      />

      <ContentSection surface="base" width="default">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
              Company at a glance
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-[var(--text-primary)] md:text-4xl">
              The ticketing platform built for every culture.
            </h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">
              <p>
                EventLinqs is an Australian-founded ticketing platform
                building toward national launch across Australia, the
                United Kingdom, the United States, and the European Union
                in mid-2026. The product is designed mobile-first, prices
                tickets all-in by default, and organises discovery around
                18 cultural rhythms rather than generic genre buckets.
              </p>
              <p>
                The platform is operated by sole founder Lawal Adams, who
                is Australian-Nigerian and based in Geelong, Victoria.
                EventLinqs is a registered Australian business (ABN 30 837
                447 587) and processes payments through Stripe with full
                PCI-DSS and GDPR alignment.
              </p>
            </div>
          </div>

          <dl className="rounded-2xl bg-[var(--surface-1)] p-6 md:p-8">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
              Fact sheet
            </p>
            <div className="mt-6 space-y-5">
              {FACTS.map(fact => (
                <div key={fact.label}>
                  <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                    {fact.label}
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-[var(--text-primary)] md:text-base">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </div>
          </dl>
        </div>
      </ContentSection>

      <ContentSection surface="alt" width="wide" topBorder>
        <div className="max-w-3xl">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
            Founder bio
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-[var(--text-primary)] md:text-4xl">
            Lawal Adams
          </h2>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
            Founder &nbsp;·&nbsp; Geelong, Victoria
          </p>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">
            <p>
              Lawal Adams is the sole founder of EventLinqs. Australian-Nigerian,
              based in Geelong, he started EventLinqs after years of watching
              the ticketing infrastructure available to cultural organisers
              in Australia stay stuck a decade behind what artists and
              audiences actually need.
            </p>
            <p>
              He built EventLinqs from first principles: a fan-first
              ticketing experience with all-in pricing and guest checkout,
              an organiser dashboard that treats event runners as business
              partners rather than catalogue listings, and a discovery
              system that takes cultural rhythm seriously. He is reachable
              for interviews via the press email below.
            </p>
          </div>
        </div>
      </ContentSection>

      <ContentSection surface="base" width="wide">
        <div className="max-w-3xl">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
            Story angles
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-[var(--text-primary)] md:text-4xl">
            What journalists have asked us about.
          </h2>
        </div>
        <ul className="mt-12 grid gap-8 md:grid-cols-2">
          {STORYLINES.map(story => (
            <li
              key={story.title}
              className="rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] p-6 md:p-8"
            >
              <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
                {story.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)] md:text-base">
                {story.body}
              </p>
            </li>
          ))}
        </ul>
      </ContentSection>

      <ContentSection surface="alt" width="wide">
        <div className="max-w-3xl">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
            Assets
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-[var(--text-primary)] md:text-4xl">
            Approved press materials.
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)]">
            Press kits, founder photography, and approved product imagery
            are available on request. We aim to respond to media requests
            within one business day.
          </p>
        </div>
        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {ASSETS.map(asset => (
            <li
              key={asset.title}
              className="flex h-full flex-col rounded-2xl bg-[var(--surface-0)] p-6"
            >
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                {asset.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                {asset.body}
              </p>
              <div className="mt-5">
                <Button href={asset.href} variant="secondary" size="sm">
                  {asset.cta}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </ContentSection>

      <ContentSection surface="dark" width="default">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr] md:items-end">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-gold-400)]">
              Press contact
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-white md:text-5xl">
              Talk to us directly.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
              For interviews, deeper background, off-the-record context,
              embargoed launch information, or asset requests, email the
              founder directly. Replies usually within one business day,
              Australian Eastern time.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
            <Button
              href="mailto:press@eventlinqs.com"
              variant="primary"
              size="lg"
              className="w-full sm:w-auto"
            >
              press@eventlinqs.com
            </Button>
            <Link
              href="/about"
              className="inline-flex h-12 items-center justify-center rounded-lg px-6 text-base font-medium text-white/90 underline-offset-4 hover:underline"
            >
              About EventLinqs
            </Link>
          </div>
        </div>
      </ContentSection>
    </PageShell>
  )
}
