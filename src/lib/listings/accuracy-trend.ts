/**
 * THE ENGINE ACCURACY SWEEP'S TREND (learning part 1 of the CONTROLLER's 08:42 of 7 November 2026: 'each run's rate per field
 * and per source appended to one trend file (date, facts checked, wrong, unreadable, rate); a rate that rises over the day
 * before is a CONTROLLER line'). Pure: the sweep (scripts/verify/engine-accuracy-sweep.mts) appends the row and says so when
 * the rate rose.
 */
export type Tally = { facts: number; wrong: number }
export type TrendRow = {
  at: string
  /** The run's day in Melbourne, the day a person reads it as. */
  date: string
  facts: number
  wrong: number
  unreadable: number
  /** Wrong over checked, in per cent, three places. */
  rate: number
  byField: Record<string, Tally>
  bySource: Record<string, Tally>
}

const melbourneDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' })

export function trendRow(at: string, facts: readonly { field: string; host: string; ok: boolean }[], unreadable: number): TrendRow {
  const add = (into: Record<string, Tally>, key: string, ok: boolean) => {
    const t = into[key] ?? { facts: 0, wrong: 0 }
    into[key] = { facts: t.facts + 1, wrong: t.wrong + (ok ? 0 : 1) }
  }
  const byField: Record<string, Tally> = {}
  const bySource: Record<string, Tally> = {}
  for (const f of facts) {
    add(byField, f.field, f.ok)
    add(bySource, f.host, f.ok)
  }
  const wrong = facts.filter((f) => !f.ok).length
  return {
    at,
    date: melbourneDay.format(new Date(at)),
    facts: facts.length,
    wrong,
    unreadable,
    rate: facts.length === 0 ? 0 : Math.round((100000 * wrong) / facts.length) / 1000,
    byField,
    bySource,
  }
}

/**
 * THE WEEKLY PROOF FOR LAWAL (learning part 5 of the CONTROLLER's 08:42: 'rate this week against last, lessons added, sources
 * improved, sources still unreadable, in plain words'). From the trend's rows: each week's last run (the week ending on
 * `today`, and the seven days before it), the sources whose wrong share fell, and the listings still unreadable. Lessons
 * added are counted by the caller from the corpus and passed in. Pure; no dashes in what it writes.
 */
export function weeklyProof(rows: readonly TrendRow[], today: string, lessonsAdded: number | null = null): string {
  const day = (d: string, back: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() - back * 86400000).toISOString().slice(0, 10)
  const weekStart = day(today, 7)
  const lastWeekStart = day(today, 14)
  const thisWeek = rows.filter((r) => r.date > weekStart && r.date <= today).at(-1)
  const lastWeek = rows.filter((r) => r.date > lastWeekStart && r.date <= weekStart).at(-1)
  const pct = (n: number) => `${Number(n.toFixed(3))}%`
  const lines: string[] = [`# The engine's week to ${today}`, '']
  if (!thisWeek) return [...lines, 'No sweep ran this week, so there is nothing to report; that is itself a fault to fix.'].join('\n')
  lines.push(
    lastWeek
      ? `This week the engine was wrong on ${pct(thisWeek.rate)} of the facts it checked, ${thisWeek.rate < lastWeek.rate ? 'down' : thisWeek.rate > lastWeek.rate ? 'up' : 'unchanged'} from ${pct(lastWeek.rate)} the week before.`
      : `This week the engine was wrong on ${pct(thisWeek.rate)} of the facts it checked (${thisWeek.wrong} of ${thisWeek.facts}); there is no week before it to compare with.`,
  )
  /* Only what the trend measured is said: whether a wrong fact or an unreadable listing is held is a fact of the hold, not of
     this row, and a proof that claimed a protection not yet built would mislead the one person it is for. */
  lines.push(`The target is 0.01%.`)
  if (lessonsAdded !== null) lines.push(`${lessonsAdded} new lessons went into the engine's corpus this week; each is a test that fails if the fault returns.`)
  if (lastWeek) {
    const share = (t: Tally | undefined) => (t && t.facts > 0 ? (100 * t.wrong) / t.facts : null)
    const improved = Object.keys(thisWeek.bySource)
      .map((h) => ({ h, before: share(lastWeek.bySource[h]), now: share(thisWeek.bySource[h]) }))
      .filter((s) => s.before !== null && s.now !== null && (s.now as number) < (s.before as number))
    lines.push('', improved.length ? 'Sources that got better:' : 'No source got better this week.')
    for (const s of improved) lines.push(`- ${s.h}: ${pct(s.before as number)} wrong last week, ${pct(s.now as number)} this week`)
  }
  lines.push('', `${thisWeek.unreadable} listings could not be read against their source this week.`)
  return lines.join('\n').replace(/\s+%/g, '%')
}

/** Whether this run's rate is above the LAST run of the most recent EARLIER day; runs the same day never count. */
export function rateRose(earlier: readonly Pick<TrendRow, 'date' | 'rate'>[], current: Pick<TrendRow, 'date' | 'rate'>): boolean {
  const before = earlier.filter((r) => r.date < current.date)
  if (before.length === 0) return false
  const lastDay = before[before.length - 1].date
  const last = before.filter((r) => r.date === lastDay).at(-1) as Pick<TrendRow, 'date' | 'rate'>
  return current.rate > last.rate
}
