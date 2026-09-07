/**
 * THE COMMUNITY LAYER AND THE CATEGORIES CANNOT BE LOST SILENTLY (close-out C18 FINAL,
 * 7 September 2026).
 *
 * The owner ruled the community layer an approved, deliberate feature: all 21
 * community pages, their 20 city variants each, the faith route and every event
 * category the platform carries stay, and the scope was amended to record them
 * (docs/EventLinqs_Scope_v5-Addendum-A-Community-Layer.md). The approved lists
 * live, machine readable, in docs/scope/community-layer-approved.json. This
 * guard fails the build when the platform and that record diverge in EITHER
 * direction, because its purpose is to protect what exists, not to police it
 * into a shorter list:
 *
 *   1. COMMUNITIES. Every approved slug must be in src/lib/communities/data.ts
 *      (getAllCommunities, the list every live surface reads: the pages, the
 *      city variants, the organiser form's tagging, search, the sitemap, the
 *      footer); the count may not drop; and every slug in the source must be
 *      recorded in the approved file, so an addition is recorded rather than
 *      silent. The city matrix is checked the same way against getAllCities.
 *   2. FAITHS. Every approved faith page must be in getAllFaiths and every
 *      filter-only faith in SMALLER_FAITHS, and the reverse.
 *   3. CATEGORIES. public.event_categories on the database this build runs
 *      against must carry every approved slug (nothing present today may
 *      disappear) and every Scope v5 line 351 category must map to a slug the
 *      database has (nothing the scope requires may be absent); a database slug
 *      not in the approved file must be recorded, not removed.
 *   4. THE ROUTES AND THE SITEMAP still publish the layer: the community, the
 *      community-by-city and the faith pages exist under src/app and sitemap.ts
 *      reads getAllCommunities and getAllFaiths.
 *
 * Drilled both ways in scripts/verify/guard-failure-drills.mjs: a faith slug
 * changed in the source (an approved page lost), and an approved community
 * removed from the record (an addition left unrecorded).
 *
 * Where the build has no real database, the category half (3) is SKIPPED by
 * name rather than failed: CI's typecheck build runs on a placeholder project
 * URL, and a guard that can never pass there is a wall, not a lock (the rule
 * event-lifecycle-installed follows). Every Vercel build and every local gate
 * carry the real project, and there the half is judged and a failed read FAILS.
 * Learned on 7 September 2026, when the first CI run of PR 136 failed here.
 *
 * The approved record lives under docs/, which .vercelignore excludes, so it is
 * re-included there level by level (!docs/scope/, docs/scope/*, then the file)
 * and vercelignore-covers-guard-reads.mjs fails the build if that is ever lost.
 * Learned the same day, when the preview build of PR 136 died with ENOENT on it.
 *
 * Run: node scripts/guards/community-layer-protected.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const TAG = '[community-layer-protected]'
const APPROVED = 'docs/scope/community-layer-approved.json'
const faults = []
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

// The same courtesy as schema-ahead-of-code: a local run without the variables
// reads the checked-in test env, so "nothing to check" is never mistaken for "checked".
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync('.env.test')) {
  for (const line of readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

const approved = JSON.parse(readFileSync(join(ROOT, APPROVED), 'utf8'))
const approvedCommunities = approved.communities.map((c) => c.slug)
const approvedCities = approved.communityCityMatrix.cities
const approvedFaithPages = approved.faiths.pages.map((f) => f.slug)
const approvedFaithFilters = approved.faiths.filterOnly.map((f) => f.slug)
const approvedCategories = approved.categories.rows.map((c) => c.slug)
const scopeMap = new Map(approved.categories.rows.filter((c) => c.inScopeV5).map((c) => [c.inScopeV5, c.slug]))

// 1, 2 and 4a: the source lists, loaded through the alias loader in a child.
const script = [
  "import { getAllCommunities } from '@/lib/communities/data'",
  "import { getAllCities } from '@/lib/cities/data'",
  "import { getAllFaiths, SMALLER_FAITHS } from '@/lib/faiths/data'",
  'console.log(JSON.stringify({',
  '  communities: getAllCommunities().map((c) => c.slug),',
  '  cities: getAllCities().map((c) => c.slug),',
  '  faithPages: getAllFaiths().map((f) => f.slug),',
  '  faithFilters: SMALLER_FAITHS.map((f) => f.slug),',
  '}))',
  '',
].join('\n')
const r = spawnSync(
  process.execPath,
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/src-alias-loader.mjs', '--input-type=module', '-e', script],
  { cwd: ROOT, encoding: 'utf8' },
)
let source = null
if (r.status !== 0) fail(`could not load the community, city and faith lists through the alias loader: ${(r.stderr || r.stdout).trim().slice(0, 300)}`)
else {
  const line = r.stdout.trim().split('\n').find((l) => l.startsWith('{'))
  if (!line) fail(`the source lists printed nothing: ${r.stdout.slice(0, 200)}`)
  else source = JSON.parse(line)
}

const compare = (what, sourceList, approvedList, where) => {
  for (const slug of approvedList) {
    if (!sourceList.includes(slug)) fail(`${what}: the approved ${slug} is missing from ${where}; a live surface has been lost`)
  }
  for (const slug of sourceList) {
    if (!approvedList.includes(slug)) fail(`${what}: ${slug} is in ${where} but not recorded in ${APPROVED}; record the addition there (nothing is removed)`)
  }
  if (sourceList.length < approvedList.length) fail(`${what}: the count dropped to ${sourceList.length} from the approved ${approvedList.length}`)
}
if (source) {
  compare('communities', source.communities, approvedCommunities, 'src/lib/communities/data.ts')
  compare('community-city matrix cities', source.cities, approvedCities, 'src/lib/cities/data.ts')
  compare('faith pages', source.faithPages, approvedFaithPages, 'src/lib/faiths/data.ts getAllFaiths')
  compare('filter-only faiths', source.faithFilters, approvedFaithFilters, 'src/lib/faiths/data.ts SMALLER_FAITHS')
  if (!same([...source.communities].sort(), [...approvedCommunities].sort())) {
    // Already reported slug by slug above; this line names the shape for the reader.
    console.error(`${TAG}       source ${source.communities.length} communities, approved ${approvedCommunities.length}`)
  }
}

// 3. The database this build runs against. No real project (CI's placeholder URL)
//    is a named SKIP of this half, never a FAIL and never a silent pass.
const REAL_PROJECT = new RegExp('^https://[a-z0-9]{20,}[.]supabase[.]co$')
const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const url = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
let dbCategories = null
let categorySkip = null
if (!REAL_PROJECT.test(url)) {
  categorySkip = `no real Supabase project URL in this build (${url.length} characters; CI's typecheck build uses a placeholder), so the category half is not judged here. Every Vercel build and every local gate carry the real project and judge it`
} else if (!key) {
  categorySkip = 'a real project URL but no key to read event_categories with (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)'
} else {
  try {
    const res = await fetch(`${url}/rest/v1/event_categories?select=slug,name,is_active&order=slug`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    if (!res.ok) fail(`event_categories could not be read from ${url.slice(8, 28)}: HTTP ${res.status}`)
    else dbCategories = await res.json()
  } catch (error) {
    fail(`event_categories could not be read: ${error instanceof Error ? error.message : String(error)}`)
  }
}
if (dbCategories) {
  const dbSlugs = dbCategories.map((c) => c.slug)
  for (const slug of approvedCategories) {
    if (!dbSlugs.includes(slug)) fail(`categories: the approved ${slug} is missing from public.event_categories on this database; a category present on 7 September 2026 has disappeared`)
  }
  for (const slug of dbSlugs) {
    if (!approvedCategories.includes(slug)) fail(`categories: ${slug} is in public.event_categories but not recorded in ${APPROVED}; record the addition there (nothing is removed)`)
  }
  for (const name of approved.categories.scopeV5Line351) {
    const slug = scopeMap.get(name)
    if (!slug) fail(`categories: the Scope v5 category "${name}" maps to no slug in ${APPROVED}`)
    else if (!dbSlugs.includes(slug)) fail(`categories: the Scope v5 category "${name}" maps to ${slug}, which public.event_categories does not have; a category the scope requires is absent`)
  }
  console.log(`${TAG} ${dbSlugs.length} categories on ${url.slice(8, 28)}, ${approved.categories.scopeV5Line351.length} scope categories mapped`)
}
if (categorySkip) console.log(`${TAG} SKIP (categories) - ${categorySkip}`)

// 4. The routes and the sitemap.
for (const route of ['src/app/community/[community]/page.tsx', 'src/app/community/[community]/[city]/page.tsx', 'src/app/faith/[faith]/page.tsx', 'src/app/communities/page.tsx']) {
  if (!existsSync(join(ROOT, route))) fail(`the route ${route} is gone`)
}
const sitemap = readFileSync(join(ROOT, 'src/app/sitemap.ts'), 'utf8')
if (!sitemap.includes('getAllCommunities()')) fail('src/app/sitemap.ts no longer publishes the community pages from getAllCommunities()')
if (!sitemap.includes('getAllFaiths()')) fail('src/app/sitemap.ts no longer publishes the faith pages from getAllFaiths()')

declareWork('community-layer-protected', {
  did: { 'approved community read': approvedCommunities.length, 'approved faith read': approvedFaithPages.length + approvedFaithFilters.length, 'approved category read': approvedCategories.length, 'database category read': dbCategories ? dbCategories.length : 0 },
  found: { 'taxonomy fault': faults.length },
  zeroIsFine: { 'database category read': 'no real project URL or no key in this build; the SKIP line above names which' },
})

if (faults.length > 0) {
  console.error(`${TAG} ${faults.length} fault(s). The community layer and the categories are approved; nothing may be lost, and every addition is recorded in ${APPROVED}.`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${approvedCommunities.length} communities x ${approvedCities.length} cities, ${approvedFaithPages.length} faith pages and ${approvedFaithFilters.length} filter-only faiths, ${approvedCategories.length} categories with all ${approved.categories.scopeV5Line351.length} scope categories present; routes and sitemap intact.`)
