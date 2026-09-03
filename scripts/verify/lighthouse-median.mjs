/**
 * LIGHTHOUSE, MEDIAN OF REPEATED RUNS, mobile and desktop, per URL.
 *
 * CLAUDE.md, Verification and gates: "Lighthouse 95+ on desktop AND mobile,
 * measured as a median of repeated runs on the Vercel preview or warmed
 * production, never a single localhost run." This is that measurement, using
 * the lighthouse CLI already installed in node_modules, with the numbers a
 * human reads printed per run and the median printed per URL.
 *
 * Usage:
 *   node scripts/verify/lighthouse-median.mjs --out C:\dev\EVIDENCE\A2\lighthouse --runs 3 \
 *     --url https://<preview>/events/<slug> --url "https://<preview>/t/<code>/watch?k=<secret>"
 *
 * It REPORTS; the advisory posture of the CI gate is the founder's ruling of
 * 25 August 2026 and is not changed here. Exit 1 only when a run fails to
 * produce a report.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
let out = null
let runs = 3
const urls = []
for (let i = 0; i < args.length; i += 1) {
  const a = args[i]
  if (a === '--out') out = args[++i]
  else if (a === '--runs') runs = Number(args[++i])
  else if (a === '--url') urls.push(args[++i])
}
if (!out || urls.length === 0) {
  console.error('FAIL: --out and at least one --url are required')
  process.exit(1)
}
if (!existsSync(out)) mkdirSync(out, { recursive: true })

const LH = resolve('node_modules', 'lighthouse', 'cli', 'index.js')
if (!existsSync(LH)) {
  console.error(`FAIL: lighthouse CLI not found at ${LH}`)
  process.exit(1)
}

const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

let failures = 0
let reports = 0
for (const url of urls) {
  for (const form of ['mobile', 'desktop']) {
    const scores = { performance: [], accessibility: [], 'best-practices': [], seo: [] }
    for (let r = 1; r <= runs; r += 1) {
      const file = join(out, `${url.replace(/^https?:\/\//, '').replace(/[?].*$/, '').replace(/[^a-z0-9]+/gi, '_')}-${form}-${r}.json`)
      rmSync(file, { force: true })
      const lhArgs = [
        LH,
        url,
        '--output=json',
        `--output-path=${file}`,
        '--quiet',
        '--chrome-flags=--headless=new --no-sandbox',
        '--only-categories=performance,accessibility,best-practices,seo',
      ]
      if (form === 'desktop') lhArgs.push('--preset=desktop')
      const res = spawnSync(process.execPath, lhArgs, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
      /*
       * JUDGED BY THE REPORT, NOT THE EXIT CODE. On Windows chrome-launcher's
       * kill() removes its scratch profile while Chrome still holds a handle
       * and throws EPERM, AFTER the audit has finished and the JSON is on disk
       * (the same race is documented in scripts/perf-median.mjs). A complete
       * measurement that exits 1 is still a measurement; a missing or
       * unparseable report is the failure. The exit code is printed so nothing
       * is quietly swallowed.
       */
      if (!existsSync(file)) {
        failures += 1
        console.log(`  ${form.padEnd(7)} run ${r}: FAILED to produce a report (${(res.stderr || '').split('\n').filter(Boolean).slice(-2).join(' | ')})`)
        continue
      }
      if (res.status !== 0) {
        console.log(`  ${form.padEnd(7)} run ${r}: lighthouse exited ${res.status} after writing the report (profile cleanup race; the audit completed)`)
      }
      reports += 1
      let json
      try {
        json = JSON.parse(readFileSync(file, 'utf8'))
      } catch (err) {
        failures += 1
        console.log(`  ${form.padEnd(7)} run ${r}: FAILED, the report is not parseable JSON (${err.message})`)
        continue
      }
      const line = []
      for (const cat of Object.keys(scores)) {
        const score = json.categories?.[cat]?.score
        if (typeof score === 'number') {
          scores[cat].push(score)
          line.push(`${cat}=${Math.round(score * 100)}`)
        }
      }
      const lcp = json.audits?.['largest-contentful-paint']?.numericValue
      console.log(`  ${form.padEnd(7)} run ${r}: ${line.join(' ')}${lcp ? ` lcp=${Math.round(lcp)}ms` : ''}`)
    }
    const med = Object.entries(scores)
      .filter(([, xs]) => xs.length > 0)
      .map(([cat, xs]) => `${cat}=${Math.round(median(xs) * 100)}`)
      .join(' ')
    console.log(`MEDIAN ${form.padEnd(7)} ${url.replace(/k=[^&]+/, 'k=***')}  ${med}`)
  }
}
console.log(`lighthouse-median: ${reports} report(s) across ${urls.length} URL(s), 2 form factors, ${runs} run(s) each; ${failures} failed run(s)`)
process.exit(reports > 0 && failures === 0 ? 0 : 1)
