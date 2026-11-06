/**
 * TURN A SESSION'S RAW DRIVEN OUTPUT INTO THE COMPACT EVIDENCE THE REPORT CITES.
 *
 * Close-out L5 asks the launch readiness report for "the evidence path" on every
 * row. A path into C:\dev\EVIDENCE is a path on one laptop: it cannot be read
 * from a clone, it cannot be checked by CI, and it disappears the day that tree
 * is cleared. So each PASS row rests on a small artefact committed here, and
 * scripts/guards/launch-readiness-honest.mjs fails when a PASS row cites one that
 * is not on disk.
 *
 * COMPACT ON PURPOSE. The raw output of a route sweep is 80KB of every request
 * and the raw output of an axe run is one JSON report per URL per viewport. None
 * of that belongs in the repository. What belongs is the claim and the numbers
 * behind it: what was driven, against what, when, and with what result.
 *
 * Inputs are the session evidence tree; outputs are docs/verification/launch-readiness/.
 *
 * Usage:
 *   node scripts/verify/launch-readiness-evidence.mjs --from C:/dev/EVIDENCE/L5
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const argOf = (n) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : undefined
}

const FROM = argOf('--from') ?? 'C:/dev/EVIDENCE/L5'
const OUT = 'docs/verification/launch-readiness'
const DATE = argOf('--date') ?? '2026-09-09'
const TAG = '[launch-readiness-evidence]'

mkdirSync(OUT, { recursive: true })

const read = (name) => {
  const p = join(FROM, name)
  if (!existsSync(p)) throw new Error(`${p} is not there. Drive it before distilling it.`)
  return readFileSync(p, 'utf8')
}
const write = (name, value) => {
  const p = join(OUT, name)
  writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`)
  console.log(`${TAG} wrote ${p}`)
}

// ---------------------------------------------------------------------------
// L1 item 14. The route sweep.
// ---------------------------------------------------------------------------
{
  const sweep = JSON.parse(read('route-sweep.json'))
  write(`route-sweep-${DATE}.json`, {
    l1Item: 14,
    requirement:
      'Every route enumerated from src/app returns its expected status on production. Zero unexpected 404s. Zero 500s anywhere.',
    producedBy: 'scripts/verify/production-route-sweep.mjs',
    base: sweep.base,
    driven: sweep.driven,
    requests: sweep.results.length,
    byStatus: sweep.byStatus,
    defects: sweep.defects,
    routesEnumerated: Object.fromEntries(
      Object.entries(sweep.routes).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]),
    ),
    publicPatternsWithNoAnonymousValue: (sweep.unresolved ?? []).length,
    verdict: sweep.defects.length === 0 ? 'PASS' : 'FAIL',
  })
}

// ---------------------------------------------------------------------------
// L1 item 16. axe-core on every public surface.
//
// Derived from the run LOG rather than from the per-scan reports, and it says so
// rather than implying the reports are still there: they are session artefacts
// and were deleted after they were read, per the standing disk rule. The log
// carries one line per scan with its status, viewport and violation count, plus
// the harness's own totals line, which is the same claim in the same run.
// ---------------------------------------------------------------------------
{
  const log = read('axe.txt')
  const rows = []
  for (const line of log.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d{3})\s+(\d+)\s+violations=(\d+)\s+(\S.*)$/)
    if (m) rows.push({ status: Number(m[1]), viewport: Number(m[2]), violations: Number(m[3]), url: m[4].trim() })
  }
  /*
   * ONE RUN OR SEVERAL PARTS (7 November 2026: 82 URLs were scanned in three parts, each a full axe-urls run with its
   * own totals line). Every totals line is summed and every part must have finished; an answer that is not an HTML
   * document (axe-urls' 'not a page') is counted apart, as the harness counts it.
   */
  const parts = [...log.matchAll(/axe-urls: (\d+) scans across (\d+) URL\(s\) and (\d+) viewports, (\d+) violation\(s\), (\d+) non-200 load\(s\)(?:, (\d+) answer\(s\) not a page)?/g)]
  if (parts.length === 0) throw new Error('the axe run log carries no totals line, so the run did not finish')
  const sum = (i) => parts.reduce((n, m) => n + Number(m[i] ?? 0), 0)
  const totals = [null, sum(1), sum(2), parts[0][3], sum(4), sum(5), sum(6)]
  if (rows.length !== Number(totals[1])) {
    throw new Error(`the log has ${rows.length} scan lines and claims ${totals[1]} scans`)
  }
  const notPages = [...new Set([...log.matchAll(/not a page \(([^)]+)\), not scanned\s+(\S+)/g)].map((m) => `${m[2]} (${m[1]})`))]
  write(`axe-${DATE}.json`, {
    l1Item: 16,
    requirement: 'axe-core zero on every public surface.',
    producedBy: 'scripts/verify/axe-urls.mjs',
    derivedFrom: 'the run log; the per-scan JSON reports are session artefacts and were deleted after they were read',
    base: 'https://www.eventlinqs.com.au',
    driven: DATE,
    scans: Number(totals[1]),
    urls: Number(totals[2]),
    viewports: [390, 1440],
    violations: Number(totals[4]),
    nonOkLoads: Number(totals[5]),
    urlsWithViolations: [...new Set(rows.filter((r) => r.violations > 0).map((r) => r.url))],
    answersNotAPage: notPages,
    urlsScanned: [...new Set(rows.map((r) => r.url))].sort(),
    verdict: Number(totals[4]) === 0 && Number(totals[5]) === 0 ? 'PASS' : 'FAIL',
  })
}

// ---------------------------------------------------------------------------
// L1 items 4 and 8. The anonymous drive.
// ---------------------------------------------------------------------------
{
  const drive = JSON.parse(read('l1-drive.json'))
  const e = drive.item4.enumeration
  const viewports = ['390', '768', '1440']

  write(`appearance-${DATE}.json`, {
    l1Item: 4,
    requirement:
      'The event appears on /events/[slug], on browse, on its city page, and on any community it belongs to.',
    producedBy: 'scripts/verify/launch-readiness-drive.mjs',
    base: drive.base,
    driven: drive.driven,
    eventPath: e.eventPath,
    howTheEventWasChosen: 'the first /events/<slug> in the platform\'s own sitemap.xml whose page\'s Event data has not ended',
    howEachSurfaceWasRead:
      'in a browser at 390, as a visitor: All dates pressed and every Show more pressed (law 16), then the event\'s own link looked for',
    citiesPublished: e.citiesPublished,
    communitiesPublished: e.communitiesPublished,
    listedOn: { city: e.citiesListing, browse: e.browseListing, community: e.communitiesListing },
    renderedInBrowser: Object.fromEntries(
      viewports.map((v) => [v, { eventStatus: drive.item4[v].eventStatus, h1: drive.item4[v].title, surfaces: drive.item4[v].surfaces }]),
    ),
    verdict: drive.faults.length === 0 ? 'PASS' : 'FAIL',
  })

  write(`discovery-${DATE}.json`, {
    l1Item: 8,
    requirement: 'Find the event from the homepage without knowing the URL.',
    producedBy: 'scripts/verify/launch-readiness-drive.mjs',
    base: drive.base,
    driven: drive.driven,
    method:
      'the event under test, not any event, reached two ways from the homepage with no URL typed: by clicks only (the homepage\'s link to the guide that lists it, All dates, every Show more, its card), and by its name (the homepage search, its title typed, Enter, its card in the results); each ends on its own page with its own h1.',
    perViewport: Object.fromEntries(viewports.map((v) => [v, drive.item8[v]])),
    verdict: drive.faults.length === 0 ? 'PASS' : 'FAIL',
  })
}

console.log(`${TAG} done`)
