import Link from 'next/link'
import { CLAIM_LISTING_LINE } from '@/lib/listings/claimable'

/**
 * "Report or remove this listing" (the release checklist's I5), on every event page and its walk-in page alike: a quiet
 * line at the foot of the event's own content, to a form anyone can send with no account (/events/[slug]/report).
 *
 * Beside it, only where the claim page would accept a claim (listingClaimable, behind listing_claims), the way in for
 * the night's own organiser: "Is this your event? Claim it free ..." to /events/[slug]/claim (window 6's gap list of
 * 30 October 2026, item 2: until now only outreach emails carried that link). The claim page is noindex, so the link
 * is nofollow like the report link.
 */
export function ReportListingLink({ slug, claimable = false }: { slug: string; claimable?: boolean }) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-start px-4 pb-10 sm:px-6 lg:px-8">
      {claimable && (
        <Link
          href={`/events/${slug}/claim`}
          rel="nofollow"
          data-claim-listing-link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--brand-accent-strong)] underline decoration-ink-300 underline-offset-2 transition-colors hover:text-[var(--brand-accent-strong-hover)]"
        >
          {CLAIM_LISTING_LINE}
        </Link>
      )}
      <Link
        href={`/events/${slug}/report`}
        rel="nofollow"
        data-report-listing-link
        className="inline-flex min-h-11 items-center text-sm text-ink-600 underline decoration-ink-300 underline-offset-2 transition-colors hover:text-[var(--brand-accent-strong)]"
      >
        Report or remove this listing
      </Link>
    </div>
  )
}
