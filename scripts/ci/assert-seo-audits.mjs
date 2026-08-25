// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this as `node <path>`.
/**
 * THE SEO GATE THE CATEGORY SCORE CANNOT BE.
 *
 * WHAT WENT WRONG. The gate asserted `categories:seo >= 1` - a perfect score -
 * against a VERCEL PREVIEW. On 15 August 2026 a real defect was fixed: previews
 * were serving `x-robots-tag: index, follow` and publishing a 932-URL sitemap on
 * the preview host, overriding Vercel's own noindex and inviting Googlebot to
 * index a second copy of the catalogue. next.config.ts now sends
 * `noindex, nofollow` whenever VERCEL_ENV is set to anything but production.
 *
 * That fix made this gate unpassable. Lighthouse's `is-crawlable` audit
 * ("Page is blocked from indexing") carries 4.04 of the SEO category's 13.04
 * weighted points, so a correctly noindexed preview scores 0.69 and can never
 * score 1. The gate was punishing the fix. Measured on PR #118, `is-crawlable`
 * was the ONLY failing SEO audit on all eleven gated URLs.
 *
 * The header's own comment shows how the two facts never met: it says the value
 * falls back to `index, follow` when VERCEL_ENV is absent so as to "keep the
 * Lighthouse SEO is-crawlable audit green on localhost, WHERE THE GATE ACTUALLY
 * RUNS". The gate had already been moved off localhost onto the deployed
 * preview. Each statement was true where it was written and nothing could see
 * both.
 *
 * WHAT REPLACES IT, AND WHY IT IS NOT WEAKER. lighthouserc.json now asserts
 * every SEO audit individually at minScore 1 instead of asserting the category
 * total. A category score of 1 is reached exactly when every weighted audit
 * passes, so per-audit floors demand the same things of the page - and name the
 * one that broke instead of reporting a fraction. Two audits are excluded, for
 * stated reasons, and this file exists to make sure that exclusion can never
 * quietly grow:
 *
 *   is-crawlable     cannot pass on a preview BY DESIGN. Asserted here instead,
 *                    against the environment: a preview MUST be blocked, and
 *                    production MUST be crawlable. Re-breaking the indexing
 *                    defect now FAILS this gate, which nothing checked before.
 *   structured-data  weight 0 and scoreDisplayMode "manual". LHCI's minScore
 *                    getter returns undefined for a manual audit
 *                    (@lhci/utils/src/assertions.js AUDIT_TYPE_VALUE_GETTERS,
 *                    fetched 16 August 2026), so asserting it would gate on an
 *                    undefined value. It contributes nothing to the score.
 *
 * THE ROT THIS PREVENTS. A hand-listed set of audits is weaker than a category
 * floor the moment Lighthouse adds a twelfth SEO audit, because the new one
 * would be in the category and absent from the list, and nobody would notice.
 * So this script fails the build if the audit set Lighthouse actually reports
 * differs from the reviewed baseline below, and fails it again if
 * lighthouserc.json stops asserting any audit the baseline says it must. The
 * config and this file hold each other up; neither can drift alone.
 *
 * Run: node scripts/ci/assert-seo-audits.mjs [lighthouseciDir]
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

/**
 * The SEO category as Lighthouse 12.1.0 reports it (the version @lhci/cli
 * 0.14.x bundles, pinned in lighthouserc.json). Reviewed 16 August 2026 against
 * the eleven reports produced by the PR #118 run. If Lighthouse changes this
 * set, this script fails and a human decides what to do about the new audit -
 * which is the entire point of writing it down.
 */
const SEO_AUDIT_BASELINE = [
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

/** Excluded from per-audit assertion, each for a reason stated in the header. */
const NOT_ASSERTED = {
  'is-crawlable': 'environment-dependent; asserted by this script against the host instead',
  'structured-data': 'weight 0 and scoreDisplayMode "manual"; LHCI minScore returns undefined for it',
}

const MUST_BE_ASSERTED = SEO_AUDIT_BASELINE.filter((id) => !(id in NOT_ASSERTED))

// Canonical host ruling (founder, 2026-07-25), single-sourced in
// src/lib/site-url.ts as CANONICAL_HOST.
const CANONICAL_HOST = 'www.eventlinqs.com.au'
const PRODUCTION_HOSTS = new Set([CANONICAL_HOST, 'eventlinqs.com.au'])

const dir = process.argv[2] || '.lighthouseci'
const failures = []
const notes = []

/* ------------------------------------------------------- load the reports */


if (!existsSync(dir)) {
  console.error(`[seo-audits] FAIL: no ${dir} directory. Nothing was collected, so nothing can be asserted.`)
  process.exit(1)
}

const files = readdirSync(dir).filter((f) => f.startsWith('lhr-') && f.endsWith('.json'))
if (files.length === 0) {
  console.error(`[seo-audits] FAIL: no lhr-*.json in ${dir}. Nothing was collected, so nothing can be asserted.`)
  process.exit(1)
}

const reports = []
for (const file of files) {
  try {
    const lhr = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    if (lhr?.categories?.seo) reports.push(lhr)
  } catch (error) {
    console.warn('[scripts/ci/assert-seo-audits:116]', error instanceof Error ? error.message : error)
    failures.push(`could not parse ${join(dir, file)}`)
  }
}

if (reports.length === 0) {
  console.error(`[seo-audits] FAIL: ${files.length} report(s) in ${dir} but none carries an SEO category.`)
  process.exit(1)
}

/* ----------------------------- 1. the audit set matches the reviewed baseline */

let auditSetOk = true
const expected = [...SEO_AUDIT_BASELINE].sort().join(',')
for (const lhr of reports) {
  const actual = lhr.categories.seo.auditRefs.map((r) => r.id).sort()
  if (actual.join(',') !== expected) {
    const added = actual.filter((id) => !SEO_AUDIT_BASELINE.includes(id))
    const gone = SEO_AUDIT_BASELINE.filter((id) => !actual.includes(id))
    failures.push(
      `the SEO audit set changed on ${lhr.requestedUrl}\n` +
        (added.length ? `        NEW audits Lighthouse now reports: ${added.join(', ')}\n` : '') +
        (gone.length ? `        audits that have GONE: ${gone.join(', ')}\n` : '') +
        '        Per-audit assertions cover a hand-written list, so a new audit is\n' +
        '        NOT covered until somebody adds it. Update SEO_AUDIT_BASELINE in\n' +
        '        scripts/ci/assert-seo-audits.mjs and add the assertion to\n' +
        '        lighthouserc.json, or record why the new audit is excluded.',
    )
    auditSetOk = false
    break
  }
}

/* --------------------- 2. lighthouserc.json still asserts every audit it must */

let asserted = new Set()
try {
  const rc = JSON.parse(readFileSync('lighthouserc.json', 'utf8'))
  for (const entry of rc?.ci?.assert?.assertMatrix ?? []) {
    for (const [name, value] of Object.entries(entry.assertions ?? {})) {
      if (Array.isArray(value) && value[0] === 'error') asserted.add(name)
    }
  }
} catch (err) {
  failures.push(`could not read lighthouserc.json to verify assertion coverage: ${err.message}`)
}

const uncovered = MUST_BE_ASSERTED.filter((id) => !asserted.has(id))
if (uncovered.length) {
  failures.push(
    `lighthouserc.json no longer asserts ${uncovered.length} SEO audit(s) at error level: ${uncovered.join(', ')}\n` +
      '        These replaced the categories:seo floor. Dropping one lowers the bar\n' +
      '        silently, because the category score is no longer there to catch it.',
  )
}

/* ------------------------------- 3. indexability is correct for this host */

let checked = 0
let skipped = 0
for (const lhr of reports) {
  const audit = lhr.audits['is-crawlable']
  if (!audit) {
    failures.push(`no is-crawlable audit in the report for ${lhr.requestedUrl}`)
    continue
  }

  let host
  try {
    host = new URL(lhr.requestedUrl).hostname
  } catch {
    failures.push(`could not parse the audited URL: ${lhr.requestedUrl}`)
    continue
  }

  const isPreview = host.endsWith('.vercel.app')
  const isProduction = PRODUCTION_HOSTS.has(host)

  if (isPreview) {
    checked++
    // The preview MUST be blocked from indexing. A score of 1 here means the
    // preview is inviting search engines again: the exact defect fixed on
    // 15 August 2026, returning.
    if (audit.score !== 0) {
      failures.push(
        `PREVIEW IS INDEXABLE AGAIN: ${lhr.requestedUrl}\n` +
          `        is-crawlable scored ${audit.score}, meaning this preview is NOT blocked from indexing.\n` +
          '        next.config.ts must send x-robots-tag: noindex, nofollow on every non-production\n' +
          '        deployment. A crawlable preview publishes a second copy of the catalogue on a\n' +
          '        different hostname and competes with production in search.',
      )
    }
  } else if (isProduction) {
    checked++
    // Production MUST be crawlable. This is the half the old category floor
    // was actually trying to express, and it belongs here.
    if (audit.score !== 1) {
      failures.push(
        `PRODUCTION IS BLOCKED FROM INDEXING: ${lhr.requestedUrl}\n` +
          `        is-crawlable scored ${audit.score}. SEO is one of the two compounding growth\n` +
          '        engines; a noindexed production page earns nothing.',
      )
    }
  } else {
    skipped++
    notes.push(`${host} is neither a *.vercel.app preview nor the canonical host, so indexability was not asserted for ${lhr.requestedUrl}`)
  }
}

/* ------------------------------------------------------------------ report */

/*
 * Each line reports the state it actually found. A summary that says "matches
 * the baseline" while the failure block below says the set changed is the exact
 * shape of reassuring output this repository keeps having to delete.
 */
console.log(`[seo-audits] ${reports.length} report(s) from ${dir}`)
console.log(
  auditSetOk
    ? `[seo-audits] audit set matches the reviewed ${SEO_AUDIT_BASELINE.length}-audit baseline for Lighthouse 12.1.0`
    : `[seo-audits] audit set DOES NOT match the reviewed ${SEO_AUDIT_BASELINE.length}-audit baseline (see below)`,
)
console.log(
  uncovered.length === 0
    ? `[seo-audits] lighthouserc.json asserts all ${MUST_BE_ASSERTED.length} per-audit SEO floors at error level`
    : `[seo-audits] lighthouserc.json asserts ${MUST_BE_ASSERTED.length - uncovered.length} of ${MUST_BE_ASSERTED.length} per-audit SEO floors (see below)`,
)
for (const [id, why] of Object.entries(NOT_ASSERTED)) {
  console.log(`[seo-audits]   excluded: ${id.padEnd(16)} ${why}`)
}
console.log(`[seo-audits] indexability asserted on ${checked} report(s), skipped on ${skipped}`)
for (const n of notes) console.log(`[seo-audits]   note: ${n}`)

if (failures.length) {
  console.error('')
  console.error('[seo-audits] FAILED')
  console.error('')
  for (const f of failures) console.error(`  - ${f}`)
  console.error('')
  process.exit(1)
}

declareWork('seo-audits', {
  did: {
    'Lighthouse report read': reports.length,
    'per-audit SEO floor checked': MUST_BE_ASSERTED.length,
    'report checked for indexability': checked,
  },
  found: { failure: failures.length },
})
console.log('[seo-audits] PASS')
