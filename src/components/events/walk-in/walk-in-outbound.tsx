import type { Outbound } from '@/lib/listings/outbound'

/**
 * The one button a curated free night carries to its host's own page (WI3's
 * page; src/lib/listings/outbound.ts picks where it goes and what it says). The
 * same pill and the same "Opens ..." line as ExternalTicketsPanel's "Get
 * tickets", so a visitor reads one way of leaving EventLinqs on every page.
 *
 * A plain anchor, never a router link, because it leaves the app; rel noopener
 * because it opens a third party's site.
 */
export function WalkInOutbound({ outbound }: { outbound: Outbound }) {
  return (
    <div data-outbound={outbound.host}>
      <a
        href={outbound.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-ink-900 px-6 text-base font-semibold text-white transition hover:bg-ink-800"
      >
        {outbound.label}
      </a>
      <p className="m-0 mt-3 text-center text-xs text-ink-400">Opens {outbound.host}</p>
    </div>
  )
}
