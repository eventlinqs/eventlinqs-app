// No shebang on this file. Vite does not strip one when a test imports the module.
// Run as: node scripts/verify/seo-gate-drill.mjs <healthy|preview-indexable|new-audit>
/**
 * THE SEO GATE DRILL - prove it both ways.
 *
 * scripts/ci/assert-seo-audits.mjs replaced a `categories:seo >= 1` floor that
 * had become unpassable. A replacement gate that has only ever been seen to pass
 * is not known to gate anything, and this one was written specifically to catch
 * a regression nobody has ever actually caused, so it needs driving.
 *
 * This writes fixture reports to a scratch directory and runs the REAL script
 * against them as a subprocess - the same command line the workflow uses - then
 * reports its raw output and real exit code. Nothing is stubbed or
 * re-implemented; the fixtures carry exactly the three fields the script reads
 * (requestedUrl, categories.seo.auditRefs[].id, audits['is-crawlable'].score).
 *
 *   healthy            a correctly noindexed preview, every other audit passing  -> exit 0
 *   preview-indexable  the 15 August indexing defect returning                   -> exit 1
 *   new-audit          Lighthouse adds an SEO audit the config does not assert   -> exit 1
 *
 * Exit 2 means the DRILL is broken: the gate did something other than what the
 * scenario expects.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const BASELINE_AUDITS = [
  'canonical',
  'crawlable-anchors',
  'document-title',
  'hreflang',
  'http-status-code',
  'image-alt',
  'is-crawlable',
  'link-text',
  'meta-description',
  'robots-txt',
  'structured-data',
]

const PREVIEW = 'https://eventlinqs-c7oxyz4qs-lawals-projects-c20c0be8.vercel.app'

/**
 * A report carrying only what the gate reads. `isCrawlable` 0 means the page is
 * blocked from indexing, which is CORRECT for a preview.
 */
function report({ url, isCrawlable, auditIds = BASELINE_AUDITS }) {
  const audits = {}
  for (const id of auditIds) {
    audits[id] = id === 'is-crawlable' ? { id, score: isCrawlable } : { id, score: 1, scoreDisplayMode: 'binary' }
  }
  audits['structured-data'] = { id: 'structured-data', score: null, scoreDisplayMode: 'manual' }
  return {
    requestedUrl: url,
    categories: { seo: { score: isCrawlable === 0 ? 0.69 : 1, auditRefs: auditIds.map((id) => ({ id, weight: id === 'is-crawlable' ? 4.043478260869565 : 1 })) } },
    audits,
  }
}

const SCENARIOS = {
  healthy: () => ({
    reports: [
      report({ url: `${PREVIEW}/`, isCrawlable: 0 }),
      report({ url: `${PREVIEW}/pricing`, isCrawlable: 0 }),
    ],
    expect: 0,
    why: 'a correctly noindexed preview: is-crawlable 0, every other SEO audit passing',
  }),

  'preview-indexable': () => ({
    reports: [
      report({ url: `${PREVIEW}/`, isCrawlable: 0 }),
      // This one is inviting Googlebot again.
      report({ url: `${PREVIEW}/pricing`, isCrawlable: 1 }),
    ],
    expect: 1,
    why: 'the preview has become indexable again - the defect fixed on 15 August 2026 returning',
  }),

  'new-audit': () => ({
    reports: [
      report({ url: `${PREVIEW}/`, isCrawlable: 0, auditIds: [...BASELINE_AUDITS, 'brand-new-seo-audit'] }),
    ],
    expect: 1,
    why: 'Lighthouse now reports an SEO audit outside the reviewed baseline, so the per-audit list silently covers less than the old category floor did',
  }),
}

const name = process.argv[2]
if (!SCENARIOS[name]) {
  console.error(`usage: node scripts/verify/seo-gate-drill.mjs <${Object.keys(SCENARIOS).join('|')}>`)
  process.exit(2)
}

const { reports, expect, why } = SCENARIOS[name]()

const dir = mkdtempSync(join(tmpdir(), 'seo-gate-drill-'))
try {
  reports.forEach((r, i) => writeFileSync(join(dir, `lhr-${i}.json`), JSON.stringify(r)))

  console.log(`=== DRILL: ${name} ===`)
  console.log(`scenario: ${why}`)
  console.log(`expecting: exit code ${expect}`)
  console.log('--- raw gate output (node scripts/ci/assert-seo-audits.mjs) ---')

  const run = spawnSync(process.execPath, ['scripts/ci/assert-seo-audits.mjs', dir], { encoding: 'utf8' })
  process.stdout.write(run.stdout ?? '')
  process.stderr.write(run.stderr ?? '')

  console.log('--- end raw gate output ---')
  console.log(`actual: exit code ${run.status}`)

  if (run.status !== expect) {
    console.error(`DRILL BROKEN: expected exit ${expect}, got ${run.status}`)
    process.exit(2)
  }

  console.log(`DRILL MATCHES EXPECTATION (exiting ${run.status}, which is the gate's real verdict for this scenario)`)
  process.exit(run.status)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
