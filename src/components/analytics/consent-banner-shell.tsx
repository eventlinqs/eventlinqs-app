import Link from 'next/link'
import { CONSENT_SHELL_ID } from '@/lib/analytics/consent-first-paint'

/**
 * THE BANNER. Shown once, to somebody who has not answered, and never again.
 *
 * Close-out AN1. It exists because the platform now loads measurement and
 * advertising scripts that store things on a device, which is a different
 * posture from the cookieless traffic count it has always had. The cookie
 * policy said, correctly, that no banner was required; the moment that stopped
 * being true, the banner and the policy changed together.
 *
 * ============================================================================
 * THIS IS A SERVER COMPONENT, AND THAT IS THE POINT
 * ============================================================================
 *
 * The markup is in the initial HTML of every route, so the strip paints with
 * the page. It used to be a client component inside the lazily fetched
 * measurement tree, which meant it could not appear until React had hydrated
 * and a second chunk had landed: about four seconds on a throttled phone, on a
 * full width block of text that is the largest contentful element on the
 * screen. It became the LCP element on five of the thirteen gated URLs and cost
 * /events its performance floor. `lib/analytics/consent-first-paint.ts` carries
 * the reasoning and the guard of the same name carries the measurement.
 *
 * IT IS HIDDEN BY DEFAULT AND REVEALED BEFORE THE FIRST PAINT. `globals.css`
 * hides this id; the pre-paint script in the root layout reveals it only for a
 * visitor whose cookie says they have not answered. So the HTML never varies by
 * cookie (the cache key is untouched), nobody who answered months ago sees a
 * flash, and a browser with no JavaScript at all sees exactly what it saw
 * before this change: nothing.
 *
 * WHY BOTH BUTTONS CARRY THE SAME WEIGHT. A refusal that is a small grey word
 * beside a large gold button is a design that collects consent it has not
 * earned. Both are real buttons, both at least 44px, both immediately
 * reachable, and the refusal is the first one a keyboard reaches, because the
 * safe answer should never be the harder one to give.
 *
 * NEITHER BUTTON IS EVER DEAD. They carry the intent attribute rather than a
 * React handler, so the inline bootstrap beneath this strip can answer a press
 * made before the deferred chunk arrives, and `consent-banner.tsx` applies it
 * through the provider the moment it mounts. The provider stays the only writer
 * of the cookie.
 *
 * IT DOES NOT BLOCK THE PAGE. No overlay, no scroll lock, nothing over the
 * content: a strip at the foot of the window. Nothing is loaded while it is
 * open, so there is nothing to protect the reader from by trapping them.
 *
 * DESIGN: the platform's own navy and gold on a solid surface, no
 * glassmorphism, no backdrop filter, per the Design system's light-and-airy
 * boundary. It sits above the mobile bottom bar rather than under it.
 */
export function ConsentBannerShell() {
  return (
    <div
      id={CONSENT_SHELL_ID}
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
        {/* SIDE BY SIDE AT EVERY WIDTH. Stacked, the two buttons cost 100
            pixels of a 844 pixel phone and the strip took a third of the
            screen. Two 44px pills fit across 390 with room to spare, and both
            stay full sized touch targets. */}
        <div className="flex shrink-0 flex-row gap-3">
          {/* The refusal first, so the safe answer is the one a keyboard and a
              thumb reach first. */}
          <button
            type="button"
            data-el-consent="refuse"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-white/40 px-5 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-white/10 sm:flex-none sm:px-6"
          >
            No thanks
          </button>
          <button
            type="button"
            data-el-consent="accept"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)] transition-opacity hover:opacity-90 sm:flex-none sm:px-6"
          >
            That is fine
          </button>
        </div>
      </div>
    </div>
  )
}
