/**
 * THE VIEW BEACON AND THE CRAWLER FILTER, end to end (TEST only, guarded).
 *
 * THE FINDING THIS PROVES AGAINST. `reach-integrity` reported
 * `share-view-beacon-fires` as FAILING on production: 3 views against 57
 * clicks. Its own note admitted it could not tell "the beacon is broken" from
 * "most clicks are scanners". Investigating the production rows settled it:
 *
 *     clicks 57, views 3, conversions 0
 *     ALL 57 clicks on facebook and x links
 *     55 distinct visitor hashes across 57 clicks
 *     1 of those 55 visitors ever produced a view
 *
 * That is a link-preview crawler fleet, and the beacon was never broken. The
 * real defect was upstream: those 57 were being COUNTED AS CLICKS and shown to
 * an organiser. "57 clicks, 0 sales" reads as "they clicked and did not buy"
 * when the truth is that nobody clicked.
 *
 * So there are two things to prove, and they pull in opposite directions:
 *   1. a crawler hit records NOTHING and still redirects (a shared link must
 *      never break, and the preview card must still render);
 *   2. a REAL browser still records a click AND fires the view beacon. If the
 *      filter is too eager, the panel silently understates real reach, which is
 *      the same class of lie in the other direction.
 *
 * Usage: node scripts/verify/share-beacon-e2e.mjs [baseUrl]
 */
import fs from 'node:fs'
import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '')
const PROD_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'

const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const SB = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
if (SB.includes(PROD_REF)) throw new Error('SAFETY STOP: PRODUCTION')
if (!SB.includes(TEST_REF)) throw new Error('SAFETY STOP: not TEST')
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const q = async (p) => {
  const r = await fetch(`${SB}/rest/v1/${p}`, { headers: H })
  if (!r.ok) throw new Error(`supabase ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

const steps = []
const step = (name, ok, detail) => {
  steps.push({ name, ok, detail })
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}`)
  console.log(`         ${detail}`)
}

const ev = (await q('events?status=eq.published&visibility=eq.public&select=id,slug&limit=1'))[0]
if (!ev) throw new Error('no published event on TEST')

const mint = await fetch(`${BASE}/api/broadcast/share-link`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ slug: ev.slug, channels: ['facebook'] }),
})
const shortUrl = (await mint.json())?.links?.facebook
if (!shortUrl) throw new Error('no tracked link minted')
const code = shortUrl.split('/s/')[1]
const link = (await q(`share_links?code=eq.${code}&select=id`))[0]
if (!link) throw new Error(`SAFETY STOP: ${BASE} is not writing to TEST`)
console.log(`[setup] ${shortUrl} on ${ev.slug}\n`)

const counts = async () => ({
  clicks: (await q(`share_link_events?link_id=eq.${link.id}&kind=eq.click&select=id`)).length,
  views: (await q(`share_link_events?link_id=eq.${link.id}&kind=eq.view&select=id`)).length,
})

// --- 1. CRAWLERS RECORD NOTHING ---------------------------------------------
console.log('a crawler hit records nothing, and still redirects')
const CRAWLERS = [
  ['Facebook', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
  ['X', 'Twitterbot/1.0'],
  ['WhatsApp', 'WhatsApp/2.19.81 A'],
  ['Slack', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
]
const beforeCrawlers = await counts()
for (const [name, ua] of CRAWLERS) {
  const res = await fetch(shortUrl, { headers: { 'user-agent': ua }, redirect: 'manual' })
  const location = res.headers.get('location') ?? ''
  step(
    `${name} still gets its redirect`,
    (res.status === 302 || res.status === 307) && location.includes(`/events/${ev.slug}`),
    `HTTP ${res.status} -> ${location || '(none)'}`,
  )
  const setCookie = res.headers.get('set-cookie') ?? ''
  step(
    `${name} gets no attribution cookie`,
    !setCookie.includes('el_share_code'),
    setCookie.includes('el_share_code') ? 'el_share_code was set for a crawler' : 'no el_share_code',
  )
}
await new Promise((r) => setTimeout(r, 1500))
const afterCrawlers = await counts()
step(
  'no crawler was counted as a click',
  afterCrawlers.clicks === beforeCrawlers.clicks,
  `${beforeCrawlers.clicks} -> ${afterCrawlers.clicks} click rows across ${CRAWLERS.length} crawler hits`,
)

// --- 2. A REAL BROWSER IS STILL COUNTED, AND STILL FIRES THE BEACON ---------
console.log('\na real browser is still counted, and the view beacon still fires')
const browser = await chromium.launch()
try {
  // An explicit real-browser user agent, because Playwright's default contains
  // "HeadlessChrome" and the crawler filter drops that DELIBERATELY: headless
  // Chrome is a synthetic agent (Lighthouse audits run as one) and counting it
  // as a visitor would inflate an organiser's panel. So the harness has to
  // present as what it is simulating, an actual person on Chrome.
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  })
  const page = await ctx.newPage()
  await page.goto(shortUrl, { waitUntil: 'load', timeout: 90000 })
  step(
    'the browser landed on the event page',
    new RegExp(`/events/${ev.slug}`).test(page.url()),
    page.url(),
  )
  const cookie = (await ctx.cookies()).find((c) => c.name === 'el_share_code')
  step(
    'the browser DID get the attribution cookie',
    cookie?.value === code,
    cookie ? `el_share_code=${cookie.value}` : 'no cookie, so no conversion could ever be attributed',
  )
  // sendBeacon is fire and forget, so give the request time to land.
  await page.waitForTimeout(4000)
  const afterBrowser = await counts()
  step(
    'the real browser WAS counted as a click',
    afterBrowser.clicks > afterCrawlers.clicks,
    `${afterCrawlers.clicks} -> ${afterBrowser.clicks} click rows. A filter that drops real people understates reach, which is the same lie in the other direction`,
  )
  step(
    'the view beacon fired',
    afterBrowser.views > afterCrawlers.views,
    afterBrowser.views > afterCrawlers.views
      ? `${afterCrawlers.views} -> ${afterBrowser.views} view rows, so the whole path works: script ran, cookie survived, endpoint accepted`
      : `${afterCrawlers.views} view rows, unchanged. The beacon did not fire`,
  )
  await ctx.close()
} finally {
  await browser.close()
}

const failed = steps.filter((s) => !s.ok)
console.log(`\n${steps.length - failed.length} pass, ${failed.length} FAIL`)
if (failed.length) for (const f of failed) console.log(`  ${f.name}: ${f.detail}`)
fs.mkdirSync('docs/roast/share-beacon', { recursive: true })
fs.writeFileSync(
  'docs/roast/share-beacon/share-beacon-e2e.json',
  JSON.stringify({ base: BASE, at: new Date().toISOString(), code, steps }, null, 2),
)
process.exitCode = failed.length ? 2 : 0
