import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { FOUNDING_TERMS } from '@/lib/payments/founding-waiver'
import { ORGANISER_SIGNUP_PATH, withSignupSource } from '@/lib/organisers/signup-source'

export const metadata: Metadata = {
  title: 'How are you selling tickets? | EventLinqs',
  description: 'Sell tickets on EventLinqs with your own ticket page, checkout and payouts, or list an event you already sell elsewhere, free.',
  alternates: { canonical: '/start' },
}

/**
 * ONE DOOR, TWO PATHS (Lawal's ruling of 8 November 2026, 16:13, build 1; researched in
 * C:\dev\EVIDENCE\EL-8NOV\one-door\leaders-one-door.md). Every "Get started", "Hosting an event?", "List your event" and
 * "Sell tickets" link lands here and asks one question. Selling on EventLinqs goes to the organiser account, where an
 * event is published the moment its organiser publishes it; already selling elsewhere goes to the listing form, which
 * checks the event against its own booking page and publishes it itself. The leaders have only the first path. The offer
 * is rendered from its one module (FOUNDING_TERMS, LAW 24), never typed here.
 */
export default async function StartPage({ searchParams }: { searchParams: Promise<{ city?: string; src?: string }> }) {
  const { city, src } = await searchParams
  // A city guide's own link names its city; it rides on to the path chosen. Anything that is not a plain slug is dropped.
  const slug = city && /^[a-z0-9-]{1,60}$/.test(city) ? city : null
  // Where the organiser came from (the footer, /organisers, a city guide) rides on to the sign up, so it is recorded.
  const source = src && /^[a-z0-9-]{1,40}$/.test(src) ? src : 'door'
  const sell = withSignupSource(ORGANISER_SIGNUP_PATH, source)
  const list = slug ? `/submit-event?city=${slug}#submit` : '/submit-event#submit'
  return (
    <PageShell>
      <PageHero eyebrow="FOR ORGANISERS" title="How are you selling tickets?" subtitle="Two ways onto EventLinqs. Pick the one that fits your event." />
      <ContentSection surface="base" width="wide">
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 md:gap-6" data-door>
          <li className="flex flex-col rounded-2xl border border-ink-200 bg-white p-6 shadow-[var(--shadow-card)] md:p-8" data-door-path="sell">
            <p className="type-eyebrow m-0 font-display text-[var(--brand-accent-strong)]">SELL ON EVENTLINQS</p>
            <h2 className="mt-2 font-headline text-2xl font-extrabold text-[var(--text-primary)]">Your own ticket page, checkout and payouts</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
              Create your event in your organiser account and it is live the moment you publish. Buyers get tickets on EventLinqs, and you are paid out.
            </p>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">{FOUNDING_TERMS.initial}</p>
            <div className="mt-6 md:mt-auto md:pt-6">
              <Button href={sell} variant="primary" size="lg" className="w-full sm:w-auto">
                Start selling
              </Button>
            </div>
          </li>
          <li className="flex flex-col rounded-2xl border border-ink-200 bg-white p-6 shadow-[var(--shadow-card)] md:p-8" data-door-path="list">
            <p className="type-eyebrow m-0 font-display text-[var(--brand-accent-strong)]">ALREADY SELLING ELSEWHERE?</p>
            <h2 className="mt-2 font-headline text-2xl font-extrabold text-[var(--text-primary)]">List your event free</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
              Paste the link to where you sell tickets. We check your event against that page and list it with your photo, usually within minutes, with a button straight to your booking page.
            </p>
            <div className="mt-6 md:mt-auto md:pt-6">
              <Button href={list} variant="secondary" size="lg" className="w-full sm:w-auto">
                List your event
              </Button>
            </div>
          </li>
        </ul>
      </ContentSection>
    </PageShell>
  )
}
