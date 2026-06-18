// Capture the two known-missing competitor surfaces for the competitor-2026
// benchmark, matching the existing fold-capture format (viewport fold, dsf2,
// then clamped to <=1800px longest side):
//   - Ticketmaster sign-in: reached by CLICKING the account/sign-in control on
//     the TM AU homepage (never a guessed auth URL - the prior attempt failed
//     ERR_NAME_NOT_RESOLVED on a fabricated host).
//   - Eventbrite organiser landing: eventbrite.com.au/organizer/overview/.
// Output -> docs/benchmark/competitor-2026/. Writes captured-missing.json with
// the real final URLs reached, for the INDEX evidence pointer.
import { chromium } from 'playwright'
import sharp from 'sharp'
import { writeFileSync, readFileSync } from 'node:fs'

const DIR = 'docs/benchmark/competitor-2026'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const VPS = [['1440', 1440, 900], ['390', 390, 844]]

async function acceptCookies(page) {
  for (const t of ['Accept All', 'Accept all', 'Accept', 'I Accept', 'Allow all', 'Got it', 'Agree', 'OK']) {
    try { await page.getByRole('button', { name: t, exact: false }).first().click({ timeout: 1200 }); await page.waitForTimeout(400); break } catch {}
  }
}

async function clamp(path) {
  const m = await sharp(path).metadata()
  if (Math.max(m.width, m.height) > 1800) {
    const buf = await sharp(path).resize({ width: m.width >= m.height ? 1800 : null, height: m.height > m.width ? 1800 : null }).png().toBuffer()
    writeFileSync(path, buf)
  }
  const n = await sharp(path).metadata()
  return `${n.width}x${n.height}`
}

const b = await chromium.launch({ args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] })
const out = {}

// ---- Ticketmaster sign-in (navigate from the homepage account button) ----
out['ticketmaster/signin'] = {}
for (const [vn, w, h] of VPS) {
  const file = `${DIR}/ticketmaster__signin-${vn}.png`
  try {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, userAgent: UA, locale: 'en-AU' })
    const page = await ctx.newPage()
    await page.goto('https://www.ticketmaster.com.au/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3500)
    await acceptCookies(page)
    // The account/sign-in control: try the common labels TM uses. On mobile it
    // can live behind the menu; try the menu first if a direct hit fails.
    const tryClick = async () => {
      const labels = [/sign\s*in/i, /my account/i, /account/i, /log\s*in/i]
      for (const re of labels) {
        for (const role of ['link', 'button']) {
          try { await page.getByRole(role, { name: re }).first().click({ timeout: 1500 }); return true } catch {}
        }
      }
      return false
    }
    let clicked = await tryClick()
    if (!clicked) {
      for (const m of [/menu/i, /open menu/i]) {
        try { await page.getByRole('button', { name: m }).first().click({ timeout: 1500 }); await page.waitForTimeout(800); break } catch {}
      }
      clicked = await tryClick()
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(4000)
    await acceptCookies(page)
    await page.waitForTimeout(800)
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h } })
    const dims = await clamp(file)
    out['ticketmaster/signin'][vn] = { reachedUrl: page.url(), clicked, dims }
    console.log(`TM signin ${vn}: clicked=${clicked} -> ${page.url()} (${dims})`)
    await ctx.close()
  } catch (e) {
    out['ticketmaster/signin'][vn] = { error: e.message.slice(0, 120) }
    console.log(`ERR TM signin ${vn}: ${e.message.slice(0, 100)}`)
  }
}

// ---- Eventbrite organiser landing ----
out['eventbrite/organizer'] = {}
for (const [vn, w, h] of VPS) {
  const file = `${DIR}/eventbrite__organizer-${vn}.png`
  try {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, userAgent: UA, locale: 'en-AU' })
    const page = await ctx.newPage()
    await page.goto('https://www.eventbrite.com.au/organizer/overview/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3500)
    await acceptCookies(page)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h } })
    const dims = await clamp(file)
    out['eventbrite/organizer'][vn] = { reachedUrl: page.url(), dims }
    console.log(`EB organizer ${vn}: -> ${page.url()} (${dims})`)
    await ctx.close()
  } catch (e) {
    out['eventbrite/organizer'][vn] = { error: e.message.slice(0, 120) }
    console.log(`ERR EB organizer ${vn}: ${e.message.slice(0, 100)}`)
  }
}

await b.close()
// Merge into measurements.json so the evidence record is single-source.
let meas = {}
try { meas = JSON.parse(readFileSync(`${DIR}/measurements.json`, 'utf8')) } catch {}
meas['ticketmaster/signin'] = out['ticketmaster/signin']
meas['eventbrite/organizer'] = out['eventbrite/organizer']
writeFileSync(`${DIR}/measurements.json`, JSON.stringify(meas, null, 2))
writeFileSync(`${DIR}/captured-missing.json`, JSON.stringify(out, null, 2))
console.log('\nwrote captures + updated measurements.json')
