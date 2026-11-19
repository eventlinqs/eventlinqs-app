import type { GrowthDesk, TrendRow } from '@/lib/growth/desk'
import { dayWords, monthWords } from '@/lib/growth/desk-math'

/**
 * THE GROWTH DESK, the top of /admin/growth (Law 8, Lawal 1 November 2026 03:27; the CONTROLLER's 03:32 G2): today's
 * tasks, the plan against the actual for each target and the founder's 10x stretch with its gap, the open cities
 * against their benchmarks, and the weekly trend. Every number comes from readGrowthDesk, the same read the founder's
 * 11:40 email uses. Admin only.
 */
const number = (n: number) => n.toLocaleString('en-AU')
const money = (n: number) => `A$${n.toLocaleString('en-AU')}`
const CARD = 'mb-8 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6'

/** One row a week for the trend: the last daily row of each seven-day block, newest last. */
export function weeklyRows(trend: TrendRow[]): TrendRow[] {
  const out: TrendRow[] = []
  for (let i = trend.length - 1; i >= 0; i -= 7) out.unshift(trend[i])
  return out
}

export function GrowthDeskSection({ desk }: { desk: GrowthDesk }) {
  const { plan, card, today, progress, tasks } = desk
  const weeks = weeklyRows(desk.trend)
  return (
    <div data-section="growth-desk">
      <header className="mb-6">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">Growth desk</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Today, {dayWords(today)}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
          Against the growth plan, version {plan.version} set {dayWords(plan.set_on)}: {plan.mission}
        </p>
        {plan.focus_market ? (
          <p data-part="focus-market" className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
            <span className="text-[var(--admin-ink)]">Focus market: {plan.focus_market.name}.</span> {plan.focus_market.rule}
          </p>
        ) : null}
      </header>

      <section data-part="tasks" className={CARD}>
        <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Today&apos;s tasks</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[var(--admin-ink)]">
          {tasks.map((t) => (
            <li key={t.text} data-kind={t.kind}>{t.text}</li>
          ))}
        </ol>
      </section>

      <section data-part="plan" className={CARD}>
        <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Plan against actual, the year to {monthWords(progress.yearTo)}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[var(--admin-muted)]">
              <tr><th className="py-2 pr-4 font-medium">Target</th><th className="py-2 pr-4 font-medium">Now</th><th className="py-2 pr-4 font-medium">Plan</th><th className="py-2 pr-4 font-medium">Reached</th></tr>
            </thead>
            <tbody className="text-[var(--admin-ink)]">
              {[...progress.lines, progress.stretch].map((l) => (
                <tr key={l.label} className="border-t border-[var(--admin-line)] align-top">
                  <td className="py-2 pr-4"><span className="text-[var(--admin-ink)]">{l.label}</span><br /><span className="text-xs text-[var(--admin-muted)]">{l.basis}</span></td>
                  <td className="py-2 pr-4">{l.label.includes('A$') ? money(l.actual) : number(l.actual)}</td>
                  <td className="py-2 pr-4">{l.label.includes('A$') ? money(l.target) : number(l.target)}</td>
                  <td className="py-2 pr-4">{l.percent} percent</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p data-part="stretch-gap" className="mt-4 max-w-3xl text-sm text-[var(--admin-soft)]">
          The 10x stretch is {money(progress.stretchGap)} a year short on today&apos;s run rate. {plan.targets.founder_stretch.honest_note}
        </p>
      </section>

      <section data-part="cities" className={CARD}>
        <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Checked events in the next 14 days, by open city</h2>
        <ul className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {plan.cities.open.map((city) => {
            const have = card.checked_next_14_days_by_city[city] ?? 0
            const want = plan.cities.pilot_benchmark_checked_events_14_days[city]
            return (
              <li key={city} data-city={city} className="rounded-lg border border-[var(--admin-line)] p-3">
                <span className="text-[var(--admin-ink)]">{city}</span>
                <span className="block text-[var(--admin-soft)]">{number(have)} of {number(want)}{have >= want ? ', at the benchmark' : `, ${number(want - have)} short`}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <section data-part="trend" className={CARD}>
        <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">The weekly trend</h2>
        {weeks.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--admin-soft)]">No daily read is kept yet. The first is kept by tonight&apos;s run, and the trend starts from it.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[var(--admin-muted)]">
                <tr><th className="py-2 pr-4 font-medium">Week to</th><th className="py-2 pr-4 font-medium">Visible events</th><th className="py-2 pr-4 font-medium">Paid tickets, 7 days</th><th className="py-2 pr-4 font-medium">Frequent paid organisers</th><th className="py-2 pr-4 font-medium">Subscribers</th></tr>
              </thead>
              <tbody className="text-[var(--admin-ink)]">
                {weeks.map((w) => (
                  <tr key={w.day} className="border-t border-[var(--admin-line)]">
                    <td className="py-2 pr-4">{dayWords(w.day)}</td>
                    <td className="py-2 pr-4">{number(w.numbers.visible_events)}</td>
                    <td className="py-2 pr-4">{number(w.numbers.paid_tickets_7d)}</td>
                    <td className="py-2 pr-4">{number(w.numbers.frequent_paid_organisers_30d)}</td>
                    <td className="py-2 pr-4">{number(w.numbers.subscribers_confirmed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
