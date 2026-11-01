import type { CoverageDesk, CityDesk } from '@/lib/growth/coverage-desk'

/**
 * THE GROWTH DESK's CITY SECTIONS, under the desk on /admin/growth (C:\dev\DESIGN\CITY-FIRST-1NOV\
 * ENGINE-FINAL-DIRECTIVE-1NOV.md s8; C:\dev\GROWTH\GROWTH-SYSTEM-DIRECTIVE-1NOV.md s6 and s7). Coverage is shown against
 * monitored sources only and never as a claim to know every event; with none monitored it says so. Admin only.
 */
const CARD = 'mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6'
const n = (v: number) => v.toLocaleString('en-AU')
const money = (cents: number) => `A$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const REASON_WORDS: Record<string, string> = {
  source_not_registered: 'Source not registered',
  no_adapter: 'No adapter for the source',
  parse_fault: 'The page was read wrongly',
  wrong_city: 'Placed in the wrong city',
  filtered_wrongly: 'Filtered out wrongly',
  too_late: 'Found too late',
  not_yet_known: 'Reason not yet known',
}
const CHANNEL_WORDS: Record<string, string> = {
  search: 'Search', social: 'Social', email: 'Email', 'our links': 'Our own links', direct: 'Direct', other: 'Other',
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-white/[0.06] py-1 text-sm">
      <span className="text-white/70">{label}</span>
      <span className="text-right text-white">{value}{note ? <span className="ml-2 text-xs text-white/50">{note}</span> : null}</span>
    </div>
  )
}

function City({ c }: { c: CityDesk }) {
  const v = c.coverage
  const latest = c.channels[c.channels.length - 1]
  return (
    <section data-city={c.slug} className={CARD}>
      <h2 className="font-display text-lg font-semibold text-white">{c.name}: coverage, misses and channels</h2>
      <p className="mt-1 text-sm text-white/60">
        {v.coverage_percent === null
          ? 'No monitored events yet: coverage is measured against the events our registered sources list, and none are counted so far.'
          : `${v.coverage_percent}% of the events our monitored sources list are on EventLinqs (${n(v.listed)} of ${n(v.unique_discovered)}). This is not every event in ${c.name}.`}
      </p>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div data-part="sources">
          <h3 className="font-display text-sm font-semibold text-white">Sources</h3>
          <Row label="Registered" value={n(v.sources.known)} />
          <Row label="Healthy (read in the last two days)" value={n(v.sources.healthy)} />
          <Row label="Failing" value={n(v.sources.failing)} />
          <Row label="Not yet read" value={n(v.sources.not_yet_read)} />
          <Row label="Stopped (refused us)" value={n(v.sources.stopped)} />
        </div>
        <div data-part="events">
          <h3 className="font-display text-sm font-semibold text-white">Events</h3>
          <Row label={`Upcoming in ${c.name}`} value={n(v.upcoming_in_city)} note="placed by the ABS boundaries" />
          <Row label="Nearby towns" value={n(v.upcoming_nearby)} />
          <Row label={`Labelled ${c.name}, not yet placed`} value={n(v.labelled_here_not_yet_placed)} />
          <Row label="Discovered by our sources" value={n(v.unique_discovered)} note={`${n(v.candidates_discovered)} candidates`} />
          <Row label="Missing from EventLinqs" value={n(v.missing)} />
          <Row label="Waiting for review" value={n(v.pending_review)} />
          <Row label="Duplicates" value={n(v.duplicates)} />
          <Row label="Stale" value={n(v.stale)} />
          <Row label="Ended or cancelled, still recorded" value={n(v.expired_or_cancelled)} />
          <Row label="With an authorised image" value={n(v.with_authorised_image)} />
          <Row label="Ticketed elsewhere" value={n(v.with_external_ticketing)} />
          <Row label="Selling through EventLinqs" value={n(v.selling_through_eventlinqs)} />
        </div>
      </div>

      {v.labelled_here_but_placed_elsewhere.length > 0 ? (
        <div data-part="placed-elsewhere" className="mt-4 text-sm text-white/70">
          <h3 className="font-display text-sm font-semibold text-white">Labelled {c.name} but placed elsewhere</h3>
          <ul className="mt-1 list-disc pl-5">
            {v.labelled_here_but_placed_elsewhere.map((e) => (
              <li key={e.event}>{e.venue ?? e.event}: {e.relation === 'outside' ? `outside ${c.name} and ${c.regionName}` : c.regionName}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div data-part="by-category" className="mt-4 text-sm text-white/70">
        <h3 className="font-display text-sm font-semibold text-white">By category</h3>
        <p className="mt-1">{Object.entries(v.by_category).sort((a, b) => b[1] - a[1]).map(([k, m]) => `${k} ${n(m)}`).join('; ') || 'None yet'}</p>
      </div>

      <div data-part="misses" className="mt-4 text-sm text-white/70">
        <h3 className="font-display text-sm font-semibold text-white">Misses by week</h3>
        {c.misses.length === 0 ? <p className="mt-1">No misses recorded yet.</p> : (
          <ul className="mt-1 space-y-1">
            {c.misses.map((w) => (
              <li key={w.week}>
                Week of {w.week}: {n(w.misses)} missed, {n(w.fixed)} fixed.{' '}
                {Object.entries(w.by_reason).map(([r, m]) => `${REASON_WORDS[r] ?? r} ${n(m)}`).join('; ')}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div data-part="channels" className="mt-4 text-sm text-white/70">
        <h3 className="font-display text-sm font-semibold text-white">This week by channel</h3>
        {!latest ? <p className="mt-1">No visits recorded yet.</p> : (
          <>
            <p className="mt-1">
              {n(latest.new_visitors)} new and {n(latest.returning_visitors)} returning visitors; {n(latest.paid_orders)} paid orders,
              {' '}{money(latest.gross_ticket_cents)} in tickets, {money(latest.fee_revenue_cents)} EventLinqs fees; {n(latest.newsletter_confirmations_all_cities)} newsletter sign ups (all cities).
            </p>
            <ul className="mt-1 space-y-1">
              {Object.entries(latest.by_channel).map(([ch, r]) => (
                <li key={ch}>{CHANNEL_WORDS[ch] ?? ch}: {n(r.visitors)} visitors, {n(r.checkouts_started)} checkouts, {n(r.paid_sales)} paid sales</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}

export function CoverageDeskSection({ desk }: { desk: CoverageDesk }) {
  return (
    <div data-section="coverage-desk">
      {desk.cities.map((c) => <City key={c.slug} c={c} />)}
      <section data-part="experiments" className={CARD}>
        <h2 className="font-display text-lg font-semibold text-white">Growth experiments</h2>
        {desk.experiments.length === 0 ? (
          <p className="mt-1 text-sm text-white/60">No experiments recorded yet. Each needs a hypothesis, a baseline and a result before a decision.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm text-white/70">
            {desk.experiments.map((e) => (
              <li key={e.id}>
                <span className="text-white">{e.title}</span> ({e.starts_on} to {e.ends_on}, {money(e.budget_cents)}): {e.hypothesis}.
                {' '}{e.primary_metric}: baseline {e.baseline ?? 'not set'}, result {e.result ?? 'not yet'}{e.decision ? `; decided: ${e.decision}` : ''}.
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
