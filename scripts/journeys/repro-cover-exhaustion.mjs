/**
 * REPRO: the cover composer stops working after N covers and never recovers
 * until the process restarts, while telling the organiser to "try again in a
 * moment".
 *
 * Signs in as an existing organiser (no signup, so the 5-per-10-minutes signup
 * limiter is not involved), walks to the Event Media step once, then presses
 * "Make a cover" repeatedly and records which press is the first to fail.
 *
 * Usage: node scripts/journeys/repro-cover-exhaustion.mjs <email> <password>
 */
import { chromium, BASE, makeJourney, note, attach, finish } from './harness.mjs'

const [, , EMAIL, PASSWORD] = process.argv
if (!EMAIL || !PASSWORD) {
  console.error('usage: node scripts/journeys/repro-cover-exhaustion.mjs <email> <password>')
  process.exit(2)
}
const MAX = Number(process.env.MAX_PRESSES || 14)

const j = makeJourney('repro-cover-exhaustion', 'Repro: the cover composer stops after N covers')
const stamp = String(Date.now()).slice(-6)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
const page = await ctx.newPage()
await attach(j, page)

const fill = async (sel, val) => {
  try {
    const el = await page.$(sel)
    if (!el) return false
    await el.fill(val)
    return true
  } catch {
    return false
  }
}
const clickText = async (t) => {
  const b = await page.$(`button:has-text("${t}")`)
  if (!b) return false
  await b.click()
  return true
}
const noticeText = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role=alert],.text-red-600,.text-error,.text-amber-800,.text-amber-900')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => e.textContent.trim().slice(0, 160))
      .filter(Boolean),
  )

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 })
  await fill('input[type="email"]', EMAIL)
  await fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(6000)
  note(j, 'Signed in', `${EMAIL} -> ${new URL(page.url()).pathname}`)

  await page.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(3000)
  await fill('input[placeholder^="e.g. Summer Music Festival"]', `Cover Repro ${stamp}`)
  await fill('input[placeholder^="A brief one-line"]', 'Repro run.')
  await fill('textarea[placeholder^="Describe your event in detail"]', 'Repro run for the cover composer.')
  await clickText('Continue')
  await page.waitForTimeout(3500)

  // Walk forward until the media step (the one offering "Make a cover").
  for (let i = 0; i < 8; i += 1) {
    if (await page.$('button:has-text("Make a cover")')) break
    const dates = await page.$$('input[type="date"], input[type="datetime-local"]')
    for (let d = 0; d < dates.length; d += 1) {
      const when = new Date(Date.now() + 21 * 864e5 + d * 3 * 36e5)
      const type = await page.evaluate((e) => e.type, dates[d])
      await dates[d].fill(type === 'date' ? when.toISOString().slice(0, 10) : when.toISOString().slice(0, 16)).catch(() => {})
    }
    await fill('input[placeholder*="Venue"], input[placeholder*="Address"]', 'The Wool Exchange, Geelong')
    if (!(await clickText('Continue'))) break
    await page.waitForTimeout(3000)
  }

  if (!(await page.$('button:has-text("Make a cover")'))) {
    j.blockers.push('never reached the Event Media step')
    throw new Error('no media step')
  }
  note(j, 'Reached the Event Media step', 'now pressing Make a cover repeatedly')

  let firstFailure = null
  const results = []
  for (let press = 1; press <= MAX; press += 1) {
    const label = (await page.$('button:has-text("Make another")')) ? 'Make another' : 'Make a cover'
    await clickText(label)
    const started = Date.now()
    let made = false
    while (Date.now() - started < 40000) {
      made = await page.evaluate(() =>
        [...document.querySelectorAll('img')].some((im) => {
          const r = im.getBoundingClientRect()
          return r.width > 120 && r.height > 80 && im.complete && im.naturalWidth > 0
        }),
      )
      if (made) break
      const n = await noticeText()
      if (n.some((t) => /could not make a cover/i.test(t))) break
      await page.waitForTimeout(1200)
    }
    const shown = await noticeText()
    results.push(`${press}:${made ? 'ok' : 'FAILED'}`)
    if (!made && firstFailure === null) {
      firstFailure = press
      note(j, `Press ${press} FAILED`, `shown to the person: ${shown.join(' // ') || 'NOTHING AT ALL'}`)
      // Keep pressing to prove waiting does not clear it.
      for (let retry = 1; retry <= 3; retry += 1) {
        await page.waitForTimeout(8000)
        await clickText(label)
        await page.waitForTimeout(6000)
        const stillShown = await noticeText()
        const recovered = await page.evaluate(() =>
          [...document.querySelectorAll('img')].some((im) => {
            const r = im.getBoundingClientRect()
            return r.width > 120 && r.height > 80 && im.complete && im.naturalWidth > 0
          }),
        )
        note(
          j,
          `Waited 8s and pressed again (retry ${retry})`,
          recovered ? 'RECOVERED' : `still failing: ${stillShown.join(' // ') || 'NOTHING'}`,
        )
        if (recovered) break
      }
      break
    }
    await page.waitForTimeout(800)
  }

  note(j, 'Result of every press', results.join(' , '))
  if (firstFailure === null) {
    note(j, 'No failure', `the composer survived ${MAX} presses on this process`)
  } else {
    j.blockers.push(
      `the cover composer failed on press ${firstFailure} of ${MAX} on a single server process, ` +
        'and repeated waiting did not clear it. The message shown says "Try again in a moment".',
    )
  }
} catch (err) {
  note(j, 'THREW', String(err).slice(0, 200))
  j.blockers.push(`threw: ${String(err).slice(0, 140)}`)
} finally {
  await finish(j)
  await browser.close()
}
