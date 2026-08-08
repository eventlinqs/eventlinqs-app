#!/usr/bin/env node
/**
 * Journey C, the organiser, and the Journey D empty states that live behind
 * the same login.
 *
 * The first pass of this sweep asserted the Launch Kit was PRESENT and called
 * Journey C done. Presence is not use. This opens the six dashboard surfaces
 * that were never opened, presses the artefact controls rather than counting
 * them, and records what each screen says when there is nothing in it, which
 * is the Journey D question.
 *
 * Usage:
 *   node scripts/sweep/journey-organiser.mjs --base <url> [--viewport 1440]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const argOf = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
const BASE = (argOf('--base') || '').replace(/\/$/, '')
if (!BASE) throw new Error('--base is required')
const WIDTH = Number(argOf('--viewport', '1440'))
const OUT = argOf('--out', `docs/roast/sweep-evidence/journey-c-${WIDTH}`)
const DOWNLOADS = path.join(OUT, 'downloads')
mkdirSync(DOWNLOADS, { recursive: true })

const EMAIL = process.env.SWEEP_ORGANISER_EMAIL || 'broadcast.gate.organiser@eventlinqs.com'
const PASSWORD = process.env.SWEEP_ORGANISER_PASSWORD || 'ArtistGate2026!Drive'

const steps = []
let page

async function step(name, fn) {
  const rec = { step: name, verdict: 'PASS', notes: [] }
  try {
    const out = await fn(rec)
    if (out) rec.notes.push(String(out))
  } catch (e) {
    rec.verdict = 'FAIL'
    rec.notes.push(String(e.message || e).slice(0, 300))
  }
  const file = path.join(OUT, `${String(steps.length + 1).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`)
  try {
    await page.screenshot({ path: file, fullPage: true })
    rec.screenshot = file
  } catch { /* closed page */ }
  rec.url = page.url().replace(BASE, '')
  steps.push(rec)
  console.log(`${rec.verdict}  ${name}${rec.notes.length ? '  -> ' + rec.notes.join(' | ') : ''}`)
  return rec
}

const mainText = () =>
  page.evaluate(() => (document.querySelector('main') || document.body).innerText.replace(/\s+/g, ' ').trim())

/**
 * The Journey D question, asked of any surface: when there is nothing here,
 * does the screen show a beginning or does it show nothing?
 */
async function describeEmptiness(rec) {
  const t = await mainText()
  const hasBody = t.length > 120
  const offersNext = /(be the first|could be yours|get started|create|add|invite|set up|list your|connect|no .* yet)/i.test(t)
  const apologetic = /(sorry|unfortunately|oops|whoops|something went wrong|error)/i.test(t)
  const bare = hasBody && !offersNext && t.length < 260
  rec.notes.push(
    `${t.length} chars` +
      (offersNext ? ', offers a next step' : ', NO next step offered') +
      (apologetic ? ', APOLOGETIC copy' : '') +
      (bare ? ', BARE' : ''),
  )
  rec.emptyState = { chars: t.length, offersNext, apologetic, excerpt: t.slice(0, 240) }
  return null
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: WIDTH, height: WIDTH < 500 ? 844 : 900 },
  isMobile: WIDTH < 500,
  hasTouch: WIDTH < 500,
  acceptDownloads: true,
})
page = await context.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)))

await step('sign in as an organiser', async (rec) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // Wait for the submit control to be enabled. It is gated on hydration now,
  // so this is the same wait a person's finger performs without noticing, and
  // it is the difference between the handler running and a native GET putting
  // the password in the URL.
  await page.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
  await page.locator('input[type="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/dashboard|account/, { timeout: 40000 }).catch(() => {})
  await page.waitForTimeout(2000)
  rec.notes.push(`landed on ${page.url().replace(BASE, '')}`)
  if (/\/login/.test(page.url())) throw new Error('still on /login after submitting credentials')
})

// The six surfaces the first pass never opened, plus the dashboard itself.
const SURFACES = [
  ['dashboard', '/dashboard'],
  ['events list', '/dashboard/events'],
  ['payouts', '/dashboard/payouts'],
  ['venues', '/dashboard/venues'],
  ['squads', '/dashboard/squads'],
  ['waitlists', '/dashboard/waitlists'],
  ['founding invites', '/dashboard/invites'],
  ['reach', '/dashboard/reach'],
  ['settings', '/dashboard/settings'],
]

for (const [name, url] of SURFACES) {
  await step(`open ${name}`, async (rec) => {
    const res = await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(800)
    const status = res ? res.status() : 0
    rec.notes.push(`HTTP ${status}`)
    rec.status = status
    if (status >= 400) throw new Error(`${url} returned ${status}`)
    if (/\/login/.test(page.url())) throw new Error(`${url} bounced to login while signed in`)
    await describeEmptiness(rec)
  })
}

await step('open a published event and its Launch Kit', async (rec) => {
  await page.goto(`${BASE}/dashboard/events`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)
  const link = page.locator('a[href*="/dashboard/events/"]').first()
  if (!(await link.count())) throw new Error('no event rows in the organiser dashboard')
  const href = await link.getAttribute('href')
  const id = (href || '').split('/dashboard/events/')[1]?.split('/')[0]
  if (!id) throw new Error(`could not read an event id from ${href}`)
  rec.eventId = id
  const res = await page.goto(`${BASE}/dashboard/events/${id}/launch-kit`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})
  rec.notes.push(`launch kit HTTP ${res ? res.status() : 0}`)
  if (res && res.status() >= 400) throw new Error(`launch kit returned ${res.status()}`)
})

await step('artefact: actually download the poster', async (rec) => {
  const trigger = page
    .locator('a[download], button:has-text("Download"), a:has-text("Download")')
    .first()
  if (!(await trigger.count())) throw new Error('no download control on the Launch Kit')
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45000 }),
    trigger.click(),
  ])
  const dest = path.join(DOWNLOADS, download.suggestedFilename() || 'artefact')
  await download.saveAs(dest)
  if (!existsSync(dest)) throw new Error('the download produced no file')
  const bytes = statSync(dest).size
  rec.notes.push(`${download.suggestedFilename()}, ${bytes} bytes`)
  rec.download = { file: dest, bytes }
  // A zero-byte or near-empty file is a download that looks like it worked.
  if (bytes < 1024) throw new Error(`the downloaded artefact is only ${bytes} bytes`)
})

await step('artefact: copy a caption or link to the clipboard', async (rec) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  const copy = page.locator('button:has-text("Copy")').first()
  if (!(await copy.count())) throw new Error('no Copy control on the Launch Kit')
  await copy.click()
  await page.waitForTimeout(1200)
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '')
  rec.notes.push(clip ? `clipboard now holds ${clip.length} chars: "${clip.slice(0, 90)}"` : 'clipboard unreadable in this context')
  // The button must at least acknowledge, even where the clipboard is blocked.
  const ack = await page.locator('text=/copied/i').count()
  rec.notes.push(ack ? 'the button confirms "Copied"' : 'NO visible confirmation after copying')
  if (!clip && !ack) throw new Error('copy produced neither clipboard content nor any confirmation')
})

await step('artefact: the QR code resolves to a real destination', async (rec) => {
  // A QR image is only as good as the URL behind it, so the tracked link the
  // kit exposes is followed rather than the pixels decoded.
  const shareHref = await page
    .locator('a[href*="/s/"], input[value*="/s/"]')
    .first()
    .evaluate((el) => el.getAttribute('href') || el.getAttribute('value'))
    .catch(() => null)
  const qrCount = await page.locator('img[alt*="QR" i], canvas[aria-label*="QR" i], svg[aria-label*="QR" i]').count()
  rec.notes.push(`QR elements on the page: ${qrCount}`)
  if (!shareHref) {
    rec.notes.push('no /s/ tracked link exposed on the kit to follow')
    return
  }
  const url = shareHref.startsWith('http') ? shareHref : BASE + shareHref
  const res = await context.request.get(url, { maxRedirects: 5 })
  rec.notes.push(`${url.replace(BASE, '')} -> HTTP ${res.status()}`)
  if (!res.ok()) throw new Error(`the tracked link behind the QR returned ${res.status()}`)
})

await step('edit the published event and save', async (rec) => {
  const id = steps.find((s) => s.eventId)?.eventId
  if (!id) throw new Error('no event id captured earlier')
  const res = await page.goto(`${BASE}/dashboard/events/${id}/edit`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})
  rec.notes.push(`edit HTTP ${res ? res.status() : 0}`)
  if (res && res.status() >= 400) throw new Error(`edit returned ${res.status()}`)
  const save = page.locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]').first()
  if (!(await save.count())) throw new Error('no save control on the edit screen')
  await save.click()
  await page.waitForTimeout(4000)
  const t = await mainText()
  const bad = /(error|failed|went wrong)/i.test(t)
  rec.notes.push(bad ? `save reported a problem: ${t.slice(0, 160)}` : 'saved without an error')
  if (bad) throw new Error('saving an unchanged published event reported an error')
})

await browser.close()

const failed = steps.filter((s) => s.verdict === 'FAIL')
writeFileSync(path.join(OUT, 'journey.json'), JSON.stringify({ steps, pageErrors }, null, 1))
console.log(`\n${steps.length} steps, ${failed.length} failed. Page errors: ${pageErrors.length}`)
if (pageErrors.length) console.log('  ' + pageErrors.slice(0, 6).join('\n  '))
console.log(`evidence: ${OUT}`)
process.exit(failed.length ? 1 : 0)
