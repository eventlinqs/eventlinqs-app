import Link from 'next/link'

/**
 * "Report or remove this listing" (the release checklist's I5), on every event page and its walk-in page alike: a quiet
 * line at the foot of the event's own content, to a form anyone can send with no account (/events/[slug]/report).
 */
export function ReportListingLink({ slug }: { slug: string }) {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
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
