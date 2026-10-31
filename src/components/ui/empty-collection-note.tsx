import Link from 'next/link'

/**
 * EmptyCollectionNote - what a discovery collection shows when it holds no event.
 *
 * Lawal's directive of 31 October 2026 (17:44), section 11: "Do not present empty community collections as if they
 * contain live events ... Where an event collection is empty, avoid large repeated promotional cards." So: one line
 * that says plainly nothing is listed here, and one link to the events that are real, nothing else. No organiser pitch
 * (organiser acquisition belongs in the organiser journeys, section 1), no trust pillars, no artwork. The page's own
 * navigation (other cities, other communities) stays, so every community remains reachable.
 * tests/unit/growth/empty-collections-are-honest.test.ts holds it.
 */
export function EmptyCollectionNote({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-[var(--surface-1)] px-5 py-5 sm:px-6">
      <p className="text-base font-medium text-[var(--text-primary)]">{message}</p>
      <Link
        href="/events"
        className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-accent-strong)] underline-offset-2 hover:underline"
      >
        See what is on across Australia &rsaquo;
      </Link>
    </div>
  )
}
