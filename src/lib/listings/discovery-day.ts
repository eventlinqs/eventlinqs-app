/**
 * THE EVENT DISCOVERY ENGINE'S OWN DAY LINE AND ITS SEVEN DAY PROOF (Lawal, 13 November 2026, 18:28 and 18:31: "the
 * engine does all of these by itself in production, every day, with NO window and NO person touching it ... COMPLETE when
 * (a) to (f) are live and SEVEN CONSECUTIVE DAYS of its own runs show zero manual steps, read from its own logs").
 *
 * Every collection turn adds its own numbers to the Melbourne day's line (public.discovery_engine_days, migration
 * 20261113184501); the first turn of the next day judges the finished day from the engine's own records and writes:
 *   (a) the scout ran that night and registered or refused sites without an error;
 *   (b) all four turns read their sources, each failure shown on the Command Centre by itself;
 *   (c) no night failed to be written and none waits without its reason;
 *   (d) every upcoming listing's venue carries a CRM organiser;
 *   (e) no duplicate is listed, no hold is overdue or unscheduled, and no changed night waits on a person past a day
 *       (ended nights leave every list by the listing window itself, law 16);
 *   (f) this line, written by the engine.
 * A manual step is a write by a window or a person to the sources, the candidates or the listings that day: a person's
 * decision on a candidate, a hold released by anyone but the engine, a source registered by anyone but the scout, an admin
 * change to a listing. The consecutive days count every day all six PASS with no manual step, following the day before;
 * a FAIL or a manual step sets it to zero. Pure.
 */

export const DISCOVERY_PARTS = ['a', 'b', 'c', 'd', 'e', 'f'] as const
export type DiscoveryPart = (typeof DISCOVERY_PARTS)[number]
export type PartVerdict = { pass: boolean; why: string }
export type DayChecks = Record<DiscoveryPart, PartVerdict>

/** The four collection turns a day (05:25, 11:25, 17:25 and 23:25 Melbourne, vercel.json's every six hours). */
export const TURNS_A_DAY = 4

/** What each turn adds to its day's line. */
export type TurnNumbers = {
  readonly at: string
  readonly read: number
  readonly landed: number
  readonly acceptedByRule: number
  readonly queued: number
  readonly failed: number
  readonly organisersAttached: number
  readonly scout: { readonly examined: number; readonly registered: number; readonly errors: number } | null
}

/** The day's line as it builds through the day. */
export type DayNumbers = {
  turns: TurnNumbers[]
  scout: { examined: number; registered: number; errors: number; ran: boolean }
}

export const EMPTY_DAY: DayNumbers = { turns: [], scout: { examined: 0, registered: 0, errors: 0, ran: false } }

/** Adds one turn to the day's numbers; the scout's counts add up when it ran in that turn. Pure. */
export function addTurn(day: DayNumbers | null, turn: TurnNumbers): DayNumbers {
  const base = day ?? EMPTY_DAY
  const scout = turn.scout
    ? {
        examined: base.scout.examined + turn.scout.examined,
        registered: base.scout.registered + turn.scout.registered,
        errors: base.scout.errors + turn.scout.errors,
        ran: true,
      }
    : base.scout
  return { turns: [...base.turns, turn], scout }
}

/** Everything the judge reads for one finished day, from the engine's own records and production's state. */
export type DayEvidence = {
  readonly numbers: DayNumbers
  /** The turns that ran: the turns the line recorded, or the distinct hours its runs were logged in, whichever is more. */
  readonly turnsRan: number
  readonly runs: number
  readonly runFailures: number
  readonly writeFailures: number
  readonly published: number
  readonly held: number
  readonly heldWithoutReason: number
  readonly organisersAdded: number
  readonly listingsWithoutOrganiser: number
  readonly duplicatesListed: number
  readonly holdsOverdue: number
  readonly changesWaiting: number
  readonly manualSteps: number
  readonly manualDetail: readonly string[]
}

export type DayVerdict = { checks: DayChecks; allPassed: boolean; consecutiveDays: number }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Judges a finished day. previous is the line of the day before, when there is one: the count goes on only from it.
 * Pure.
 */
export function judgeDay(e: DayEvidence, previous: { consecutiveDays: number } | null): DayVerdict {
  const s = e.numbers.scout
  const turns = e.turnsRan
  const checks: DayChecks = {
    a: s.ran && s.errors === 0
      ? { pass: true, why: `the scout examined ${plural(s.examined, 'site')} and registered ${s.registered}` }
      : { pass: false, why: s.ran ? `the scout met ${plural(s.errors, 'error')}` : 'the scout did not run' },
    b: turns >= TURNS_A_DAY
      ? { pass: true, why: `${turns} turns read ${plural(e.runs, 'source')}; ${e.runFailures} failed, each shown on the Command Centre` }
      : { pass: false, why: `only ${turns} of ${TURNS_A_DAY} turns ran` },
    c: e.writeFailures === 0 && e.heldWithoutReason === 0
      ? { pass: true, why: `${e.published} published by the rules, ${e.held} held, each with its reason` }
      : {
          pass: false,
          why: [
            e.writeFailures > 0 ? `${plural(e.writeFailures, 'run')} could not write a night` : '',
            e.heldWithoutReason > 0 ? `${plural(e.heldWithoutReason, 'night')} held without a reason` : '',
          ].filter(Boolean).join('; '),
        },
    d: e.listingsWithoutOrganiser === 0
      ? { pass: true, why: `every upcoming listing's venue carries a CRM organiser; ${e.organisersAdded} entered today` }
      : { pass: false, why: `${plural(e.listingsWithoutOrganiser, 'upcoming listing')} at a venue with no CRM organiser` },
    e: e.duplicatesListed === 0 && e.holdsOverdue === 0 && e.changesWaiting === 0
      ? { pass: true, why: 'no duplicate listed, no hold overdue, no changed night waiting on a person; ended nights leave by the listing window' }
      : {
          pass: false,
          why: [
            e.duplicatesListed > 0 ? `${plural(e.duplicatesListed, 'duplicate')} listed` : '',
            e.holdsOverdue > 0 ? `${plural(e.holdsOverdue, 'hold')} overdue or unscheduled` : '',
            e.changesWaiting > 0 ? `${plural(e.changesWaiting, 'changed night')} waiting on a person` : '',
          ].filter(Boolean).join('; '),
        },
    f: { pass: true, why: 'written by the engine' },
  }
  const allPassed = DISCOVERY_PARTS.every((p) => checks[p].pass) && e.manualSteps === 0
  return { checks, allPassed, consecutiveDays: allPassed ? (previous?.consecutiveDays ?? 0) + 1 : 0 }
}

/** The Melbourne calendar day of an instant, as YYYY-MM-DD. Pure. */
export function melbourneDay(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** The day before a YYYY-MM-DD day. Pure. */
export function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * The instants that bound a Melbourne day, from its own midnight to the next, whatever the daylight saving offset that
 * day. Pure.
 */
export function melbourneDayBounds(day: string): { from: string; to: string } {
  const offsetAt = (iso: string) => {
    const at = new Date(iso)
    const local = new Date(at.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }))
    const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }))
    return local.getTime() - utc.getTime()
  }
  const startGuess = Date.parse(`${day}T00:00:00Z`)
  const from = new Date(startGuess - offsetAt(new Date(startGuess).toISOString()))
  const next = new Date(`${day}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const nextDay = next.toISOString().slice(0, 10)
  const nextGuess = Date.parse(`${nextDay}T00:00:00Z`)
  const to = new Date(nextGuess - offsetAt(new Date(nextGuess).toISOString()))
  return { from: from.toISOString(), to: to.toISOString() }
}

/** The line the Command Centre shows: the day, the count of seven, and each part. Pure. */
export function dayLineWords(row: { day: string; checks: DayChecks; manualSteps: number; consecutiveDays: number }): string {
  const parts = DISCOVERY_PARTS.map((p) => `(${p}) ${row.checks[p].pass ? 'PASS' : 'FAIL'}`).join(', ')
  return `${row.day}: day ${row.consecutiveDays} of 7; ${parts}; ${plural(row.manualSteps, 'manual step')}`
}
