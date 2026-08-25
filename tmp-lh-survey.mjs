/**
 * LIGHTHOUSE SURVEY across every major surface, not the one page the gate
 * happens to measure.
 *
 * Why not `lhci collect`: on Windows chrome-launcher's temp-profile teardown
 * throws EPERM and takes the run down BEFORE the report is written, killing
 * roughly half of a multi-URL survey with no output. This drives Lighthouse
 * directly and keeps ONE Chrome for the whole survey, so there is no per-URL
 * teardown to fail.
 *
 * Settings mirror lighthouserc.json (mobile form factor, the el-audit cookie,
 * the widened gather window) so the three DETERMINISTIC signals - accessibility
 * with the names of the failing audits, CLS, and the exact
 * resource-summary:script:size the budget asserts - are comparable to the
 * gate's. Performance and LCP move between runs and are labelled as such.
 *
 * Prints how many URLs it measured and how many errored, so a survey that
 * silently measured nothing cannot read as a clean sweep.
 *
 * Usage: node tmp-lh-survey.mjs <baseUrl> <label> <path> [path...]
 *   Paths are passed WITHOUT a leading slash: Git Bash rewrites a leading '/'
 *   into a Windows path before node ever sees it. Use '.' for the root.
 */
import lighthouse from 'lighthouse'
import { launch } from 'chrome-launcher'
import { writeFileSync } from 'node:fs'

const [, , BASE, LABEL, ...RAW] = process.argv
if (!BASE || RAW.length === 0) {
  console.error('usage: node tmp-lh-survey.mjs <baseUrl> <label> <path> [path...]')
  process.exit(1)
}
const PATHS = RAW.map((p) => (p === '.' ? '/' : '/' + p.replace(/^\/+/, '')))
const SCRIPT_BUDGET = 491520
const CLS_MAX = 0.1

const chrome = await launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
})

const rows = []
let errored = 0
for (const path of PATHS) {
  const url = BASE + path
  let lhr
  try {
    const r = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      formFactor: 'mobile',
      screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
      throttlingMethod: 'simulate',
      maxWaitForLoad: 60000,
      pauseAfterLoadMs: 5000,
      networkQuietThresholdMs: 5000,
      cpuQuietThresholdMs: 3000,
      extraHeaders: { Cookie: 'el-audit=1' },
      onlyCategories: ['performance', 'accessibility'],
    })
    lhr = r.lhr
  } catch (err) {
    errored += 1
    rows.push({ path, error: String(err?.message || err).slice(0, 110) })
    console.log(`  ERROR   ${path}  ${String(err?.message || err).slice(0, 100)}`)
    continue
  }

  if (lhr.runtimeError) {
    errored += 1
    rows.push({ path, error: `${lhr.runtimeError.code}: ${String(lhr.runtimeError.message).slice(0, 80)}` })
    console.log(`  RUNTIME ${path}  ${lhr.runtimeError.code}`)
    continue
  }

  const a11y = lhr.categories.accessibility.score
  const perf = lhr.categories.performance.score
  const cls = lhr.audits['cumulative-layout-shift']?.numericValue ?? null
  const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? null
  // The SAME audit the budget asserts, not a hand-rolled sum of network rows.
  const script = (lhr.audits['resource-summary']?.details?.items || []).find((i) => i.resourceType === 'script')
  const scriptBytes = script?.transferSize ?? null

  const failing = []
  for (const ref of lhr.categories.accessibility.auditRefs) {
    const a = lhr.audits[ref.id]
    if (a && a.score !== null && a.score !== undefined && a.score < 1) {
      failing.push(`${ref.id}(${(a.details?.items || []).length})`)
    }
  }

  const row = { path, a11y, perf, cls, lcp, scriptBytes, scriptReqs: script?.requestCount ?? null, failing }
  rows.push(row)
  console.log(
    `  ${path.padEnd(40)} a11y ${String(a11y).padEnd(5)} cls ${String(Math.round((cls ?? 0) * 1000) / 1000).padEnd(6)} script ${String(scriptBytes).padStart(7)} perf ${perf} lcp ${Math.round(lcp ?? 0)}${failing.length ? '  [' + failing.join(' ') + ']' : ''}`,
  )
}
// chrome-launcher's temp-profile delete throws EPERM on Windows often enough
// that it once destroyed a completed 12-URL survey at teardown, after every
// measurement had been taken. The survey is not the browser's cleanup.
try { await chrome.kill() } catch (err) { console.log(`  (chrome teardown: ${String(err?.code || err)})`) }

const measured = rows.filter((r) => !r.error)
console.log(`\n[survey ${LABEL}] measured ${measured.length} of ${PATHS.length} URL(s); ${errored} errored`)
if (measured.length === 0) process.exit(1)

const failA11y = measured.filter((r) => r.a11y !== null && r.a11y < 1)
const failCls = measured.filter((r) => r.cls !== null && r.cls > CLS_MAX)
const failScript = measured.filter((r) => r.scriptBytes !== null && r.scriptBytes > SCRIPT_BUDGET)
const anyFail = measured.filter((r) => failA11y.includes(r) || failCls.includes(r) || failScript.includes(r))
console.log(`[survey ${LABEL}] accessibility below 1.00: ${failA11y.length}`)
console.log(`[survey ${LABEL}] CLS above ${CLS_MAX}:          ${failCls.length}`)
console.log(`[survey ${LABEL}] script above ${SCRIPT_BUDGET}: ${failScript.length}`)
console.log(`[survey ${LABEL}] surfaces failing at least one: ${anyFail.length} of ${measured.length}`)

writeFileSync(`tmp-survey-${LABEL}.json`, JSON.stringify({ base: BASE, label: LABEL, rows }, null, 2))
console.log(`[survey ${LABEL}] rows written to tmp-survey-${LABEL}.json`)
