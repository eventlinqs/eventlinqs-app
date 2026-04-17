import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/Button'

export const metadata: Metadata = {
  title: 'Become an Organiser — EventLinqs',
  description:
    'Sign up as an event organiser on EventLinqs. Self-serve setup, no upfront fees, and a checkout your audience will actually complete.',
}

/**
 * /organisers/signup — placeholder page for Session 2b.
 *
 * The full self-serve organiser onboarding flow (Stripe Connect, event creation,
 * identity verification) is built in Session 2b. This page exists so that all
 * "Start selling tickets" CTAs across the platform resolve to a real page rather
 * than a 404.
 */
export default function OrganiserSignupPage() {
  return (
    <PageShell>
      <section
        className="relative bg-[var(--color-navy-950)] text-white min-h-[70vh] flex items-center overflow-hidden"
        aria-labelledby="signup-heading"
      >
        {/* Radial gradient — accent glow top-right */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(ellipse 70% 55% at 100% 0%, var(--color-gold-400, #E8B738) 10%, transparent 55%)',
          }}
        />
        {/* Grid overlay */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '100px 100px',
          }}
        />
        {/* Bottom accent bar */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 right-0"
          style={{
            height: '2px',
            backgroundImage: 'linear-gradient(90deg, transparent, rgba(232, 183, 56, 0.5) 50%, transparent)',
          }}
        />

        <div className="relative z-10 mx-auto max-w-7xl px-4 py-24 md:px-6 lg:px-8 lg:py-32">
          <div className="max-w-2xl">
            <p className="mb-4 font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-gold-400)]">
              Organiser sign-up
            </p>

            <h1
              id="signup-heading"
              className="font-display font-bold leading-tight tracking-tight text-white text-4xl md:text-5xl"
            >
              Organiser sign-up is almost ready.
            </h1>

            <p className="mt-5 text-lg text-white/70">
              We are putting the final touches on the organiser sign-up flow. In the meantime,
              join the waitlist and we will notify you the moment it is live, usually within a
              few days.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Button
                variant="primary"
                size="lg"
                onSurface="dark"
                href="/contact?topic=organiser"
              >
                Join the waitlist
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onSurface="dark"
                href="/organisers"
              >
                Learn more about selling tickets
              </Button>
            </div>

            <p className="mt-10 text-sm text-white/40">
              Already set up as an organiser?{' '}
              <a
                href="mailto:hello@eventlinqs.com"
                className="text-white/60 underline underline-offset-2 hover:text-white transition-colors"
              >
                Contact us at hello@eventlinqs.com
              </a>{' '}
              and we will help you get started.
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  )
}
