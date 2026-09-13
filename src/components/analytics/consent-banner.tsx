'use client'

import Link from 'next/link'
import { useConsent } from './consent-provider'

/**
 * THE BANNER. Shown once, to somebody who has not answered, and never again.
 *
 * Close-out AN1. It exists because the platform now loads measurement and
 * advertising scripts that store things on a device, which is a different
 * posture from the cookieless traffic count it has always had. The cookie
 * policy said, correctly, that no banner was required; the moment that stopped
 * being true, the banner and the policy changed together.
 *
 * WHY BOTH BUTTONS CARRY THE SAME WEIGHT. A refusal that is a small grey word
 * beside a large gold button is a design that collects consent it has not
 * earned. Both are real buttons, both at least 44px, both immediately
 * reachable, and the refusal is the first one a keyboard reaches, because the
 * safe answer should never be the harder one to give.
 *
 * IT DOES NOT BLOCK THE PAGE. No overlay, no scroll lock, nothing over the
 * content: a strip at the foot of the window. Nothing is loaded while it is
 * open, so there is nothing to protect the reader from by trapping them.
 *
 * DESIGN: the platform's own navy and gold on a solid surface, no
 * glassmorphism, no backdrop filter, per the Design system's light-and-airy
 * boundary. It sits above the mobile bottom bar rather than under it.
 */
export function ConsentBanner() {
  const { decided, loading, acceptAll, refuseAll } = useConsent()

  // Nothing is rendered until the cookie has been read, so the banner never
  // flashes at somebody who answered it months ago.
  if (loading || decided) return null

  return (
    <div
      role="region"
      aria-label="Cookies and measurement"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-[var(--brand-accent)]/40 bg-[var(--color-navy-950)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_24px_rgba(10,22,40,0.28)] sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <p className="max-w-3xl text-sm leading-relaxed text-white/85">
          We count how the site is used so we can make it better, and we measure which of our own
          adverts bring organisers here. None of it runs until you say yes, and you can say no
          without losing anything: buying a ticket and running an event work exactly the same
          either way.{' '}
          <Link href="/legal/cookies" className="font-semibold text-[var(--brand-accent)] underline underline-offset-2">
            What we would load
          </Link>
        </p>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
          {/* The refusal first, so the safe answer is the one a keyboard and a
              thumb reach first. */}
          <button
            type="button"
            onClick={refuseAll}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/40 px-6 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
          >
            No thanks
          </button>
          <button
            type="button"
            onClick={acceptAll}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--brand-accent)] px-6 text-sm font-semibold text-[var(--color-navy-950)] transition-opacity hover:opacity-90"
          >
            That is fine
          </button>
        </div>
      </div>
    </div>
  )
}
