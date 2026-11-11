/**
 * SOURCE READS ARE POLITE (law 14 (k) of C:\dev\CLAUDE.md: "every read of an event source page, by any window for any
 * purpose, goes through the page reader's polite fetch: robots.txt first, one request a second per host, a stop at the
 * first 403 or 429, a named user agent; never an ad hoc curl or fetch of a source").
 *
 * WHY. scripts/ops/outreach-basis.mjs read organisers' own pages four at a time with no robots.txt and no spacing until
 * 11 November 2026 (found during PM order 3; it predates the law). One defect is a class (Lawal's directive 4), so this
 * fails the build for any script that reads a source or organiser page outside a polite reader.
 *
 * WHAT IS JUDGED. Every script under scripts/ whose code (comments stripped) does both:
 *   - calls fetch with an address that is not an API or our own site (a bare variable such as `url`, `page` or `u`, or
 *     a literal to another host); and
 *   - names a source or organiser page field (website_url, found_on, booking_url, source_url, published_on_url,
 *     booking_links, listing_sources);
 * must read through robots handling: scripts/lib/polite-read.mjs (politeReader), the platform's own
 * src/lib/listings/collect.ts (robotsVerdict), or a robots.txt read of its own. It prints every script it judged.
 *
 * WHAT IT CANNOT SEE. Whether that robots handling is wired to every fetch in the file, or keeps the one a second
 * spacing: those are proved by each reader's own tests (tests/unit/ops/polite-read.test.ts for the shared one).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const TAG = '[source-reads-are-polite]'
const ROOT = process.cwd()
const SCRIPTS = join(ROOT, 'scripts')

const SOURCE_FIELDS = /\b(website_url|found_on|booking_url|source_url|published_on_url|booking_links|listing_sources)\b/
// runCollection: a fetcher handed to the platform's own collection run is read through robots.txt there
// (src/lib/listings/collect-run.ts reads each origin's robots.txt with robotsVerdict before any page).
// A CALL, never a mention: an import that is never used reads nothing politely.
const POLITE = /\b(politeReader|robotsVerdict|robotsAllows?|runCollection)\s*\(|\/robots\.txt/
/** An address that is an API we call with a key, or our own site: not a source page. */
const NOT_A_SOURCE = /api\.supabase\.com|\.supabase\.co\b|api\.github\.com|api\.vercel\.com|vercel\.com\/api|api\.resend\.com|api\.stripe\.com|api\.anthropic\.com|googleapis\.com|api\.indexnow\.org|localhost|127\.0\.0\.1|eventlinqs\.com\.au|\$\{\s*(BASE|base|SITE|site|ORIGIN|origin|baseUrl|BASE_URL|siteUrl|SITE_URL|preview|PREVIEW|target|TARGET|host|HOST)\b/

export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
}

/** The first argument of every fetch call, as written. Pure. */
export function fetchTargets(code) {
  return [...code.matchAll(/\bfetch\(\s*([^,)\n]+)/g)].map((m) => m[1].trim())
}

/** Whether a fetch target reads a page that is not an API or our own site. Pure. */
export function readsAPage(target) {
  return !NOT_A_SOURCE.test(target)
}

/** The judgement on one script's text: null when it passes or is out of scope, else why it fails. Pure. */
export function judge(text) {
  const code = stripComments(text)
  const pageReads = fetchTargets(code).filter(readsAPage)
  if (pageReads.length === 0 || !SOURCE_FIELDS.test(code)) return null
  if (POLITE.test(code)) return null
  return `reads ${pageReads.length} page address(es) (${pageReads.slice(0, 3).join(', ')}) and names a source field, with no robots handling`
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(mjs|mts|js|ts)$/.test(entry)) out.push(full)
  }
  return out
}

function main() {
  const problems = []
  const judged = []
  for (const full of walk(SCRIPTS)) {
    const rel = relative(ROOT, full).replace(/\\/g, '/')
    if (rel === 'scripts/guards/source-reads-are-polite.mjs') continue
    const text = readFileSync(full, 'utf8')
    const code = stripComments(text)
    if (fetchTargets(code).filter(readsAPage).length > 0 && SOURCE_FIELDS.test(code)) judged.push(rel)
    const why = judge(text)
    if (why) problems.push(`${rel}: ${why}`)
  }
  console.log(`${TAG} ${judged.length} script(s) read pages and name a source field, printed every run on purpose:`)
  for (const rel of judged) console.log(`${TAG}   ${rel}`)
  if (problems.length) {
    console.error(`\n${TAG} FAIL - ${problems.length} script(s) read a source or organiser page outside a polite reader (law 14 (k)):`)
    for (const p of problems) console.error(`  ${p}`)
    console.error(`\nRead pages through scripts/lib/polite-read.mjs (politeReader) or src/lib/listings/collect.ts (robotsVerdict).`)
    process.exit(1)
  }
  console.log(`${TAG} PASS - every script that reads a source or organiser page reads it through robots handling.`)
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/guards/source-reads-are-polite.mjs')) main()
