import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'

export const metadata: Metadata = {
  title: 'Careers | EventLinqs',
  description:
    'Help build the ticketing platform for every culture. Australian-based, fully remote, sole-founder team scaling toward national launch in mid-2026. Roles open as we grow.',
  alternates: { canonical: '/careers' },
  openGraph: {
    title: 'Careers | EventLinqs',
    description:
      'Help build the ticketing platform for every culture. Engineering, design, organiser support, and community roles will open as we scale.',
    url: '/careers',
    type: 'website',
  },
}

const PILLARS = [
  {
    title: 'Real product impact',
    body:
      'Small team, no committee design, no jira purgatory. Ship the work, watch the funnel respond, iterate the next morning.',
  },
  {
    title: 'Outsized cultural reach',
    body:
      'You will work on a product used by Afrobeats, Caribbean, Bollywood, Latin, Italian, Filipino, Lunar, Gospel, Amapiano, Comedy, Spanish, K-Pop, and Reggae communities across Australia, the UK, the US, and Europe.',
  },
  {
    title: 'Honest standards',
    body:
      'No vanity metrics, no growth-hack theatre, no manufactured urgency. We measure what the buyer actually feels at checkout, the organiser actually sees in their payout, and the engineer actually has to maintain six months later.',
  },
  {
    title: 'Fair, transparent comp',
    body:
      'Salary bands published internally. Equity for every full-time hire from day one. AU labour standards (super, leave, public holidays) honoured by default.',
  },
]

const HOW_WE_WORK = [
  {
    title: 'Remote-first, Australia-anchored',
    body:
      'The team is built around Australian timezone collaboration with async overlap for global hires. Travel for offsites is reimbursed.',
  },
  {
    title: 'Trunk-based, fast cycle',
    body:
      'Production deploys multiple times a day. Feature flags for risky rollouts. Lighthouse + axe gates on every pull request. We refuse to let the test suite go red.',
  },
  {
    title: 'Strong written culture',
    body:
      'Decisions land in docs, not Slack threads. PRs link to context. We keep the conversation history future-team-readable.',
  },
  {
    title: 'Founder access',
    body:
      'No layers. Every hire works directly with the founder until the team grows past the size where that breaks. When it breaks, we redesign the structure rather than dilute the access.',
  },
]

const ROLES = [
  {
    title: 'Senior full-stack engineer',
    detail: 'TypeScript, Next.js 16, Postgres, Stripe',
    state: 'Opens Q3 2026',
  },
  {
    title: 'Product designer',
    detail: 'Mobile-first, brand-led, end-to-end ownership',
    state: 'Opens Q3 2026',
  },
  {
    title: 'Organiser success lead',
    detail: 'Onboarding, payouts, community building',
    state: 'Opens Q4 2026',
  },
  {
    title: 'Community manager (Africa-rooted cultures)',
    detail: 'Afrobeats, Amapiano, Highlife, West African, Caribbean',
    state: 'Opens Q4 2026',
  },
  {
    title: 'Community manager (Asia and Lunar cultures)',
    detail: 'Bollywood, K-Pop, Filipino, Lunar, South Asian',
    state: 'Opens Q4 2026',
  },
]

export default function CareersPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="CAREERS"
        title="Build the home for every culture."
        subtitle="EventLinqs is hiring carefully. We are not racing to fill seats. We are looking for the small group who can make the next decade of cultural ticketing actually work."
        variant="premium"
      />

      <ContentSection surface="base" width="default">
        <div className="grid gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
              The pitch
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-[var(--text-primary)] md:text-4xl">
              Ticketing was overdue for a rebuild. So we are doing it.
            </h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">
              <p>
                The dominant Australian ticketing platforms charge double-digit
                booking fees, drip-price the buyer, and treat every cultural
                event as a generic SKU. We are building the alternative:
                all-in pricing, guest checkout, real cultural depth, and
                an organiser dashboard that respects the work of putting on
                a show.
              </p>
              <p>
                Coming roles will be in engineering, design, organiser
                success, and community management. Every hire from day one
                gets equity, proper Australian employment terms, and a seat
                in shaping what we build next.
              </p>
            </div>
          </div>

          <ul className="grid gap-6 sm:grid-cols-2">
            {PILLARS.map(pillar => (
              <li
                key={pillar.title}
                className="rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-1)] p-6"
              >
                <div
                  aria-hidden="true"
                  className="mb-3 h-1 w-8 rounded-full bg-[var(--brand-accent)]"
                />
                <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                  {pillar.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {pillar.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </ContentSection>

      <ContentSection surface="alt" width="wide">
        <div className="max-w-3xl">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
            How we work
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-[var(--text-primary)] md:text-4xl">
            Small team, strong defaults, no theatre.
          </h2>
        </div>
        <ul className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {HOW_WE_WORK.map(item => (
            <li key={item.title}>
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </ContentSection>

      <ContentSection surface="base" width="default" id="roles">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-accent)]">
              Open roles
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-[var(--text-primary)] md:text-4xl">
              Roles we plan to open as we scale.
            </h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            No active openings yet. Register interest below.
          </p>
        </div>

        <ul className="mt-10 divide-y divide-[var(--surface-2)] rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)]">
          {ROLES.map(role => (
            <li
              key={role.title}
              className="flex flex-col gap-2 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-display text-base font-semibold text-[var(--text-primary)]">
                  {role.title}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {role.detail}
                </p>
              </div>
              <span className="inline-flex h-7 items-center rounded-full bg-[var(--surface-1)] px-3 text-xs font-semibold text-[var(--text-secondary)]">
                {role.state}
              </span>
            </li>
          ))}
        </ul>
      </ContentSection>

      <ContentSection surface="dark" width="default">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr] md:items-end">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-gold-400)]">
              Register interest
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-white md:text-5xl">
              We will reach out when we are hiring.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
              Email a short note about who you are, what you have shipped,
              and which role looks like a fit. We read every message. We
              reply when an opening matches.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
            <Button
              href="mailto:careers@eventlinqs.com?subject=Career%20interest"
              variant="primary"
              size="lg"
              className="w-full sm:w-auto"
            >
              Email careers@eventlinqs.com
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
