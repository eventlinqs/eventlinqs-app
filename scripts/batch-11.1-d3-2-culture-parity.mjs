// Batch 11.1 D3.2 - Culture coverage parity.
// For every culture slug in CULTURES table (src/lib/cultures/data.ts):
//   1. /culture/[slug] returns 200
//   2. At least one /culture/[slug]/[city] intersection returns 200
//   3. Appears in /cultures index page
//   4. Appears in /sitemap.xml
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:3007'
const OUT_DIR = 'docs/redesign/batch-11.1-evidence'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

// Extract culture slugs from src/lib/cultures/data.ts
const dataSrc = readFileSync('src/lib/cultures/data.ts', 'utf8')
// The type is `export type CultureSlug = | 'african' | 'south-asian' | ...`.
// Scan from "export type CultureSlug" to the next blank-line / non-pipe boundary.
const start = dataSrc.indexOf('export type CultureSlug')
const block = dataSrc.slice(start, start + 700)
const cultureSlugs = [...block.matchAll(/\|\s*'([a-z-]+)'/g)].map(m => m[1])
if (cultureSlugs.length === 0) {
  console.error('Could not parse CultureSlug type from data.ts. Block:', block.slice(0, 400))
  process.exit(1)
}
console.log(`${cultureSlugs.length} culture slugs found:`, cultureSlugs.join(', '))

// Test AU cities for intersection
const auTestCities = ['sydney', 'melbourne', 'brisbane', 'perth', 'adelaide']

async function statusFor(url) {
  try { const r = await fetch(url, { redirect: 'manual' }); return r.status } catch { return 0 }
}

// Cultures index page + sitemap
const [culturesIndexStatus, sitemapXml] = await Promise.all([
  statusFor(`${BASE}/cultures`),
  fetch(`${BASE}/sitemap.xml`).then(r => r.text()),
])
const sitemapCultureSlugs = new Set(
  [...sitemapXml.matchAll(/\/culture\/([a-z-]+)(?:["<\/])/g)].map(m => m[1])
)

const perCulture = []
for (const slug of cultureSlugs) {
  const cultureStatus = await statusFor(`${BASE}/culture/${slug}`)

  // Try each AU city; record first 200 hit
  let intersectionCity = null
  let intersectionStatus = 0
  for (const city of auTestCities) {
    const s = await statusFor(`${BASE}/culture/${slug}/${city}`)
    if (s === 200) {
      intersectionCity = city
      intersectionStatus = s
      break
    }
    if (intersectionStatus === 0) intersectionStatus = s
  }

  const inSitemap = sitemapCultureSlugs.has(slug)

  // /cultures index page rendering test — verify culture name appears
  const culturesIndexHtml = await fetch(`${BASE}/cultures`).then(r => r.text())
  const inIndex = culturesIndexHtml.toLowerCase().includes(slug)

  const verdict =
    cultureStatus === 200 && intersectionStatus === 200 && inIndex && inSitemap
      ? 'PASS'
      : 'FAIL'

  perCulture.push({
    slug,
    cultureStatus,
    intersectionCity,
    intersectionStatus,
    inIndex,
    inSitemap,
    verdict,
  })
}

writeFileSync(`${OUT_DIR}/culture-coverage-parity.json`, JSON.stringify({
  generatedAt: new Date().toISOString(),
  base: BASE,
  totalCultures: cultureSlugs.length,
  perCulture,
}, null, 2))

console.log(`\n=== Culture coverage parity ===`)
console.log(`Cultures total: ${perCulture.length}, /cultures index status: ${culturesIndexStatus}`)
const failures = []
for (const r of perCulture) {
  const flags = []
  if (r.cultureStatus !== 200) flags.push(`/culture HTTP ${r.cultureStatus}`)
  if (r.intersectionStatus !== 200) flags.push(`intersection HTTP ${r.intersectionStatus}`)
  if (!r.inIndex) flags.push('not in /cultures index')
  if (!r.inSitemap) flags.push('not in sitemap')
  const detail = flags.length ? ` | ${flags.join(', ')}` : ` | intersection via /${r.intersectionCity}`
  const tag = r.verdict === 'PASS' ? 'PASS' : 'FAIL'
  console.log(`  ${tag.padEnd(4)} ${r.slug.padEnd(18)}${detail}`)
  if (r.verdict === 'FAIL') failures.push(r)
}

if (failures.length > 0) {
  console.log(`\n${failures.length} culture(s) failed parity. Inspect ${OUT_DIR}/culture-coverage-parity.json`)
  process.exit(2)
}
console.log('\nAll cultures have full parity across /culture, intersection, index, sitemap.')
