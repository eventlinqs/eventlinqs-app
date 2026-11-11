/**
 * A HOLD IS NEVER LEFT HANGING (Lawal, 7 November 2026: 'You should always know the state of an event ... and not just leave
 * the system hanging'; the CONTROLLER's 16:55 (1)). The resolver walks every open hold whose next check is due
 * (listing_holds.next_check_at, migration 20261107170001) and applies one rule to what its next source answered:
 *   states the night (or the fact)    the hold is released, with the source and its words
 *   states it cancelled or ended      the night is cancelled (its full page shows the cancelled banner), never left held
 *   states nothing                    the next source, read tomorrow; when every source has been read and none states it,
 *                                     the hold is 'unconfirmed' and its first source is read again weekly
 * Every step that keeps a hold open names its next source and its time. Pure; holdWalkSql turns the steps into one begin and
 * rollback file for scripts/ops/apply-reviewed-sql-production.mjs (dry run first, applied on APPLY, logged).
 */
import { resolveFact, type Field, type Reading } from './resolver'

export const DAY_MS = 24 * 60 * 60 * 1000
export const WEEK_MS = 7 * DAY_MS

export type Tried = { url: string; at: string; stated: string | null }
export type OpenHold = {
  id: string
  eventId: string | null
  scope: 'fact' | 'night'
  field: string
  state: 'held' | 'unconfirmed'
  nextSource: string | null
  sourcesTried: Tried[]
  /** Every official source for this listing, most authoritative first (its own page, the venue's, the seller's). */
  sources: string[]
}
export type Answer = { kind: 'states'; words: string } | { kind: 'cancelled'; words: string } | { kind: 'silent'; why: string }
export type Step =
  | { kind: 'release'; by: string }
  | { kind: 'cancel'; by: string }
  | { kind: 'next'; state: 'held' | 'unconfirmed'; nextSource: string; nextCheckAt: string; tried?: Tried }

export function nextStep(hold: OpenHold, answer: Answer, now: Date): Step {
  const source = hold.nextSource ?? hold.sources[0] ?? 'no source named'
  if (answer.kind === 'states') return { kind: 'release', by: `the resolver: ${source} states ${answer.words}` }
  if (answer.kind === 'cancelled') return { kind: 'cancel', by: `the resolver: ${source} states ${answer.words}` }
  const tried: Tried = { url: source, at: now.toISOString(), stated: null }
  const read = new Set([...hold.sourcesTried.map((t) => t.url), source])
  const untried = hold.sources.find((s) => !read.has(s))
  if (untried) return { kind: 'next', state: 'held', nextSource: untried, nextCheckAt: new Date(now.getTime() + DAY_MS).toISOString(), tried }
  return {
    kind: 'next',
    state: 'unconfirmed',
    nextSource: hold.sources[0] ?? source,
    nextCheckAt: new Date(now.getTime() + WEEK_MS).toISOString(),
    tried,
  }
}

/**
 * A FACT HOLD IS RELEASED ONLY ON THE RESOLVER'S OWN RULING (WINDOW 5A, 11 November 2026). The walk used to read a fact
 * hold's next source alone and release it when that one page stated our value. The Peter Tobin Oration's price was held
 * because the officials disagree (the venue's page 1500, Eventbrite 1200, ours 1200): the walk read Eventbrite, saw 1200 and
 * would release, while the resolver, reading both, would hold it again the same day. Left out of the walk by hand on
 * 10 November, the hold went a day overdue and the engine verifier went red on 11 November.
 *
 * So a fact hold is answered by resolveFact itself over a fresh reading of every official the hold recorded (each keeping
 * the kind the resolver gave it): released only when the resolver would keep our value (keep, or a resource that corrects
 * nothing); the officials still disagreeing, or none stating it, or all agreeing on another value, keeps it held, with the
 * readings named. The walk and the resolver are one rule and cannot release and re-hold the same fact. Pure.
 */
export function factHoldAnswer(field: Field, stored: string, ownUrl: string, fresh: readonly Reading[]): Answer {
  const said = (rs: readonly Reading[]) =>
    rs.map((r) => `${hostOf(r.url)} ${r.value === null ? 'does not state it' : `'${r.value}'`}`).join(', ')
  const out = resolveFact({ field, stored, ownUrl, readings: fresh })
  if (out.kind === 'keep' || (out.kind === 'resource' && !out.corrected)) {
    return { kind: 'states', words: `its ${field} '${stored}', as every official that states it does (${said(fresh.filter((r) => r.value !== null))})` }
  }
  if (out.kind === 'hold') {
    return {
      kind: 'silent',
      why: out.reason === 'officials_disagree' ? `the officials still disagree on its ${field} (${said(fresh)})` : `no official states its ${field} (${said(fresh)})`,
    }
  }
  return { kind: 'silent', why: `the officials agree on another ${field}, '${out.value}' (${said(fresh)}); the resolver's run corrects it` }
}
const hostOf = (u: string) => {
  try {
    return new URL(u).host
  } catch {
    return u
  }
}

/**
 * The verifier's read of the open holds: a hold with no next action, or one whose next check is more than a day overdue (the
 * walk did not run, or failed), is red, by name. Pure.
 */
export function holdsVerdict(
  holds: readonly { id: string; title: string; nextSource: string | null; nextCheckAt: string | null }[],
  now: Date,
): { id: string; title: string; why: string }[] {
  const red: { id: string; title: string; why: string }[] = []
  for (const h of holds) {
    if (!h.nextSource || !h.nextCheckAt) red.push({ id: h.id, title: h.title, why: 'an open hold with no next action (no next source or no time)' })
    else if (now.getTime() - Date.parse(h.nextCheckAt) > DAY_MS) red.push({ id: h.id, title: h.title, why: `its next check (${h.nextCheckAt}) is more than a day overdue` })
  }
  return red
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

export function holdWalkSql(steps: readonly { hold: OpenHold; step: Step }[]): string {
  const out: string[] = ['begin;', "-- The resolver's walk of the open holds (src/lib/listings/hold-walk.ts), for apply-reviewed-sql-production.mjs."]
  for (const { hold, step } of steps) {
    const id = q(hold.id)
    if (step.kind === 'release') {
      if (hold.scope === 'night' && hold.eventId) out.push(`update public.events set visibility = 'public' where id = ${q(hold.eventId)} and visibility = 'private';`)
      out.push(`update public.listing_holds set released_at = now(), released_by = ${q(step.by)} where id = ${id} and released_at is null;`)
    } else if (step.kind === 'cancel') {
      if (hold.eventId) {
        out.push(`update public.events set status = 'cancelled' where id = ${q(hold.eventId)} and status = 'published' and listing_source = 'eventlinqs';`)
      }
      out.push(`update public.listing_holds set released_at = now(), released_by = ${q(step.by)} where id = ${id} and released_at is null;`)
    } else {
      const tried = step.tried ? ` || ${q(JSON.stringify([step.tried]))}::jsonb` : ''
      out.push(
        `update public.listing_holds set state = ${q(step.state)}, next_source = ${q(step.nextSource)}, next_check_at = ${q(step.nextCheckAt)}, sources_tried = sources_tried${tried} where id = ${id} and released_at is null;`,
      )
    }
  }
  out.push('rollback;')
  return out.join('\n') + '\n'
}
