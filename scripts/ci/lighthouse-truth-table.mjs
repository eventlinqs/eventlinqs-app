/**
 * THE TRUTH TABLE: what the gated pages actually cost, one row per URL.
 *
 * WHY (close-out C8 CORRECTED, 7 September 2026). The gate reports a category
 * score and nothing else, and until this file it reported the BEST of three
 * runs. The owner was quoted best-run figures and planned against them. What a
 * reader needs when a score moves is the typical run and the parts that make
 * it: LCP, TBT, CLS, script bytes, and WHICH element is the LCP. Lighthouse
 * 12.1.0 could not name that element (its TraceElements gatherer threw, so
 * largest-contentful-paint-element came back as an error in every report);
 * 12.6.1 can, and this table prints it when it is there and says plainly when
 * it is not.
 *
 * It reads the reports `lhci collect` (or the gate's own collection) left in
 * .lighthouseci, groups them by URL, and prints MEDIANS across the runs of each
 * URL, with the run count and the spread of the performance score beside them,
 * as a markdown table so the same lines can be pasted into REVIEW-QUEUE.md
 * unchanged (C8.4 asks for one table in plain language).
 *
 * It NEVER fails the build. It is a reporter, not a gate: `lhci assert` decides
 * pass or fail, and this must not be able to mask or pre-empt it.
 *
 * Run: node scripts/ci/lighthouse-truth-table.mjs [lighthouseciDir]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

/** The middle run; the mean of the two middle runs for an even count. */
export function median(values) {
  const sorted = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor((sorted.length - 1) / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid] + sorted[mid + 1]) / 2
}

/** The path of a report's URL, for the table; the whole URL if it does not parse. */
export function pathOf(url) {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

/** Script transfer bytes from the resource-summary audit, or null when the audit is absent. */
export function scriptBytes(lhr) {
  const items = lhr?.audits?.['resource-summary']?.details?.items
  if (!Array.isArray(items)) return null
  const row = items.find((i) => i?.resourceType === 'script')
  return typeof row?.transferSize === 'number' ? row.transferSize : null
}

/**
 * The LCP element as Lighthouse names it, or the reason it cannot. The audit's
 * details are a list whose first table carries the node; an errored audit (the
 * 12.1.0 TraceElements fault) carries scoreDisplayMode 'error' and a message.
 */
export function lcpElement(lhr) {
  const audit = lhr?.audits?.['largest-contentful-paint-element']
  if (!audit) {
    // Lighthouse 13 retired that audit for the LCP insights, whose list details
    // carry the element as an item of type 'node' (scripts/verify/lighthouse-median.mjs
    // runs the repository's own Lighthouse 13, so its reports arrive here too).
    for (const id of ['lcp-breakdown-insight', 'lcp-discovery-insight']) {
      const node = lhr?.audits?.[id]?.details?.items?.find((i) => i?.type === 'node')
      if (node) return describeNode(node)
    }
    return 'not reported (audit absent)'
  }
  if (audit.scoreDisplayMode === 'error') {
    return `not reported (audit errored: ${String(audit.errorMessage ?? 'no message').split('\n')[0].slice(0, 80)})`
  }
  const first = audit.details?.items?.[0]
  const node = first?.items?.[0]?.node ?? first?.node
  if (!node) return 'not reported (no node in the audit details)'
  return describeNode(node)
}

/** Selector, label and snippet of a Lighthouse node, on one line, bounded. */
function describeNode(node) {
  const label = String(node.nodeLabel ?? '').trim().replace(/\s+/g, ' ')
  const selector = String(node.selector ?? '').trim()
  const snippet = String(node.snippet ?? '').trim().replace(/\s+/g, ' ')
  const parts = [selector, label && label !== selector ? `"${label.slice(0, 60)}"` : '', snippet ? snippet.slice(0, 100) : '']
  return parts.filter(Boolean).join(' ') || 'not reported (empty node)'
}

/**
 * One row per URL from a set of reports: medians across that URL's runs, the
 * run count, the spread of the performance score, and the LCP element from the
 * median-performance run (the run the gate would judge under median).
 */
export function summarise(lhrs) {
  const byUrl = new Map()
  for (const lhr of lhrs) {
    const url = lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl || '(unknown)'
    if (!byUrl.has(url)) byUrl.set(url, [])
    byUrl.get(url).push(lhr)
  }
  const rows = []
  for (const [url, runs] of [...byUrl.entries()].sort((a, b) => pathOf(a[0]).localeCompare(pathOf(b[0])))) {
    const perf = runs.map((l) => l.categories?.performance?.score).filter((v) => typeof v === 'number')
    const perfMedian = median(perf)
    const audit = (id) => median(runs.map((l) => l.audits?.[id]?.numericValue))
    // The run whose performance score is the median (or nearest below it) names the element.
    const sortedRuns = [...runs].sort((a, b) => (a.categories?.performance?.score ?? 0) - (b.categories?.performance?.score ?? 0))
    const medianRun = sortedRuns[Math.floor((sortedRuns.length - 1) / 2)] ?? runs[0]
    rows.push({
      url,
      path: pathOf(url),
      runs: runs.length,
      version: medianRun?.lighthouseVersion ?? 'unknown',
      formFactor: medianRun?.configSettings?.formFactor ?? 'unknown',
      perfMedian,
      perfMin: perf.length ? Math.min(...perf) : null,
      perfMax: perf.length ? Math.max(...perf) : null,
      lcpMs: audit('largest-contentful-paint'),
      tbtMs: audit('total-blocking-time'),
      cls: audit('cumulative-layout-shift'),
      scriptBytes: median(runs.map(scriptBytes)),
      benchmarkIndex: median(runs.map((l) => l?.environment?.benchmarkIndex)),
      lcpElement: lcpElement(medianRun),
    })
  }
  return rows
}

/**
 * WHAT MACHINE WAS THIS TAKEN ON. Without it a slow afternoon and a real
 * regression are the same row.
 *
 * Lighthouse runs its own BenchmarkIndex before every audit and records it at
 * environment.benchmarkIndex. It is the number Lighthouse itself uses to decide
 * how hard to throttle, so two collections at different indexes are not directly
 * comparable, and a score that fell while the index fell is a statement about
 * the machine rather than about the page.
 *
 * The scale is Lighthouse's own, quoted from the header of computeBenchmarkIndex
 * in node_modules/lighthouse/core/lib/page-functions.js (lighthouse 13.4.1):
 * 1000+ desktop class, 800+ high-end Android, 125+ mid-tier Android, under 125
 * budget Android.
 *
 * MEASURED ON THIS PROJECT, 8 September 2026: the local gate produced medians of
 * 88 to 94 three times in one afternoon and then 79 to 92 that evening, on the
 * same commit, with script bytes identical to the byte and Total Blocking Time
 * roughly doubled on every URL. Nothing in the table said why. This line does.
 */
export function machineLine(rows) {
  const values = rows.map((r) => r.benchmarkIndex).filter((v) => typeof v === 'number')
  if (values.length === 0) {
    return 'Machine speed: not recorded in these reports (no environment.benchmarkIndex).'
  }
  const mid = median(values)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const klass =
    mid >= 1000
      ? 'desktop class'
      : mid >= 800
        ? 'high-end Android class'
        : mid >= 125
          ? 'mid-tier Android class'
          : 'budget Android class'
  return (
    `Machine speed while collecting: BenchmarkIndex median ${Math.round(mid)} ` +
    `(${Math.round(low)} to ${Math.round(high)} across URLs), ${klass}. ` +
    'A collection taken at a materially lower index is not comparable with one taken higher: ' +
    'compare this number before comparing any score below.'
  )
}

const fmtScore = (v) => (v == null ? 'n/a' : Math.round(v * 100).toString())
const fmtMs = (v) => (v == null ? 'n/a' : `${Math.round(v).toLocaleString('en-AU')} ms`)
const fmtCls = (v) => (v == null ? 'n/a' : v.toFixed(3))
const fmtKb = (v) => (v == null ? 'n/a' : `${Math.round(v / 1024)} KB`)

/** The markdown table, ready for REVIEW-QUEUE.md. */
export function renderTable(rows) {
  const lines = []
  lines.push('| URL | runs | performance (median, spread) | LCP | TBT | CLS | script | LCP element |')
  lines.push('|---|---|---|---|---|---|---|---|')
  for (const r of rows) {
    const spread = r.perfMin == null ? '' : ` (${fmtScore(r.perfMin)} to ${fmtScore(r.perfMax)})`
    lines.push(
      `| ${r.path} | ${r.runs} | ${fmtScore(r.perfMedian)}${spread} | ${fmtMs(r.lcpMs)} | ${fmtMs(r.tbtMs)} | ${fmtCls(r.cls)} | ${fmtKb(r.scriptBytes)} | ${r.lcpElement.replace(/\|/g, '\\|')} |`,
    )
  }
  return lines.join('\n')
}

export function main(dir = process.argv[2] || '.lighthouseci') {
  if (!existsSync(dir)) {
    console.log(`[lh-truth-table] no ${dir} directory; nothing collected, nothing to report.`)
    return 0
  }
  const files = readdirSync(dir).filter((f) => f.startsWith('lhr-') && f.endsWith('.json'))
  if (files.length === 0) {
    console.log(`[lh-truth-table] no lhr-*.json in ${dir}.`)
    return 0
  }
  const lhrs = []
  for (const file of files) {
    try {
      lhrs.push(JSON.parse(readFileSync(join(dir, file), 'utf8')))
    } catch (error) {
      console.warn('[scripts/ci/lighthouse-truth-table:read]', error instanceof Error ? error.message : error)
    }
  }
  const rows = summarise(lhrs)
  const versions = [...new Set(rows.map((r) => r.version))].join(', ')
  const forms = [...new Set(rows.map((r) => r.formFactor))].join(', ')
  console.log('')
  console.log('='.repeat(78))
  console.log('LIGHTHOUSE TRUTH TABLE (medians across runs per URL; a REPORT, not a gate)')
  console.log('='.repeat(78))
  console.log(`Lighthouse ${versions}, form factor ${forms}, ${files.length} report(s) over ${rows.length} URL(s)`)
  console.log(machineLine(rows))
  console.log('')
  console.log(renderTable(rows))
  console.log('')
  declareWork('lh-truth-table', { did: { 'lhr file read': files.length, 'URL reported': rows.length } })
  console.log('`lhci assert` decides pass or fail; this table is what the pages cost.')
  console.log('='.repeat(78))
  console.log('')
  return 0
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) process.exitCode = main()
