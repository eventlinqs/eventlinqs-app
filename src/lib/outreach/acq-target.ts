/**
 * THE ORGANISER MARKETING TARGET AND ITS WORDS (Lawal's 09:01 of 20 November 2026, item 5: "up to 20 a business day; if
 * fewer qualify, the shortfall is reported and discovery continues; never a fabricated or unsuitable recipient"). Pure.
 *
 * The target is law 24's: twenty qualified first contacts with organisers a business day, ACQ-FIRST only. The cities are
 * the four guide cities Lawal named for these letters on 18 November 2026 (11:27). The pool itself is read by ./acq-pool.ts.
 */
export const ACQ_DAILY_TARGET = 20
export const ACQ_GUIDE_CITIES: readonly string[] = ['melbourne', 'geelong', 'ballarat', 'bendigo']

/** The day's words for the 08:00 report: what is ready, the shortfall against the target, and the pool behind it. */
export function shortfallWords(readyToday: number, pool: number | null, businessDay: boolean): string {
  if (!businessDay) return 'Not a business day: no first letters are due.'
  const short = Math.max(0, ACQ_DAILY_TARGET - readyToday)
  if (short === 0) return `${readyToday} first letters ready to go, the day's twenty met.`
  const poolWords = pool === null ? 'the pool could not be read' : `the pool holds ${pool} ${pool === 1 ? 'organiser' : 'organisers'} with a recorded basis not yet written`
  const ready = readyToday === 0 ? 'No first letters queued' : `${readyToday} ${readyToday === 1 ? 'first letter' : 'first letters'} ready to go`
  return `${ready}, ${short} short of twenty; ${poolWords}; discovery goes on.`
}
