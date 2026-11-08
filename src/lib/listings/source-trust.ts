import type { TrendRow } from './accuracy-trend'

/**
 * EACH SOURCE EARNS A TRUST RECORD (learning part 4 of the CONTROLLER's 08:42 of 7 November 2026: "its accuracy history
 * decides how often it is re-read and how strict the gate is; a source that keeps failing is re-read before every
 * publication; one that stays right is re-read on the normal cycle"). Pure: from the accuracy sweep's own trend
 * (src/lib/listings/accuracy-trend.ts, one row a run with each source host's facts and wrong facts).
 *
 * The rule, in order, over the runs that checked at least one fact from the host, newest last:
 *   unproven  fewer than two such runs: not enough history to earn anything;
 *   failing   the newest run found it wrong, or two of its last three did;
 *   watch     any of its last seven runs found it wrong;
 *   earned    two runs or more, and none of its last seven wrong.
 * What each means for re-reading is said in its words. The gate's own strictness changes only with Lawal's yes (law 19
 * (e)); until then this is a record that is printed and read, never a switch (C:\dev\EVIDENCE\EL-8NOV\car56\plan.md).
 */

export type Trust = 'unproven' | 'earned' | 'watch' | 'failing'

export type SourceTrust = {
  readonly host: string
  readonly trust: Trust
  /** Runs that checked at least one of its facts. */
  readonly runs: number
  /** Its facts and wrong facts over every such run. */
  readonly facts: number
  readonly wrong: number
  /** Why, in plain words. */
  readonly reason: string
  /** How often it should be re-read, in plain words. */
  readonly reread: string
}

const REREAD: Record<Trust, string> = {
  failing: 'before every publication of one of its nights (the gate change waits for Lawal, law 19 (e))',
  watch: 'every 6 hours, the shortest learned interval',
  unproven: 'every 6 hours until two runs have checked it',
  earned: 'on its learned interval, 6 to 24 hours',
}

export function sourceTrust(rows: readonly TrendRow[], host: string): SourceTrust {
  const seen = rows.map((r) => r.bySource[host]).filter((t): t is { facts: number; wrong: number } => t !== undefined && t.facts > 0)
  const facts = seen.reduce((n, t) => n + t.facts, 0)
  const wrong = seen.reduce((n, t) => n + t.wrong, 0)
  const wrongIn = (k: number) => seen.slice(-k).filter((t) => t.wrong > 0).length
  let trust: Trust
  let reason: string
  if (seen.length < 2) {
    trust = 'unproven'
    reason = seen.length === 0 ? 'no run has checked a fact from it yet' : 'one run has checked it; two are needed'
  } else if ((seen.at(-1)?.wrong ?? 0) > 0 || wrongIn(3) >= 2) {
    trust = 'failing'
    const newest = seen.at(-1)?.wrong ?? 0
    reason = newest > 0 ? `the newest run found ${newest} wrong ${newest === 1 ? 'fact' : 'facts'} from it` : `two of its last three runs found it wrong`
  } else if (wrongIn(7) > 0) {
    trust = 'watch'
    reason = `${wrongIn(7)} of its last ${Math.min(7, seen.length)} runs found it wrong, none of the newest`
  } else {
    trust = 'earned'
    reason = `right in each of its last ${Math.min(7, seen.length)} runs`
  }
  return { host, trust, runs: seen.length, facts, wrong, reason, reread: REREAD[trust] }
}

const ORDER: Record<Trust, number> = { failing: 0, watch: 1, unproven: 2, earned: 3 }

/** Every host the trend has seen, the ones that need attention first. */
export function trustTable(rows: readonly TrendRow[]): SourceTrust[] {
  const hosts = new Set(rows.flatMap((r) => Object.keys(r.bySource)))
  return [...hosts].map((h) => sourceTrust(rows, h)).sort((a, b) => ORDER[a.trust] - ORDER[b.trust] || b.wrong - a.wrong || a.host.localeCompare(b.host))
}

/** The record as Lawal reads it: plain words, no dashes. */
export function trustReport(rows: readonly TrendRow[], today: string): string {
  const table = trustTable(rows)
  const count = (t: Trust) => table.filter((s) => s.trust === t).length
  const lines = [
    `# Each source's trust, ${today}`,
    '',
    `${table.length} sources: ${count('earned')} earned, ${count('watch')} on watch, ${count('failing')} failing, ${count('unproven')} not yet proven.`,
    '',
  ]
  for (const s of table) lines.push(`- ${s.host}: ${s.trust}, because ${s.reason}; ${s.wrong} wrong of ${s.facts} facts over ${s.runs} ${s.runs === 1 ? 'run' : 'runs'}. Re-read ${s.reread}.`)
  return lines.join('\n')
}
