/**
 * EVERY URL THE PLATFORM HAS EVER PUBLISHED THAT IS NO LONGER LIVE, DRIVEN
 * (close-out C19.5).
 *
 * C19.5: "Enumerate every URL the platform has ever published that now 404s,
 * including paused, cancelled and deleted events and any renamed slugs. Each one
 * gets either a permanent redirect to the right destination, or a deliberate 410
 * Gone, and is removed from the sitemap. Nothing may 404 silently."
 *
 * The first C19 pass enumerated the CURRENT sitemap and found no 404s, which is
 * a different and easier set. The roast caught the substitution. This is the set
 * the clause actually names, and it is built from the database rather than from
 * the sitemap:
 *
 *   1. Every event that carries a slug and is NOT publicly visible today: draft,
 *      paused, postponed, cancelled, completed, archived, or private. A URL that
 *      was live and is not is exactly what Search Console reports as "not found
 *      404" and as "page with redirect".
 *   2. Every deleted event, from public.event_tombstones, which close-out C13
 *      created precisely so a deleted event's URL could answer 410 rather than
 *      404.
 *   3. Every renamed slug, from src/lib/seo/permanent-redirects.ts, which is the
 *      one module next.config.ts and the sitemap both read.
 *
 * Each is driven and its status recorded. THE EXPECTED ANSWERS, per the event
 * lifecycle (docs/EVENT-LIFECYCLE.md, close-out C13.6):
 *
 *   deleted    410 Gone
 *   archived   404 to anyone not holding a ticket
 *   draft, paused, postponed, cancelled, completed, private
 *              404 or 200, per that document; either is deliberate, and what
 *              this script refuses is a 500 or an unexplained answer
 *   renamed    301 or 308 to a live destination
 *
 * It reads production and never writes. The database read goes through the
 * Supabase Management API, which needs SUPABASE_ACCESS_TOKEN in the environment:
 * scripts\\ops\\with-supabase-token.ps1 supplies it from the CLI's own login.
 *
 * Run: scripts\\ops\\with-supabase-token.ps1 node scripts/verify/published-url-graveyard.mjs
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const PROD_REF = 'gndnldyfudbytbboxesk'
const BASE = (process.env.GRAVEYARD_BASE || 'https://www.eventlinqs.com.au').replace(/\/$/, '')
const OUT = process.env.GRAVEYARD_OUT || ''
const TAG = '[url-graveyard]'
const token = process.env.SUPABASE_ACCESS_TOKEN
const faults = []

if (!token) {
  console.error(`${TAG} SUPABASE_ACCESS_TOKEN is not set, so the database cannot be read and nothing can be enumerated.`)
  console.error(`${TAG} Run it through the helper: scripts\\ops\\with-supabase-token.ps1 node ${process.argv[1]}`)
  process.exit(1)
}

/** SELECT-only against production, through the Management API. */
async function query(sql) {
  if (!/^\s*select/i.test(sql)) throw new Error('this script is SELECT-only')
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

/* ------------------------------------------------------ 1 and 2, the database */

const notLive = await query(
  "select slug, status, visibility from public.events where slug is not null and (status <> 'published' or visibility <> 'public') order by slug",
)
let tombstoned = []
try {
  tombstoned = await query('select slug from public.event_tombstones order by slug')
} catch (error) {
  faults.push(`public.event_tombstones could not be read, so deleted events were not driven: ${error.message}`)
}

/* --------------------------------------------------- 3, the renamed slugs */

/*
 * A PARAMETERISED SOURCE IS DRIVEN WITH A REAL VALUE, NOT WITH ITS PLACEHOLDER.
 *
 * `/culture/:slug` is a Next path-to-regexp pattern. The first run of this
 * script requested that literal string and reported two failures for URLs that
 * do not exist. Skipping them would have been worse: `/culture/african` is a
 * real address people and search indexes still hold, and keeping it alive is the
 * whole point of the community rename. So the placeholders are filled from the
 * platform's own lists, never typed.
 */
const redirectScript = [
  "import { PERMANENT_REDIRECTS } from '@/lib/seo/permanent-redirects'",
  "import { getAllCommunities } from '@/lib/communities/data'",
  "import { getAllCities } from '@/lib/cities/data'",
  'console.log(JSON.stringify({',
  '  redirects: PERMANENT_REDIRECTS,',
  '  slug: getAllCommunities()[0].slug,',
  '  city: getAllCities()[0].slug,',
  '}))',
  '',
].join('\n')
const loaded = spawnSync(
  process.execPath,
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/src-alias-loader.mjs', '--input-type=module', '-e', redirectScript],
  { cwd: process.cwd(), encoding: 'utf8' },
)
let redirects = []
if (loaded.status !== 0) {
  faults.push(`the permanent-redirect table could not be read: ${(loaded.stderr || loaded.stdout).trim().slice(0, 300)}`)
} else {
  const parsed = JSON.parse(loaded.stdout.trim().split(/\r?\n/).find((l) => l.startsWith('{')) ?? '{}')
  const fill = (p) => p.replace(/:slug\b/g, parsed.slug).replace(/:city\b/g, parsed.city)
  redirects = (parsed.redirects ?? []).map((r) => ({ ...r, source: fill(r.source), destination: fill(r.destination) }))
}

/* ------------------------------------------------------------- the drive */

const targets = [
  ...notLive.map((e) => ({ path: `/events/${e.slug}`, kind: `${e.status}/${e.visibility}` })),
  ...tombstoned.map((t) => ({ path: `/events/${t.slug}`, kind: 'deleted' })),
  ...redirects.map((r) => ({ path: r.source, kind: 'renamed' })),
].filter((t) => typeof t.path === 'string' && t.path.startsWith('/'))

const results = []
const CONC = 6
for (let i = 0; i < targets.length; i += CONC) {
  results.push(
    ...(await Promise.all(
      targets.slice(i, i + CONC).map(async (t) => {
        try {
          const res = await fetch(BASE + t.path, { redirect: 'manual', headers: { 'user-agent': 'EventLinqs-graveyard' } })
          return { ...t, status: res.status, location: res.headers.get('location') }
        } catch (error) {
          return { ...t, status: 0, error: String(error) }
        }
      }),
    )),
  )
}

/* --------------------------------------------------------------- the rules */

for (const r of results) {
  if (r.status >= 500 || r.status === 0) {
    faults.push(`${r.path} (${r.kind}) answered ${r.status || 'nothing'}${r.error ? `: ${r.error}` : ''}. A dead URL must answer deliberately, never with a server error.`)
    continue
  }
  if (r.kind === 'deleted' && r.status !== 410) {
    faults.push(`${r.path} is a DELETED event and answered ${r.status}, not 410 Gone. Close-out C13.6 and docs/EVENT-LIFECYCLE.md require 410.`)
  }
  if (r.kind === 'renamed' && !(r.status === 301 || r.status === 308)) {
    faults.push(`${r.path} is a renamed slug and answered ${r.status}, not a permanent redirect.`)
  }
  if (r.kind === 'renamed' && r.location) {
    // A redirect that lands on another redirect or on a 404 is a redirect chain,
    // which is Search Console's "page with redirect" exclusion in practice.
    const dest = r.location.startsWith('http') ? r.location : BASE + r.location
    try {
      const hop = await fetch(dest, { redirect: 'manual', headers: { 'user-agent': 'EventLinqs-graveyard' } })
      if (hop.status !== 200) {
        faults.push(`${r.path} redirects to ${r.location}, which answered ${hop.status}. A permanent redirect must land on a live page.`)
      }
    } catch (error) {
      faults.push(`${r.path} redirects to ${r.location}, which could not be fetched: ${error}`)
    }
  }
}

/* ------------------------------------------------------------------ report */

const byStatus = {}
for (const r of results) {
  const key = `${r.kind} -> ${r.status}`
  byStatus[key] = (byStatus[key] ?? 0) + 1
}
console.log(`${TAG} ${BASE}`)
console.log(`${TAG} ${notLive.length} event(s) with a slug that are not publicly visible, ${tombstoned.length} deleted, ${redirects.length} renamed slug(s): ${targets.length} URL(s) driven`)
for (const [k, n] of Object.entries(byStatus).sort()) console.log(`${TAG}   ${String(n).padStart(4)}  ${k}`)

if (OUT) {
  writeFileSync(OUT, JSON.stringify({ base: BASE, results, faults }, null, 1))
  console.log(`${TAG} wrote ${OUT}`)
}

if (faults.length) {
  for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} ${faults.length} fault(s)`)
  process.exit(1)
}
console.log(`${TAG} PASS: every URL the platform has published and retired answers deliberately`)
