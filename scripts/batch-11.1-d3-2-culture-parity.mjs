// Batch 11.1 D3.2 - Community coverage parity.
// For every community slug in COMMUNITIES table (src/lib/communities/data.ts):
//   1. /community/[slug] returns 200
//   2. At least one /community/[slug]/[city] intersection returns 200
//   3. Appears in /communities index page
//   4. Appears in /sitemap.xml
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:3007'
const OUT_DIR = 'docs/redesign/batch-11.1-evidence'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

// Extract community slugs from src/lib/communities/data.ts
const dataSrc = readFileSync('src/lib/communities/data.ts', 'utf8')
// The type is `export type CommunitySlug = | 'african' | 'south-asian' | ...`.
// Scan from "export type CommunitySlug" to the next blank-line / non-pipe boundary.
const start = dataSrc.indexOf('export type CommunitySlug')
const block = dataSrc.slice(start, start + 700)
const communitySlugs = [...block.matchAll(/\|\s*'([a-z-]+)'/g)].map(m => m[1])
if (communitySlugs.length === 0) {
  console.error('Could not parse CommunitySlug type from data.ts. Block:', block.slice(0, 400))
  process.exit(1)
}
console.log(`${communitySlugs.length} community slugs found:`, communitySlugs.join(', '))

// Test AU cities for intersection
const auTestCities = ['sydney', 'melbourne', 'brisbane', 'perth', 'adelaide']

async function statusFor(url) {
  try { const r = await fetch(url, { redirect: 'manual' }); return r.status } catch { return 0 }
}

// Communities index page + sitemap
const [communitiesIndexStatus, sitemapXml] = await Promise.all([
  statusFor(`${BASE}/communities`),
  fetch(`${BASE}/sitemap.xml`).then(r => r.text()),
])
const sitemapCommunitySlugs = new Set(
  [...sitemapXml.matchAll(/\/community\/([a-z-]+)(?:["<\/])/g)].map(m => m[1])
)

const perCommunity = []
for (const slug of communitySlugs) {
  const communityStatus = await statusFor(`${BASE}/community/${slug}`)

  // Try each AU city; record first 200 hit
  let intersectionCity = null
  let intersectionStatus = 0
  for (const city of auTestCities) {
    const s = await statusFor(`${BASE}/community/${slug}/${city}`)
    if (s === 200) {
      intersectionCity = city
      intersectionStatus = s
      break
    }
    if (intersectionStatus === 0) intersectionStatus = s
  }

  const inSitemap = sitemapCommunitySlugs.has(slug)

  // /communities index page rendering test — verify community name appears
  const communitiesIndexHtml = await fetch(`${BASE}/communities`).then(r => r.text())
  const inIndex = communitiesIndexHtml.toLowerCase().includes(slug)

  const verdict =
    communityStatus === 200 && intersectionStatus === 200 && inIndex && inSitemap
      ? 'PASS'
      : 'FAIL'

  perCommunity.push({
    slug,
    communityStatus,
    intersectionCity,
    intersectionStatus,
    inIndex,
    inSitemap,
    verdict,
  })
}

writeFileSync(`${OUT_DIR}/community-coverage-parity.json`, JSON.stringify({
  generatedAt: new Date().toISOString(),
  base: BASE,
  totalCommunities: communitySlugs.length,
  perCommunity,
}, null, 2))

console.log(`\n=== Community coverage parity ===`)
console.log(`Communities total: ${perCommunity.length}, /communities index status: ${communitiesIndexStatus}`)
const failures = []
for (const r of perCommunity) {
  const flags = []
  if (r.communityStatus !== 200) flags.push(`/community HTTP ${r.communityStatus}`)
  if (r.intersectionStatus !== 200) flags.push(`intersection HTTP ${r.intersectionStatus}`)
  if (!r.inIndex) flags.push('not in /communities index')
  if (!r.inSitemap) flags.push('not in sitemap')
  const detail = flags.length ? ` | ${flags.join(', ')}` : ` | intersection via /${r.intersectionCity}`
  const tag = r.verdict === 'PASS' ? 'PASS' : 'FAIL'
  console.log(`  ${tag.padEnd(4)} ${r.slug.padEnd(18)}${detail}`)
  if (r.verdict === 'FAIL') failures.push(r)
}

if (failures.length > 0) {
  console.log(`\n${failures.length} community(s) failed parity. Inspect ${OUT_DIR}/community-coverage-parity.json`)
  process.exit(2)
}
console.log('\nAll communities have full parity across /community, intersection, index, sitemap.')
