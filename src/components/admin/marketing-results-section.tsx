import type { MarketingResults } from '@/lib/growth/marketing-results-math'

/**
 * ORGANISER MARKETING RESULTS, on /admin/growth (the PM's 12:40 of 18 November 2026, item 5; Lawal's item 7: measure
 * what happens). Every figure comes from readMarketingResults and names the rows it was counted from. Admin only.
 */
const CARD = 'mb-8 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6'

export function MarketingResultsSection({ results, readAt }: { results: MarketingResults; readAt: string }) {
  return (
    <section data-section="organiser-marketing-results" className={CARD}>
      <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Organiser Marketing results</h2>
      <p className="mt-1 text-xs text-[var(--admin-muted)]">Read from production at {readAt}. Revenue is EventLinqs&apos; own fee, never the ticket value.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {results.figures.map((f) => (
          <div key={f.key} data-figure={f.key} className="rounded-lg border border-[var(--admin-line)] p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">{f.label}</p>
            <p className="mt-1 font-display text-2xl font-bold text-[var(--admin-ink)]">{f.value}</p>
            {f.detail ? <p className="mt-1 text-xs text-[var(--admin-soft)]">{f.detail}</p> : null}
            <p className="mt-2 text-[11px] text-[var(--admin-muted)]">Source: {f.source}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 overflow-x-auto" data-split="subject-variant">
        <h3 className="font-display text-sm font-semibold text-[var(--admin-ink)]">Reply rate by subject variant</h3>
        <table className="mt-2 w-full min-w-[360px] text-left text-xs text-[var(--admin-soft)]">
          <thead>
            <tr className="text-[var(--admin-muted)]">
              <th className="py-2 pr-3 font-medium">Variant</th>
              <th className="py-2 pr-3 font-medium">Sent</th>
              <th className="py-2 pr-3 font-medium">Replied</th>
              <th className="py-2 pr-3 font-medium">Positive</th>
              <th className="py-2 font-medium">Reply rate</th>
            </tr>
          </thead>
          <tbody>
            {results.variants.map((v) => (
              <tr key={v.variant} className="border-t border-[var(--admin-line)]">
                <td className="py-2 pr-3 text-[var(--admin-ink)]">{v.variant === 'A' ? 'A, complimentary listing' : 'B, free listing'}</td>
                <td className="py-2 pr-3">{v.sent}</td>
                <td className="py-2 pr-3">{v.replies}</td>
                <td className="py-2 pr-3">{v.positive}</td>
                <td className="py-2">{v.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-[var(--admin-muted)]">Source: the half recorded on each ACQ-FIRST letter (outreach_touches) and its replies (outreach_replies).</p>
      </div>
      <div className="mt-6" data-split="post-clicks">
        <h3 className="font-display text-sm font-semibold text-[var(--admin-ink)]">Link clicks to eventlinqs.com.au, by post</h3>
        {results.posts.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--admin-soft)]">0 clicks recorded from any post yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs text-[var(--admin-soft)]">
            {results.posts.map((p) => (
              <li key={p.label} className="flex justify-between gap-4 border-t border-[var(--admin-line)] py-1">
                <span className="text-[var(--admin-ink)]">{p.label}</span>
                <span>{p.clicks}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-[var(--admin-muted)]">Source: share_link_events, kind click, test clicks left out, each tied to its post (piece_id).</p>
      </div>
    </section>
  )
}
