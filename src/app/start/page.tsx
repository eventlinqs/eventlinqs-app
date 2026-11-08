import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { Button } from '@/components/ui/Button'
import { FOUNDING_INITIAL_MONTHS_WORD } from '@/lib/payments/founding-waiver'
import { ORGANISER_SIGNUP_PATH, withSignupSource } from '@/lib/organisers/signup-source'

export const metadata: Metadata = {
  title: 'How are you selling tickets? | EventLinqs',
  description: 'Sell tickets on EventLinqs with your own ticket page, checkout and payouts, or list an event you already sell elsewhere, free.',
  alternates: { canonical: '/start' },
}

/**
 * ONE DOOR, TWO PATHS (Lawal's ruling of 8 November 2026, 16:13, build 1; researched in
 * C:\dev\EVIDENCE\EL-8NOV\one-door\leaders-one-door.md). Every "Hosting an event?", "List your event" and "Sell tickets"
 * link lands here and asks one question: "How are you selling tickets?", with his two answers, "Sell on EventLinqs (own
 * ticket page, checkout and payouts, free for the first six months)" leading to organiser sign up, and "Already selling
 * elsewhere? (paste the ticket link, listed free in minutes)" leading to the listing form, which checks the event against
 * its own booking page and publishes it itself. The leaders have only the first path.
 *
 * MOBILE FIRST (law 14 (g)): a choice screen shows both choices on a phone's first screen, so the hero carries no subtitle,
 * the section takes the 'rail' spacing, and each card is one heading, one sentence and one button. The months are read
 * from the offer module (LAW 24), never typed.
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
      <PageHero eyebrow="FOR ORGANISERS" title="How are you selling tickets?" />
      <ContentSection surface="base" width="wide" pad="rail">
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 md:gap-6" data-door>
          <li className="flex flex-col rounded-2xl border border-ink-200 bg-white p-5 shadow-[var(--shadow-card)] md:p-8" data-door-path="sell">
            <p className="type-eyebrow m-0 font-display text-[var(--brand-accent-strong)]">SELL ON EVENTLINQS</p>
            <h2 className="mt-2 font-headline text-xl font-extrabold text-[var(--text-primary)] md:text-2xl">Your own ticket page, checkout and payouts</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-secondary)]">
              Live the moment you publish, with no platform fee for your first {FOUNDING_INITIAL_MONTHS_WORD} months from the day you register.
            </p>
            <div className="mt-4 md:mt-auto md:pt-6">
              <Button href={sell} variant="primary" size="lg" className="w-full sm:w-auto">
                Start selling
              </Button>
            </div>
          </li>
          <li className="flex flex-col rounded-2xl border border-ink-200 bg-white p-5 shadow-[var(--shadow-card)] md:p-8" data-door-path="list">
            <p className="type-eyebrow m-0 font-display text-[var(--brand-accent-strong)]">ALREADY SELLING ELSEWHERE?</p>
            <h2 className="mt-2 font-headline text-xl font-extrabold text-[var(--text-primary)] md:text-2xl">List your event free</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-secondary)]">
              Paste your ticket link. We check your event against it and list it with your photo, usually within minutes.
            </p>
            <div className="mt-4 md:mt-auto md:pt-6">
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
