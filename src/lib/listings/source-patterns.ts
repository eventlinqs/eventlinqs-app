/**
 * THE ENGINE LEARNS EACH SOURCE'S SCHEDULE (learning part 3 of the CONTROLLER's 08:42 of 7 November 2026: "the patterns it
 * already reads ('every Thursday', 'second Saturday of every month', weekly timetables, season end dates) are stored per
 * source with the date first seen; each day the next sessions they predict are checked against the page, and a page that
 * stops matching its pattern is held for the resolver, not published"). Pure: the accuracy sweep observes, each day, which
 * of its listings a page vouched for in its own schedule words, and this keeps the memory.
 *
 * A pattern is one listing's schedule as one page states it: the source host and page, the listing's title, the kind of
 * words (weekly beside its title, the nth weekday of every month, a dated gig list, every weekday inside a stated range),
 * the words themselves, the day first seen, the day last matched, and the misses since. A pattern the page vouched for
 * before and does not vouch for today is BROKEN: its nights are handed to the resolver to hold (never published on the old
 * words), and the pattern keeps its history so a page that states it again is matched again. A pattern missed three days
 * running is retired: the page has changed its schedule, and the resolver's holds carry it from there.
 */

/** The schedule words the accuracy sweep reads (scripts/verify/engine-accuracy-sweep.mts), one kind each. */
export type PatternKind =
  | 'weekly_words'
  | 'weekly_beside_title'
  | 'monthly_words'
  | 'dated_gig_list'
  | 'every_in_range'
  | 'season_words'
  | 'under_name'
  | 'daily_in_range'
  | 'gates'
  | 'every_weekday'
  | 'dated_list'

export type Pattern = {
  readonly key: string
  readonly host: string
  readonly sourceUrl: string
  readonly title: string
  readonly kind: PatternKind
  readonly firstSeen: string
  readonly lastMatched: string
  /** Consecutive days the page did not vouch for it, since it last did. */
  readonly misses: number
  readonly retired: boolean
}

/** What one day's sweep saw for one listing that has, or had, a schedule pattern on its page. */
export type Observation = {
  readonly host: string
  readonly sourceUrl: string
  readonly title: string
  /** The kind of words that vouched for it today, or null when the page did not vouch for it in any schedule words. */
  readonly matched: PatternKind | null
  /** The listing's nights the sweep checked today, so a broken pattern hands exactly these to the resolver. */
  readonly eventIds: readonly string[]
}

export type Broken = { readonly pattern: Pattern; readonly eventIds: readonly string[]; readonly why: string }

export const RETIRE_AFTER_MISSES = 3

/** One listing on one page: its host, its page and its title folded, so the same night is the same pattern every day. */
export function patternKey(host: string, sourceUrl: string, title: string): string {
  const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
  return `${host.toLowerCase()}|${sourceUrl.replace(/[?#].*$/, '').replace(/\/$/, '')}|${fold(title)}`
}

/**
 * The day's observations against the memory. A new match is remembered (first seen today); a known pattern matched again
 * has its last match moved and its misses cleared; a known, live pattern the page did not vouch for today is broken (its
 * nights handed to the resolver) and counts a miss; one missed RETIRE_AFTER_MISSES days running is retired. Patterns not
 * observed today (no night of theirs in the sweep) are kept as they are.
 */
export function learnPatterns(memory: readonly Pattern[], observations: readonly Observation[], today: string): { patterns: Pattern[]; broken: Broken[]; learned: number } {
  const byKey = new Map(memory.map((p) => [p.key, p]))
  const broken: Broken[] = []
  let learned = 0
  for (const o of observations) {
    const key = patternKey(o.host, o.sourceUrl, o.title)
    const known = byKey.get(key)
    if (o.matched !== null) {
      if (!known) learned += 1
      byKey.set(key, {
        key,
        host: o.host,
        sourceUrl: o.sourceUrl,
        title: o.title,
        kind: o.matched,
        firstSeen: known?.firstSeen ?? today,
        lastMatched: today,
        misses: 0,
        retired: false,
      })
      continue
    }
    if (!known || known.retired || known.lastMatched === today) continue
    const misses = known.misses + 1
    const retired = misses >= RETIRE_AFTER_MISSES
    byKey.set(key, { ...known, misses, retired })
    broken.push({
      pattern: { ...known, misses, retired },
      eventIds: o.eventIds,
      why: `${o.host} stated ${known.title}'s schedule in its own words from ${known.firstSeen} to ${known.lastMatched} and does not today` +
        (retired ? `; missed ${misses} days running, so the pattern is retired and its nights stay with the resolver` : ''),
    })
  }
  const patterns = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
  return { patterns, broken, learned }
}
