/**
 * A PRERENDERED PAGE ASKS FOR THE KEY BEFORE IT READS AS ADMIN (WINDOW 5A, 21 November 2026). #331's CI build failed:
 * 'Error occurred prerendering page "/weekend"' and 'Error: supabaseKey is required.' The CI build carries only
 * NEXT_PUBLIC values, and /weekend made an admin client while it prerendered; this laptop's builds carry .env.local's
 * key, so no local step could see it. The same error stopped car 35 on 2 November 2026 (/city/gold-coast). The rule the
 * pages that already pass hold (src/lib/events/featured-with-recorded-rights.ts): ask getSupabaseServiceRoleKey() first
 * and render the empty state without it.
 *
 * The clause, read from each page's source (comments out): a page under src/app that can prerender, which is one whose
 * path has no dynamic segment, or one that exports generateStaticParams, and which is not forced dynamic and does not
 * read searchParams, cookies or the session client, may not call createAdminClient( unless the same file asks getSupabaseServiceRoleKey( or
 * previewReadOnlyOn( first. A read done through a helper that asks for the key itself is the helper's to hold.
 *
 * A root may be passed as the first argument, so the drill can run it against a tree holding the old /weekend.
 * Exits 1 naming each page that fails.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[a-prerendered-page-asks-for-the-key]'
const ROOT = process.argv[2] ?? process.cwd()
const FAILURES = []
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

function files(path) {
  if (!existsSync(path)) return []
  if (statSync(path).isFile()) return [path]
  return readdirSync(path).flatMap((e) => files(join(path, e)))
}

const rel = (f) => relative(ROOT, f).split(sep).join('/')
const pages = files(join(ROOT, 'src', 'app')).filter((f) => /[\\/]page\.tsx$/.test(f))
let canPrerender = 0
let adminReads = 0
for (const file of pages) {
  const path = rel(file)
  const src = code(readFileSync(file, 'utf8'))
  const dynamicPath = /\[[^\]]+\]/.test(path.replace(/\/page\.tsx$/, ''))
  const staticParams = /export\s+(async\s+)?function\s+generateStaticParams|export\s+const\s+generateStaticParams/.test(src)
  const forcedDynamic = /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/.test(src)
  // The session client (src/lib/supabase/server.ts) reads cookies(), so a page that uses it renders per request.
  const readsRequest = /\bsearchParams\b|\bcookies\(\)|\bheaders\(\)/.test(src) || src.includes("from '@/lib/supabase/server'")
  if (forcedDynamic || readsRequest || (dynamicPath && !staticParams)) continue
  canPrerender += 1
  const at = src.indexOf('createAdminClient(')
  if (at < 0) continue
  adminReads += 1
  const asks = [src.indexOf('getSupabaseServiceRoleKey('), src.indexOf('previewReadOnlyOn(')].filter((i) => i >= 0)
  if (asks.length === 0) FAILURES.push(`${path} makes an admin client while it can prerender, and never asks getSupabaseServiceRoleKey() first`)
}

console.log(`${TAG} did ${pages.length} page(s) read, ${canPrerender} that can prerender judged, ${adminReads} admin read(s) among them`)
declareWork('a-prerendered-page-asks-for-the-key', {
  did: { 'page read': pages.length, 'prerenderable page judged': canPrerender, 'admin read judged': adminReads },
  found: { 'page failed': FAILURES.length },
})
if (FAILURES.length) {
  console.error(`${TAG} FAILED`)
  for (const f of FAILURES) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - every page that can prerender asks for the key before it reads as admin`)
