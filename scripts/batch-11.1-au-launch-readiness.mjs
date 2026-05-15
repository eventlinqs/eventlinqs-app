// Batch 11.1 - AU launch readiness verification script.
//
// Section 3.1 City coverage parity.
// For every AU city slug in the cities DB table:
//   1. Present in LAUNCH_TARGET_CITIES (code allowlist)
//   2. Present in the picker (live test against running prod build)
//   3. Searchable in the picker by city name AND by slug
//   4. /events/browse/[city] returns 200
//   5. /city/[slug] returns 200
//   6. Appears in /sitemap.xml
//
// Output: docs/redesign/batch-11.1-evidence/city-coverage-parity.json (raw)
// + city-coverage-parity.md (human-readable summary).
//
// Run requires `npm run build && npx next start -p 3007` listening on
// localhost:3007.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:3007'
const OUT_DIR = 'docs/redesign/batch-11.1-evidence'
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

// --- 1. Fetch cities table from Supabase ---
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('=')
    return [l.slice(0, i), l.slice(i + 1)]
  })
)
const dbResp = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/cities?select=slug,name,state,country&order=slug.asc', {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY }
})
const dbCities = await dbResp.json()
if (!Array.isArray(dbCities)) {
  console.error('Failed to fetch cities table:', JSON.stringify(dbCities))
  process.exit(1)
}
const auDbCities = dbCities.filter(c => (c.country ?? 'AU') === 'AU')
console.log(`Step 1: ${auDbCities.length} AU cities in DB cities table`)

// --- 2. Read LAUNCH_TARGET_CITIES ---
const launchSrc = readFileSync('src/lib/locations/launch-cities.ts', 'utf8')
const slugMatches = [...launchSrc.matchAll(/slug:\s*'([a-z0-9-]+)'/g)]
const launchSlugs = new Set(slugMatches.map(m => m[1]))
console.log(`Step 2: ${launchSlugs.size} slugs in LAUNCH_TARGET_CITIES`)

// --- 3. Fetch sitemap and parse city slugs ---
const sitemapResp = await fetch(BASE + '/sitemap.xml')
const sitemapXml = await sitemapResp.text()
const sitemapSlugs = new Set(
  [...sitemapXml.matchAll(/\/events\/browse\/([a-z0-9-]+)/g)].map(m => m[1])
    .concat([...sitemapXml.matchAll(/\/city\/([a-z0-9-]+)/g)].map(m => m[1]))
)
console.log(`Step 3: ${sitemapSlugs.size} unique city slugs in /sitemap.xml`)

// --- 4. Launch Playwright once, open picker, capture picker city list ---
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.click('button[aria-label*="Change location"]')
await page.waitForTimeout(500)

const pickerCitiesText = await page.$$eval('[role="dialog"] li button', els =>
  els.map(el => el.textContent?.trim().replace(/\s+/g, ' ')).filter(Boolean)
)
const pickerCityNames = new Set(
  pickerCitiesText.map(t => t.replace(/Australia.*$/, '').replace(/Current$/, '').trim())
)
console.log(`Step 4: ${pickerCityNames.size} cities in picker AU section`)

// Per-city searchable check (search the picker for the slug AND the name).
const pickerSearchable = {}
for (const c of auDbCities) {
  await page.fill('input#location-search', c.name)
  await page.waitForTimeout(180)
  const matches = await page.$$eval('[role="dialog"] li button', els =>
    els.map(el => el.textContent?.trim().replace(/\s+/g, ' ')).filter(Boolean)
  )
  const nameHit = matches.some(m => m.includes(c.name))

  await page.fill('input#location-search', c.slug)
  await page.waitForTimeout(180)
  const slugMatches = await page.$$eval('[role="dialog"] li button', els =>
    els.map(el => el.textContent?.trim().replace(/\s+/g, ' ')).filter(Boolean)
  )
  const slugHit = slugMatches.some(m => m.includes(c.name))

  pickerSearchable[c.slug] = { byName: nameHit, bySlug: slugHit }
}
await browser.close()

// --- 5. HTTP test /events/browse/[slug] and /city/[slug] for every AU city ---
async function statusFor(url) {
  try {
    const r = await fetch(url, { redirect: 'manual' })
    return r.status
  } catch {
    return 0
  }
}

const httpResults = {}
for (const c of auDbCities) {
  const [browseStatus, cityStatus] = await Promise.all([
    statusFor(`${BASE}/events/browse/${c.slug}`),
    statusFor(`${BASE}/city/${c.slug}`),
  ])
  httpResults[c.slug] = { browse: browseStatus, city: cityStatus }
}

// --- 6. Compile per-city verdict ---
const perCity = auDbCities.map(c => {
  const inLaunch = launchSlugs.has(c.slug)
  const inPickerList = pickerCityNames.has(c.name)
  const searchable = pickerSearchable[c.slug] ?? { byName: false, bySlug: false }
  const inSitemap = sitemapSlugs.has(c.slug)
  const http = httpResults[c.slug] ?? { browse: 0, city: 0 }
  const browse200 = http.browse === 200
  const city200 = http.city === 200
  const verdict =
    inLaunch && inPickerList && searchable.byName && searchable.bySlug &&
    inSitemap && browse200 && city200
      ? 'PASS'
      : 'FAIL'
  return {
    slug: c.slug,
    name: c.name,
    state: c.state,
    inLaunch,
    inPickerList,
    searchableByName: searchable.byName,
    searchableBySlug: searchable.bySlug,
    inSitemap,
    browseStatus: http.browse,
    cityStatus: http.city,
    verdict,
  }
})

writeFileSync(`${OUT_DIR}/city-coverage-parity.json`, JSON.stringify({
  generatedAt: new Date().toISOString(),
  base: BASE,
  dbCities: auDbCities.length,
  launchSlugs: launchSlugs.size,
  pickerCityNames: pickerCityNames.size,
  sitemapSlugs: sitemapSlugs.size,
  perCity,
}, null, 2))

const failures = perCity.filter(r => r.verdict === 'FAIL')
console.log(`\n=== City coverage parity: ${perCity.length - failures.length}/${perCity.length} PASS ===`)
for (const r of perCity) {
  const flags = []
  if (!r.inLaunch) flags.push('not in LAUNCH_TARGET_CITIES')
  if (!r.inPickerList) flags.push('not in picker AU list')
  if (!r.searchableByName) flags.push('not searchable by name')
  if (!r.searchableBySlug) flags.push('not searchable by slug')
  if (!r.inSitemap) flags.push('not in sitemap')
  if (r.browseStatus !== 200) flags.push(`/events/browse HTTP ${r.browseStatus}`)
  if (r.cityStatus !== 200) flags.push(`/city HTTP ${r.cityStatus}`)
  const tag = r.verdict === 'PASS' ? 'PASS' : 'FAIL'
  const detail = flags.length ? ` | ${flags.join(', ')}` : ''
  console.log(`  ${tag.padEnd(4)} ${r.slug.padEnd(18)} ${r.name.padEnd(18)} ${detail}`)
}

if (failures.length > 0) {
  console.log(`\n${failures.length} city(ies) failed coverage parity. Inspect ${OUT_DIR}/city-coverage-parity.json`)
  process.exit(2)
}
console.log('\nAll AU cities have full parity across DB, allowlist, picker, search, browse, /city, sitemap.')
