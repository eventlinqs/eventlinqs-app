/**
 * A COMMUNITY PAGE CROSSING THE INDEXING THRESHOLD, DRIVEN (close-out C19.7).
 *
 * C19.7 asks for "one community page with events and one without". Neither
 * production nor TEST held a single event tagged to any of the 21 communities,
 * so the first C19 pass drove /city/melbourne (27 events) as the with-content
 * case and reported it without saying it was a substitute. The roast caught that.
 *
 * This creates the missing state on TEST and takes it away again: it publishes
 * DISCOVERY_INDEXING_THRESHOLD events carrying a real community's own tag, in a
 * real city, through the same `public.events` table an organiser's publish
 * writes to, then hands the paths back for driving, then deletes them.
 *
 * WHAT IT PROVES AND WHAT IT DOES NOT. It proves the INDEXING DECISION: below
 * the threshold the community page is noindex and out of the sitemap, at the
 * threshold it is indexable and in it. It does NOT prove the organiser's create
 * journey; that is driven through the wizard in its own item (close-out C9).
 *
 * TEST ONLY. It refuses to run against production, by project ref, before it
 * touches anything.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify/community-threshold-drive.mjs seed
 *   node --env-file=.env.local scripts/verify/community-threshold-drive.mjs clean
 */
import { spawnSync } from 'node:child_process'

const PROD_REF = 'gndnldyfudbytbboxesk'
const TAG = '[community-threshold]'
const MODE = process.argv[2] ?? 'seed'
const SLUG_PREFIX = 'c19-threshold-proof-'

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url || !key) {
  console.error(`${TAG} NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run with --env-file=.env.local)`)
  process.exit(1)
}
if (url.includes(PROD_REF)) {
  console.error(`${TAG} SAFETY STOP: this is production (${PROD_REF}). This script writes, and production is never written.`)
  process.exit(1)
}

const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' }
const rest = async (path, init = {}) => {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status}: ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : null
}

if (MODE === 'clean') {
  await rest(`events?slug=like.${SLUG_PREFIX}*`, { method: 'DELETE', headers: { prefer: 'return=representation' } })
  console.log(`${TAG} removed every ${SLUG_PREFIX}* event from ${url}`)
  process.exit(0)
}

/* ------------------------------- the community, the city and the threshold */

const script = [
  "import { DISCOVERY_INDEXING_THRESHOLD } from '@/lib/seo/indexing-policy'",
  "import { getAllCommunities } from '@/lib/communities/data'",
  "import { getCommunityTags } from '@/lib/communities/tag-bridge'",
  "import { getAllCities } from '@/lib/cities/data'",
  'const community = getAllCommunities()[1]',
  'const city = getAllCities()[0]',
  'console.log(JSON.stringify({',
  '  threshold: DISCOVERY_INDEXING_THRESHOLD,',
  '  community: community.slug,',
  '  tag: getCommunityTags(community.slug)[0],',
  '  citySlug: city.slug,',
  '  cityName: city.name,',
  '}))',
  '',
].join('\n')
const loaded = spawnSync(
  process.execPath,
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/src-alias-loader.mjs', '--input-type=module', '-e', script],
  { cwd: process.cwd(), encoding: 'utf8' },
)
if (loaded.status !== 0) {
  console.error(`${TAG} could not read the community, city and threshold from source: ${(loaded.stderr || loaded.stdout).trim().slice(0, 400)}`)
  process.exit(1)
}
const plan = JSON.parse(loaded.stdout.trim().split(/\r?\n/).find((l) => l.startsWith('{')))

/*
 * THE ROW IS BUILT FROM A REAL ONE, NOT FROM MY READING OF THE SCHEMA.
 *
 * The first attempt hand-wrote the columns and hit 23502 on `created_by`, which
 * is exactly what guessing a schema earns. It now copies a published event that
 * already exists on this database and overrides only what the proof needs: the
 * slug, the title, the dates, the city and the community tag. Every NOT NULL the
 * table carries is satisfied because the template already satisfies it.
 */
const [template] = await rest('events?status=eq.published&visibility=eq.public&select=*&limit=1')
if (!template) {
  console.error(`${TAG} no published event on ${url} to use as a template`)
  process.exit(1)
}

const start = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
const rows = Array.from({ length: plan.threshold }, (_, i) => {
  const row = { ...template }
  delete row.id
  delete row.created_at
  delete row.updated_at
  return {
    ...row,
    slug: `${SLUG_PREFIX}${plan.community}-${i + 1}`,
    title: `${plan.cityName} ${plan.tag} night ${i + 1}`,
    description: `A ${plan.tag} night in ${plan.cityName}, published to prove the indexing threshold.`,
    summary: `A ${plan.tag} night in ${plan.cityName}.`,
    status: 'published',
    visibility: 'public',
    is_featured: false,
    start_date: new Date(start.getTime() + i * 60 * 60 * 1000).toISOString(),
    end_date: new Date(start.getTime() + i * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
    venue_name: `${plan.cityName} Proof Hall`,
    venue_city: plan.cityName,
    venue_country: 'Australia',
    tags: [plan.tag],
  }
})

const inserted = await rest('events', {
  method: 'POST',
  body: JSON.stringify(rows),
  headers: { prefer: 'return=representation' },
})

console.log(
  JSON.stringify(
    {
      base: url,
      threshold: plan.threshold,
      community: plan.community,
      tag: plan.tag,
      city: plan.cityName,
      inserted: inserted.map((e) => e.slug),
      drive: [`/community/${plan.community}`, `/community/${plan.community}/${plan.citySlug}`],
    },
    null,
    1,
  ),
)
console.error(`${TAG} seeded ${inserted.length} published event(s) on ${url}; run with 'clean' to remove them`)
