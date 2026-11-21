/**
 * A TEST ACCOUNT IS NEVER A FIGURE, A LISTING OR A NOTICE (the PM's 13:22 of 21 November 2026, on Lawal's 13:20: "I can
 * see one organizer today ... It's unclickable ... I cannot see the organizer"). The one new organiser the admin counted
 * that day was WINDOW 5C's QA organiser, unmarked, and the count opened nothing. Migration 20261121140001 marks a test
 * account in the database (organisations, organisers, events and orders carry is_test, set from the address); this holds
 * every reader to the mark.
 *
 * The clauses, read from the source (comments out):
 *   1. Every count (a select carrying count:) of organisations, organisers, events or orders under src/app/admin and
 *      src/lib/admin names is_test in its own chain, unless it is pinned to one record (an .eq on id, user_id,
 *      organisation_id, organiser_id, event_id, order_id or created_by), which is that record's own figure.
 *   2. Every events read in the sitemap (src/lib/seo/sitemap-catalogue.ts), the city guide (src/lib/events/guide-queries.ts)
 *      and the weekly guide (src/lib/newsletter/edition.ts) names is_test in its own chain.
 *   3. Every figure on the admin home (src/app/admin/(authed)/page.tsx) opens the list behind it: each <AdminStatTile
 *      sits inside a link (TileLink or Link) within the three lines before it.
 *   4. The newest migration that defines record_platform_notification, the one function every notice to the owner goes
 *      through, returns before recording anything about a TEST organisation, event or order (it names is_test).
 *
 * A root may be passed as the first argument, so the drill can run it against a tree holding an unmarked count.
 * Exits 1 naming each clause that fails.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { selectChainsIn } from './lib/supabase-select-chains.mjs'
import { sourceFiles } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[test-accounts-left-out]'
const ROOT = process.argv[2] ?? process.cwd()
const FAILURES = []
const fail = (clause, message) => FAILURES.push(`${clause}: ${message}`)
const MARKED = new Set(['organisations', 'organisers', 'events', 'orders'])
const PINNED = /\.eq\(\s*'(id|user_id|organisation_id|organiser_id|event_id|order_id|created_by)'\s*,/

// 1. Admin counts.
const adminFiles = sourceFiles(ROOT).filter((f) => f.startsWith('src/app/admin/') || f.startsWith('src/lib/admin/'))
let counts = 0
for (const file of adminFiles) {
  for (const chain of selectChainsIn(join(ROOT, file))) {
    if (!MARKED.has(chain.table)) continue
    const text = chain.fullText ?? chain.text
    if (!/count\s*:/.test(text)) continue
    counts += 1
    if (/is_test/.test(text) || PINNED.test(text)) continue
    fail('1', `${file}:${chain.line} counts ${chain.table} with no is_test in its chain, so a test account would be counted as real. Add .eq('is_test', false).`)
  }
}

// 2. The sitemap and the guides.
const PUBLIC_READERS = ['src/lib/seo/sitemap-catalogue.ts', 'src/lib/events/guide-queries.ts', 'src/lib/newsletter/edition.ts']
let publicReads = 0
for (const file of PUBLIC_READERS) {
  if (!existsSync(join(ROOT, file))) {
    fail('2', `${file} is gone; name the file that now reads the events for it`)
    continue
  }
  for (const chain of selectChainsIn(join(ROOT, file))) {
    if (chain.table !== 'events') continue
    publicReads += 1
    const text = chain.fullText ?? chain.text
    if (!/is_test/.test(text)) fail('2', `${file}:${chain.line} reads events with no is_test in its chain, so a test night could be listed. Add .eq('is_test', false).`)
  }
}

// 3. The admin home's figures open their lists.
const HOME = 'src/app/admin/(authed)/page.tsx'
let tiles = 0
if (existsSync(join(ROOT, HOME))) {
  const lines = readFileSync(join(ROOT, HOME), 'utf8').split(/\r?\n/)
  lines.forEach((l, i) => {
    // A loading skeleton shows no figure.
    if (!/<AdminStatTile\b/.test(l) || /animate-pulse/.test(l)) return
    tiles += 1
    const before = lines.slice(Math.max(0, i - 3), i + 1).join('\n')
    if (!/<TileLink\b|<Link\b/.test(before)) fail('3', `${HOME}:${i + 1} shows a figure that opens nothing; wrap it in <TileLink href=...> to the list behind it`)
  })
} else fail('3', `${HOME} is gone`)

// 4. The owner's notices.
const migrations = readdirSync(join(ROOT, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort()
const definers = migrations.filter((f) => /create\s+or\s+replace\s+function\s+public\.record_platform_notification\s*\(/i.test(readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8')))
const newest = definers.at(-1)
if (!newest) fail('4', 'no migration defines record_platform_notification')
else {
  const sql = readFileSync(join(ROOT, 'supabase', 'migrations', newest), 'utf8')
  const body = sql.slice(sql.search(/create\s+or\s+replace\s+function\s+public\.record_platform_notification\s*\(/i))
  const end = body.indexOf('$function$', body.indexOf('$function$') + 1)
  if (!/is_test/.test(body.slice(0, end > 0 ? end : body.length))) fail('4', `${newest}: record_platform_notification records a TEST account's business for the owner; it must return first when the organisation, event or order is_test`)
}

console.log(`${TAG} did ${adminFiles.length} admin file(s) read, ${counts} count(s) judged, ${publicReads} public events read(s) judged, ${tiles} home figure(s) judged, ${definers.length} notice definition(s) found`)
declareWork('test-accounts-left-out', {
  did: { 'admin file read': adminFiles.length, 'count judged': counts, 'public read judged': publicReads, 'home figure judged': tiles },
  found: { 'clause failed': FAILURES.length },
})
if (FAILURES.length) {
  console.error(`${TAG} FAILED`)
  for (const f of FAILURES) console.error(`  clause ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - every admin count, guide and sitemap read, and every owner notice leaves a TEST account out`)
