import type { MarketingResults } from '@/lib/growth/marketing-results-math'

/**
 * ORGANISER MARKETING RESULTS, on /admin/growth (the PM's 12:40 of 18 November 2026, item 5; Lawal's item 7: measure
 * what happens). Every figure comes from readMarketingResults and names the rows it was counted from. Admin only.
 */
const CARD = 'mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6'

export function MarketingResultsSection({ results, readAt }: { results: MarketingResults; readAt: string }) {
  return (
    <section data-section="organiser-marketing-results" className={CARD}>
      <h2 className="font-display text-lg font-semibold text-white">Organiser Marketing results</h2>
      <p className="mt-1 text-xs text-white/50">Read from production at {readAt}. Revenue is EventLinqs&apos; own fee, never the ticket value.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {results.figures.map((f) => (
          <div key={f.key} data-figure={f.key} className="rounded-lg border border-white/[0.06] p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/50">{f.label}</p>
            <p className="mt-1 font-display text-2xl font-bold text-white">{f.value}</p>
            {f.detail ? <p className="mt-1 text-xs text-white/60">{f.detail}</p> : null}
            <p className="mt-2 text-[11px] text-white/40">Source: {f.source}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 overflow-x-auto" data-split="subject-variant">
        <h3 className="font-display text-sm font-semibold text-white">Reply rate by subject variant</h3>
        <table className="mt-2 w-full min-w-[360px] text-left text-xs text-white/70">
          <thead>
            <tr className="text-white/50">
              <th className="py-2 pr-3 font-medium">Variant</th>
              <th className="py-2 pr-3 font-medium">Sent</th>
              <th className="py-2 pr-3 font-medium">Replied</th>
              <th className="py-2 pr-3 font-medium">Positive</th>
              <th className="py-2 font-medium">Reply rate</th>
            </tr>
          </thead>
          <tbody>
            {results.variants.map((v) => (
              <tr key={v.variant} className="border-t border-white/[0.06]">
                <td className="py-2 pr-3 text-white">{v.variant === 'A' ? 'A, complimentary listing' : 'B, free listing'}</td>
                <td className="py-2 pr-3">{v.sent}</td>
                <td className="py-2 pr-3">{v.replies}</td>
                <td className="py-2 pr-3">{v.positive}</td>
                <td className="py-2">{v.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-white/40">Source: the half recorded on each ACQ-FIRST letter (outreach_touches) and its replies (outreach_replies).</p>
      </div>
      <div className="mt-6" data-split="post-clicks">
        <h3 className="font-display text-sm font-semibold text-white">Link clicks to eventlinqs.com.au, by post</h3>
        {results.posts.length === 0 ? (
          <p className="mt-2 text-xs text-white/60">0 clicks recorded from any post yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs text-white/70">
            {results.posts.map((p) => (
              <li key={p.label} className="flex justify-between gap-4 border-t border-white/[0.06] py-1">
                <span className="text-white">{p.label}</span>
                <span>{p.clicks}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-white/40">Source: share_link_events, kind click, test clicks left out, each tied to its post (piece_id).</p>
      </div>
    </section>
  )
}
