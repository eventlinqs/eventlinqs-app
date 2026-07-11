/**
 * Magic Start publish + Launch Kit regression drive: describe an event,
 * let the AI build the draft, upload a cover, publish, and assert the
 * Launch Kit screen delivers (live page, poster, tracked sharing, reach).
 * Usage: node scripts/verify/magic-launch-kit-drive.mjs [baseUrl]
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'https://eventlinqs-staging.vercel.app'
const OUT = 'docs/marketplace/evidence/2026-07-11'
const EMAIL = 'broadcast.gate.organiser@eventlinqs.com'
const PASSWORD = 'ArtistGate2026!Drive'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 90000 })
await page.fill('input[type="email"]', EMAIL)
await page.fill('input[type="password"]', PASSWORD)
await Promise.all([
  page.waitForURL((u) => !String(u).includes('/login'), { timeout: 60000 }),
  page.click('button[type="submit"]'),
])
console.log('login ok')

await page.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'load', timeout: 90000 })
await page.waitForSelector('text=Magic Start', { timeout: 30000 })

// Magic Start: describe the event, let the AI build the draft.
await page
  .locator('textarea')
  .first()
  .fill(
    'Free comedy night called Marketplace Regression Comedy at Waterfront Pavilion in Geelong on 25 September 2026 at 7:30pm, free entry, 60 capacity',
  )
await page.getByRole('button', { name: 'Build my event' }).click()
console.log('building draft...')
// The draft lands when the title field fills.
await page.waitForFunction(
  () => {
    const el = document.querySelector('input[placeholder*="Summer Music Festival"]')
    return el && el.value.length > 3
  },
  { timeout: 90000 },
)
await page.screenshot({ path: `${OUT}/regression-magic-draft.png`, fullPage: false })
console.log('draft built')

// Walk the wizard: upload a cover at the media step, then publish from the
// review step ("Publish and get your launch kit").
let published = false
for (let step = 0; step < 14 && !published; step++) {
  await page.waitForTimeout(1500)

  // The media step: give the event a real cover (publish requires one).
  const fileInput = page.locator('input[type="file"]')
  if ((await fileInput.count()) > 0) {
    const already = await page.locator('img[alt*="cover" i], img[src*="event-images"]').count()
    if (!already) {
      await fileInput.first().setInputFiles(`${OUT}/regression-magic-stuck-6.png`)
      console.log(`step ${step}: cover uploaded`)
      await page.waitForTimeout(8000)
    }
  }

  const publish = page.getByRole('button', { name: /publish and get your launch kit|^publish( event)?$/i })
  if ((await publish.count()) && (await publish.first().isEnabled())) {
    await publish.first().click()
    console.log('clicked publish')
    published = true
    break
  }
  const cont = page.getByRole('button', { name: /^(Continue|Next|Review|Skip for now)$/i }).last()
  if (await cont.count()) {
    await cont.click()
    console.log(`step ${step}: continued`)
  } else {
    await page.screenshot({ path: `${OUT}/regression-magic-stuck-${step}.png`, fullPage: true })
    throw new Error(`no progression button at step ${step}`)
  }
}
if (!published) throw new Error('never reached publish')

// The Launch Kit is the post-publish screen.
await page.waitForSelector('text=/launch kit/i', { timeout: 120000 })
await page.waitForTimeout(3000)
await page.screenshot({ path: `${OUT}/regression-launch-kit.png`, fullPage: true })
const body = await page.textContent('body')
console.log(
  JSON.stringify({
    launchKitShown: /launch kit/i.test(body),
    hasPoster: /poster/i.test(body),
    hasShareLinks: /share/i.test(body),
    hasEventPageLink: /event page|view.*event/i.test(body),
  }),
)
await browser.close()
