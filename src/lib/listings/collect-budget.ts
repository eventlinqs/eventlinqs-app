/**
 * THE SCOUT'S TIME IS HELD BACK ON ITS TURN (the PM's 02:40 of 19 November 2026, gap 1; car D, A5). The discovery
 * engine's record read 'the scout did not run' on 15, 16 and 17 November: every night's 23:25 turn ran and recorded no
 * scout, because the collection run was handed the whole budget and reads pages until that deadline
 * (collect-run.ts), while the scout starts only with SCOUT_MIN_LEFT_MS of the budget left. On the scout's turn the
 * collection run's deadline now ends early enough to leave the scout its time, with a margin for the one page a
 * source may finish past its deadline. Every other turn keeps the whole budget. Pure.
 */

/** The scout starts only with at least this much of the budget left, so it can examine its sites whole. */
export const SCOUT_MIN_LEFT_MS = 90_000
/** What a source may run past the deadline it was given: the page it was reading when the deadline came. */
export const SCOUT_MARGIN_MS = 10_000

/** The moment no collection source may start after, on this turn. */
export function collectionDeadline(started: number, budgetMs: number, scoutTurn: boolean): number {
  return started + budgetMs - (scoutTurn ? SCOUT_MIN_LEFT_MS + SCOUT_MARGIN_MS : 0)
}

/** Whether the scout may start now: its turn, with its time left. */
export function scoutMayStart(started: number, budgetMs: number, now: number, scoutTurn: boolean): boolean {
  return scoutTurn && started + budgetMs - now >= SCOUT_MIN_LEFT_MS
}

/** What the turn records when the scout's turn came without its time, so the day's line names why. */
export function scoutSkippedLine(started: number, budgetMs: number, now: number): string {
  return `the scout had ${Math.max(0, Math.round((started + budgetMs - now) / 1000))} s left, under its ${SCOUT_MIN_LEFT_MS / 1000} s`
}
