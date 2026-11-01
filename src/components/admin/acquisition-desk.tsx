import type { AcquisitionDesk } from '@/lib/growth/acquisition-desk-math'
import type { AcquisitionStep, SplitBy } from '@/lib/growth/acquisition-funnel-math'
import { ACQUISITION_STAGES, ACQUISITION_STAGE_WORDS } from '@/lib/growth/acquisition-funnel-math'

/**
 * THE GROWTH DESK'S ACQUISITION SECTION, V3 ITEM 10, under the desk on /admin/growth. Every number comes from
 * readAcquisitionDesk (growth_acquisition_facts, one row per organiser from its proving rows). Admin only.
 */
const CARD = 'mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6'
const number = (n: number) => n.toLocaleString('en-AU')
const rate = (r: number | null) => (r === null ? 'none before' : `${Math.round(r * 100)}%`)
const money = (cents: number) => `A$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const SPLIT_WORDS: Record<SplitBy, string> = { city: 'By city', group: 'By organiser group', source: 'By source' }

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div data-figure={label} className="rounded-lg border border-white/[0.06] p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/50">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-white">{value}</p>
      {note ? <p className="mt-1 text-xs text-white/50">{note}</p> : null}
    </div>
  )
}

function SplitTable({ by, rows }: { by: SplitBy; rows: { key: string; steps: AcquisitionStep[] }[] }) {
  return (
    <div data-split={by} className="mt-6 overflow-x-auto">
      <h3 className="font-display text-sm font-semibold text-white">{SPLIT_WORDS[by]}</h3>
      <table className="mt-2 w-full min-w-[720px] text-left text-xs text-white/70">
        <thead>
          <tr>
            <th className="py-1 pr-3 font-medium text-white/50">{by === 'group' ? 'Group' : by === 'city' ? 'City' : 'Source'}</th>
            {ACQUISITION_STAGES.map((s) => (
              <th key={s} className="py-1 pr-3 font-medium text-white/50">{ACQUISITION_STAGE_WORDS[s]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-white/[0.06]">
              <td className="py-1 pr-3 text-white">{r.key}</td>
              {r.steps.map((s) => (
                <td key={s.stage} className="py-1 pr-3">{number(s.organisers)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AcquisitionDeskSection({ acq }: { acq: AcquisitionDesk }) {
  const best = [...acq.channels].filter((c) => c.firstPaidSale > 0).sort((a, b) => b.firstPaidSale - a.firstPaidSale)[0]
  return (
    <section data-section="acquisition-desk" className={CARD}>
      <h2 className="font-display text-lg font-semibold text-white">Acquisition, from the rows that prove it</h2>
      <p className="mt-1 text-sm text-white/60">
        {number(acq.organisers)} organisers on record. A claim or a ticket type is never a sale; an outside ticket is never revenue.
      </p>

      <div data-part="figures" className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Suitable prospects" value={number(acq.suitableProspects)} note="a public night in the last or next 90 days" />
        <Figure label="Legally eligible contacts" value={number(acq.eligibleContacts)} note={`${number(acq.organisersWithEligibleContact)} organisers have one`} />
        <Figure label="Organisers who replied" value={number(acq.organisersReplied)} />
        <Figure label="Qualified opportunities" value={number(acq.qualifiedOpportunities)} note="open, with a night to talk about" />
        <Figure label="Switched on ticketing" value={number(acq.ticketingOn)} />
        <Figure label="First paid sale" value={number(acq.firstPaidSale)} />
        <Figure label="Came back with another paid event" value={number(acq.repeatPaid)} />
        <Figure label="EventLinqs revenue" value={money(acq.platformFeeCents)} note="platform fees on paid orders only" />
      </div>

      <div data-part="funnel" className="mt-6 overflow-x-auto">
        <h3 className="font-display text-sm font-semibold text-white">The ten stages, with the actual rate between each</h3>
        <table className="mt-2 w-full text-left text-sm text-white/70">
          <tbody>
            {acq.funnel.map((s) => (
              <tr key={s.stage} className="border-t border-white/[0.06]">
                <td className="py-1 pr-3 text-white">{s.words}</td>
                <td className="py-1 pr-3">{number(s.organisers)}</td>
                <td className="py-1 text-white/50">{s.stage === 'identified' ? '' : rate(s.fromBefore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p data-part="channel" className="mt-6 text-sm text-white/70">
        {best
          ? `The channel that works best so far: ${best.key}, ${number(best.firstPaidSale)} of ${number(best.organisers)} organisers with a first paid sale.`
          : 'No channel has a first paid sale yet, so none is called best.'}
      </p>

      {(['city', 'group', 'source'] as const).map((by) => (
        <SplitTable key={by} by={by} rows={acq.splits[by]} />
      ))}

      <div data-part="approach-today" className="mt-6">
        <h3 className="font-display text-sm font-semibold text-white">Who to approach today, and why</h3>
        {acq.approachToday.length === 0 ? (
          <p className="mt-2 text-sm text-white/60">Nobody today: no organiser has a permitted contact, a night to talk about and no EventLinqs tickets yet.</p>
        ) : (
          <ol className="mt-2 space-y-2 text-sm text-white/70">
            {acq.approachToday.map((a) => (
              <li key={a.organiserId} data-organiser={a.organiserId}>
                <span className="text-white">{a.name}</span>
                {a.city ? `, ${a.city}` : ''}: {a.priority.score} of 100. {a.priority.reasons.join('; ')}.
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
