/**
 * THE ACCURACY TREND AND THE WEEKLY PROOF (learning parts 1 and 5 of the CONTROLLER's 08:42 of 7 November 2026). READ ONLY on
 * the database (it reads none); it reads the sweep's own files.
 *   node node_modules/tsx/dist/cli.mjs scripts/verify/accuracy-trend.mts backfill [dir]   trend.jsonl from every sweep-*.json, oldest first
 *   node node_modules/tsx/dist/cli.mjs scripts/verify/accuracy-trend.mts weekly [dir]     this week's proof, in plain words, to weekly-<date>.md
 * The sweep itself appends a row on every run (scripts/verify/engine-accuracy-sweep.mts).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const pick = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const { trendRow, weeklyProof } = pick((await import('@/lib/listings/accuracy-trend')) as typeof import('@/lib/listings/accuracy-trend'))
type TrendRow = import('@/lib/listings/accuracy-trend').TrendRow

const [mode, dirArg] = process.argv.slice(2)
const DIR = dirArg ?? 'C:/dev/GROWTH/accuracy'
const TREND = join(DIR, 'trend.jsonl')

if (mode === 'backfill') {
  if (existsSync(TREND)) throw new Error(`${TREND} exists; the backfill only starts a trend, it never rewrites one`)
  const runs = readdirSync(DIR)
    .filter((f) => /^sweep-.*\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as { at: string; facts: { field: string; host: string; ok: boolean }[]; unreadable: unknown[] })
    .sort((a, b) => a.at.localeCompare(b.at))
  const rows = runs.map((r) => trendRow(r.at, r.facts, r.unreadable.length))
  writeFileSync(TREND, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  for (const r of rows) console.log(`[trend] ${r.at} ${r.rate}% (${r.wrong} of ${r.facts}), unreadable ${r.unreadable}`)
  console.log(`[trend] ${rows.length} run(s) written to ${TREND}`)
} else if (mode === 'weekly') {
  const rows = existsSync(TREND) ? readFileSync(TREND, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as TrendRow) : []
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const text = weeklyProof(rows, today)
  const out = join(DIR, `weekly-${today}.md`)
  writeFileSync(out, text + '\n')
  console.log(text)
  console.log(`[trend] written to ${out}`)
} else {
  throw new Error('usage: accuracy-trend.mts <backfill|weekly> [dir]')
}
