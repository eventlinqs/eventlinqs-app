import type { Metadata } from 'next'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { HeroMedia } from '@/components/media'
import { LAUNCH_HERO } from '@/lib/images/launch-photos'
import { LaunchComposer } from '@/components/launch/launch-composer'

/**
 * THE PUBLIC COMPOSER. No auth anywhere on this route.
 *
 * Founder rulings, 9 August 2026:
 *  - 0.2a A stranger sees the FULL kit rendered. Downloads and a working
 *         tracked link require an account. They see everything, they take
 *         nothing until they claim it.
 *  - 0.2b The anonymous path is DETERMINISTIC. No model tokens are spent for a
 *         visitor, so a visitor can never become a bill.
 *
 * Law 2 note, stated rather than hidden: the screen structure here is reasoned
 * from the existing marketing surfaces and the PHASE-C 4.3 reveal spec, NOT
 * from a fresh competitor capture at 1440 and 390. That capture is owed.
 */

export const metadata: Metadata = {
  title: 'Build your event | EventLinqs',
  description:
    'Describe your event in a sentence and get your page, your poster, your share cards and the words to post with them. Free, and free events stay free.',
  alternates: { canonical: '/launch' },
}

export default function LaunchPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />

      <main>
        {/* ── The promise ────────────────────────────────────────────────── */}
        <section aria-labelledby="launch-hero-heading" className="relative overflow-hidden">
          {/* Hero scale: the one platform standard (.hero-marketing). The
              raster owns the LCP and never animates; only the content
              staggers in. */}
          <div className="hero-marketing relative w-full">
            <HeroMedia
              image={LAUNCH_HERO.src}
              alt={LAUNCH_HERO.alt}
              objectPosition={LAUNCH_HERO.objectPosition}
              priority
            />
            {/* The same restrained bottom-up navy scrim as every other hero. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, rgba(10,22,40,0.80) 0%, rgba(10,22,40,0.40) 42%, rgba(10,22,40,0.06) 78%, rgba(10,22,40,0.00) 100%)',
              }}
            />
            <div className="relative z-10 mx-auto flex h-full max-w-7xl items-end px-6 pb-8 pt-20 sm:px-8 sm:pb-10 lg:px-12 lg:pb-12">
              <div className="hero-enter max-w-2xl">
                <p
                  className="type-micro font-display uppercase tracking-[0.18em] text-[var(--brand-accent)]"
                  style={{ fontWeight: 600 }}
                >
                  The event launch kit
                </p>
                <h1
                  id="launch-hero-heading"
                  className="mt-3 font-headline text-3xl font-bold text-white sm:text-4xl lg:text-5xl"
                >
                  Build your event. Watch your kit appear.
                </h1>
                <p className="mt-4 max-w-xl text-base text-white/90 sm:text-lg">
                  Your page, your poster, your invitation cards and the words to
                  post with them, in under a minute. Free for free events.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── The composer and the reveal ────────────────────────────────── */}
        <LaunchComposer />
      </main>

      <SiteFooter />
    </div>
  )
}
