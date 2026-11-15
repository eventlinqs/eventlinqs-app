/**
 * THE AUTOMATION DASHBOARD'S RULES (Lawal's 13:41 of 15 November 2026, relayed by the PM at 13:55: "everything must be
 * automated 100% ... Automation works every day, straight from the dashboard live"). Pure, so every rule here is pinned
 * by tests/unit/admin/automation-math.test.ts; the reads are in ./automation.ts.
 *
 * nextRun: the next minute a five-field schedule fires. Vercel runs every cron schedule in UTC ("Cron jobs are always
 * run in the UTC timezone", vercel.com/docs/cron-jobs), so the fields are read against UTC. It reads the forms this
 * platform's vercel.json uses: '*', a number, a list ('4,18'), a range ('1-5') and a step ('*\/15', '40 *\/6'), and
 * answers null for anything else rather than guess.
 *
 * threeNumbers: the three test numbers on the dashboard's top (Lawal's 13:41: organisers selling on our checkout, paid
 * tickets this month through our checkout, month on month growth; targets by 15 February 2027: 30, 5,000, 30 percent).
 * Growth is null while last month is 0: a rise from nothing is no percentage.
 */

type Field = { values: Set<number> } | null

function parseField(text: string, min: number, max: number): Field {
  const values = new Set<number>()
  for (const part of text.split(',')) {
    const [range, stepText] = part.split('/')
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step < 1) return null
    let from: number
    let to: number
    if (range === '*') {
      from = min
      to = max
    } else if (/^\d+-\d+$/.test(range)) {
      ;[from, to] = range.split('-').map(Number) as [number, number]
    } else if (/^\d+$/.test(range)) {
      from = Number(range)
      to = stepText === undefined ? from : max
    } else {
      return null
    }
    if (from < min || to > max || from > to) return null
    for (let v = from; v <= to; v += step) values.add(v)
  }
  return { values }
}

/** The next time, strictly after `after`, that the five-field UTC schedule fires; null when it cannot be read. */
export function nextRun(schedule: string, after: Date): Date | null {
  const fields = schedule.trim().split(/\s+/)
  if (fields.length !== 5) return null
  const [minute, hour, dom, month, dow] = [
    parseField(fields[0], 0, 59),
    parseField(fields[1], 0, 23),
    parseField(fields[2], 1, 31),
    parseField(fields[3], 1, 12),
    parseField(fields[4], 0, 6),
  ]
  if (!minute || !hour || !dom || !month || !dow) return null
  const domAny = fields[2] === '*'
  const dowAny = fields[4] === '*'
  const t = new Date(after.getTime())
  t.setUTCSeconds(0, 0)
  t.setUTCMinutes(t.getUTCMinutes() + 1)
  // Eight days of minutes covers every weekly schedule; nothing in vercel.json is rarer.
  for (let i = 0; i < 8 * 24 * 60; i++) {
    const dayOk = domAny && dowAny
      ? true
      : domAny
        ? dow.values.has(t.getUTCDay())
        : dowAny
          ? dom.values.has(t.getUTCDate())
          : dom.values.has(t.getUTCDate()) || dow.values.has(t.getUTCDay())
    if (
      minute.values.has(t.getUTCMinutes()) &&
      hour.values.has(t.getUTCHours()) &&
      month.values.has(t.getUTCMonth() + 1) &&
      dayOk
    ) {
      return t
    }
    t.setUTCMinutes(t.getUTCMinutes() + 1)
  }
  return null
}

export const TARGETS = { organisersSelling: 30, paidTickets: 5000, growthPercent: 30, by: '15 February 2027' } as const

export type ThreeNumbers = {
  organisersSelling: number
  paidTicketsThisMonth: number
  paidTicketsLastMonth: number
  /** Month on month growth of paid tickets in whole percent; null while last month is 0. */
  growthPercent: number | null
}

export function threeNumbers(input: { organisersSelling: number; paidTicketsThisMonth: number; paidTicketsLastMonth: number }): ThreeNumbers {
  const growthPercent =
    input.paidTicketsLastMonth > 0
      ? Math.round(((input.paidTicketsThisMonth - input.paidTicketsLastMonth) / input.paidTicketsLastMonth) * 100)
      : null
  return { ...input, growthPercent }
}

/** The card's one word: RUNS (on and nothing waits), WAITS (a person's yes or press is needed), OFF (its switch is off). */
export type CardState = 'runs' | 'waits' | 'off'

/** A card as needsYou reads it: what waits on it, and whether that is an approval. */
export type WaitingCard = { readonly waitsFor: string | null; readonly readFailed: string | null; readonly waiting: number; readonly approvalNoun?: string }

/**
 * WHAT WAITS FOR A PERSON, ONE SOURCE FOR BOTH PAGES (the PM's 02:45 of 16 November 2026, fix 1: Today said 'Waiting for
 * approval 0' while Automation, on the same database, said 5 posts and 3 letters wait): the tasks that wait (each card
 * with something waiting or a read that failed, as Automation's 'Needs you today' lists them) and the approvals inside
 * them, summed from the cards' own counts. /admin/automation and /admin/today both read this;
 * tests/unit/admin/needs-you.test.ts holds the two to one fixture.
 */
export function needsYou(cards: readonly WaitingCard[]): { tasks: number; approvals: number; parts: { noun: string; n: number }[]; unread: number } {
  const approvals = cards.filter((c) => c.approvalNoun && c.waiting > 0 && !c.readFailed)
  return {
    tasks: cards.filter((c) => c.waitsFor || c.readFailed).length,
    approvals: approvals.reduce((n, c) => n + c.waiting, 0),
    parts: approvals.map((c) => ({ noun: c.approvalNoun as string, n: c.waiting })),
    unread: cards.filter((c) => c.readFailed).length,
  }
}

export function cardState(input: { switchedOn: boolean | null; waitingOnPerson: number }): CardState {
  if (input.switchedOn === false) return 'off'
  return input.waitingOnPerson > 0 ? 'waits' : 'runs'
}
