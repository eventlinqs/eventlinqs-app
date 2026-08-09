'use client'

import { useHydrated } from '@/lib/hooks/use-hydrated'

/**
 * The time-of-day greeting, without a hydration mismatch.
 *
 * THE DEFECT. DashboardHero called `new Date().getHours()` while rendering.
 * That runs on the Vercel server in UTC and again in the browser in the
 * reader's own zone, so the two disagree for most of the day. At 04:30 UTC the
 * server wrote "Good morning"; the same instant in Melbourne is 14:30, so the
 * browser wrote "Good afternoon". React reported two #418 text mismatches on
 * every single dashboard load.
 *
 * It is not cosmetic:
 *   - the organiser is greeted wrongly, then watches it change
 *   - a text mismatch can make React discard the server-rendered subtree and
 *     re-render it on the client, which is the opposite of why it was rendered
 *     on the server
 *   - two guaranteed errors per load is noise that buries the hydration error
 *     that actually means something, and this platform has just learned what a
 *     pre-hydration defect costs
 *
 * THE FIX, and why not suppressHydrationWarning. That flag silences the report
 * and keeps the wrong greeting. Instead the server renders a greeting that is
 * true at any hour, the first client render matches it exactly, and the
 * time-of-day form appears once hydration has happened, computed in the
 * reader's real timezone. No mismatch, and the greeting is correct rather than
 * merely quiet.
 */
function timeOfDay(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function GreetingText({ firstName }: { firstName: string }) {
  const hydrated = useHydrated()
  // Before hydration, server and client must agree, so neither may look at a
  // clock. `new Date()` is only reached on the client, after hydration.
  const greeting = hydrated ? timeOfDay(new Date().getHours()) : 'Welcome back'
  return (
    <>
      {greeting}, {firstName}
    </>
  )
}
