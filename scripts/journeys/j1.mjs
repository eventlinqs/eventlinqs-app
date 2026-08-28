/**
 * JOURNEY 1: a solo organiser, a FREE community event, no Stripe at all.
 *
 * UI only. If a stranger could not click it, this does not do it. The email
 * confirmation link is read out of the console mail transport the same way a
 * person reads it out of their inbox.
 *
 * END TO END means PUBLISHED. An earlier version of this journey stopped at a
 * disabled Publish button and reported no blockers, which is a pass that proves
 * nothing: the whole point of a free event is that it can go live without
 * Stripe. It now makes a cover through the platform's own "Make a cover" (Law 6:
 * render, never generate), publishes, and then checks the public event page
 * actually resolves for a signed-out stranger.
 *
 * Requires: a server on 3311 built from this tree, started with
 *   EMAIL_TRANSPORT=console  and Upstash configured (the auth limiters fail
 *   CLOSED without it, so every signup is refused).
 *
 * Usage: node scripts/journeys/j1.mjs
 */
import { chromium, BASE, makeJourney, note, attach, describe, linkFromInbox, finish } from './harness.mjs'

const j = makeJourney('j1-free-event', 'Journey 1: solo organiser, free event, no Stripe')
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const EMAIL = `jo.free.${stamp}@example.com`
const PASSWORD = `Str0ng-${stamp}-Pass!`
const TITLE = `Geelong Community Night ${stamp}`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
const page = await ctx.newPage()
await attach(j, page)

// Every API call the wizard makes, with its status. The publish step reported
// no 5xx and created no row, which means the answer is in a status the default
// listener does not record.
const api = []
page.on('response', (r) => {
  const u = r.url()
  if (u.includes('/api/')) api.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`)
})
page.on('console', (m) => {
  if (m.type() === 'error') j.errors.push(`console ${m.text().slice(0, 140)}`)
})

/**
 * Fill if it is there and fillable. Tolerant on purpose: a field can legitimately
 * stop being an input (Price disappears once a tier is Free), and a journey that
 * throws on that reports a crash where the product behaved correctly.
 */
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

try {
  // ── 1. sign up and confirm ────────────────────────────────────────────────
  await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle', timeout: 60000 })
  await fill('input#fullName', 'Jo Halloran')
  await fill('input[type="email"]', EMAIL)
  await fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(7000)
  const landed = new URL(page.url()).pathname
  note(j, 'Signed up', `${EMAIL} -> ${landed}`)
  if (!landed.startsWith('/verify-email-sent')) {
    const alerts = await page.locator('[role=alert]').allInnerTexts()
    j.blockers.push(`signup did not reach verify-email-sent: ${landed} :: ${alerts.join(' // ').slice(0, 200)}`)
    throw new Error('signup refused')
  }
  const link = linkFromInbox(EMAIL)
  if (!link) {
    j.blockers.push('no confirmation email reached the inbox')
    throw new Error('no confirmation link')
  }
  await page.goto(link, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(3500)
  await describe(j, page, 'Confirmed, signed in')

  // ── 2. organisation ───────────────────────────────────────────────────────
  await page.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await fill('input#name, input[name="name"]', `Halloran Community ${stamp}`)
  await fill('textarea#description, textarea[name="description"]', 'Community nights in Geelong.')
  await describe(j, page, 'Organisation step')
  await clickText('Continue to event details')
  await page.waitForTimeout(6000)

  // ── 3. event basics ───────────────────────────────────────────────────────
  await fill('input[placeholder^="e.g. Summer Music Festival"]', TITLE)
  await fill('input[placeholder^="A brief one-line"]', 'A free community night, everyone welcome.')
  await fill('textarea[placeholder^="Describe your event in detail"]', 'A free community night in Geelong. Bring a friend.')
  const sel = await page.$('select')
  if (sel) {
    const opts = await page.evaluate(() =>
      [...document.querySelector('select').options].map((o) => ({ v: o.value, t: o.textContent.trim() })),
    )
    const arts = opts.find((o) => /arts/i.test(o.t)) ?? opts.find((o) => o.v)
    if (arts) await page.selectOption('select', arts.v)
    note(j, 'Category options offered', `${opts.length} options; chose ${JSON.stringify(arts?.t)}`)
  }
  await clickText('Continue')
  await page.waitForTimeout(4000)

  // ── 4. walk the wizard, making a cover when the media step appears ────────
  let madeCover = false
  for (let i = 0; i < 9; i += 1) {
    const fingerprint = () =>
      page.evaluate(() => {
        const ok = (el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        }
        const f = [...document.querySelectorAll('input,select,textarea')]
          .filter(ok)
          .map((x) => `${x.type}:${x.getAttribute('placeholder') || ''}`)
        const b = [...document.querySelectorAll('button')].filter(ok).map((x) => x.textContent.trim().slice(0, 20))
        return f.join('|') + '##' + b.join('|')
      })
    const before = await fingerprint()

    /*
     * Do NOT fill dates on the ticketing step. Sale Starts and Sale Ends default
     * to empty and are optional, and blanket-filling them set a sale window that
     * ran to the event's own end time. The wizard then refused to advance and
     * said nothing at all, which read as a dead Continue button for four runs.
     * A real organiser leaves them alone.
     */
    const onTicketingStep = Boolean(await page.$('button:has-text("Add Ticket Tier")'))
    const dateEls = onTicketingStep ? [] : await page.$$('input[type="date"], input[type="datetime-local"]')
    for (let d = 0; d < dateEls.length; d += 1) {
      const when = new Date(Date.now() + 21 * 864e5 + d * 3 * 36e5)
      const type = await page.evaluate((e) => e.type, dateEls[d])
      const v = type === 'date' ? when.toISOString().slice(0, 10) : when.toISOString().slice(0, 16)
      await dateEls[d].fill(v).catch(() => {})
    }
    for (const ph of ['Venue', 'venue', 'Address', 'address', 'Location', 'location']) {
      const el = await page.$(`input[placeholder*="${ph}"]`)
      if (el) {
        await el.fill('The Wool Exchange, Geelong')
        break
      }
    }

    // THE COVER. The platform composes one from the event's own details; it
    // never generates imagery (Law 6). This is the step that decides whether a
    // free event can go live at all.
    if (!madeCover && (await page.$('button:has-text("Make a cover")'))) {
      await clickText('Make a cover')
      /*
       * WAIT FOR THE RESULT, not for a guessed number of seconds. A fixed 9s
       * wait passed once and failed the next run on the same build, which would
       * have been reported as an intermittent product defect when it was an
       * impatient harness. A person waits until something appears.
       */
      const started = Date.now()
      let shot = { count: 0 }
      while (Date.now() - started < 45000) {
        shot = await page.evaluate(() => {
          const imgs = [...document.querySelectorAll('img')].filter((im) => {
            const r = im.getBoundingClientRect()
            return r.width > 120 && r.height > 80 && im.complete && im.naturalWidth > 0
          })
          return { count: imgs.length, accept: Boolean(document.querySelector('button')) }
        })
        if (shot.count > 0) break
        await page.waitForTimeout(1500)
      }
      madeCover = shot.count > 0
      const coverCalls = api.slice(-6)
      const coverShown = await page.evaluate(() =>
        [...document.querySelectorAll('[role=alert],.text-red-600,.text-error,.text-amber-800,.text-amber-900,[data-error]')]
          .filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => e.textContent.trim().slice(0, 160))
          .filter(Boolean),
      )
      note(
        j,
        'Made a cover through the platform',
        `images on the step: ${shot.count} after ${Math.round((Date.now() - started) / 1000)}s
      requests: ${coverCalls.length ? coverCalls.join(' , ') : '(none seen)'}
      shown to the person: ${coverShown.length ? coverShown.join(' // ') : 'NOTHING AT ALL'}`,
      )
      if (!madeCover) {
        j.blockers.push(
          `Make a cover produced no image within 45s. requests: ${coverCalls.join(' , ') || '(none)'}; ` +
            `shown: ${coverShown.join(' // ') || 'NOTHING AT ALL'}`,
        )
      }
      await describe(j, page, 'After making a cover')
      // The composer offers the cover for approval; it is not applied until the
      // organiser accepts it. Skipping this is how the earlier run reached the
      // review step with no cover and no Publish button.
      if (await page.$('button:has-text("Use this cover")')) {
        await clickText('Use this cover')
        await page.waitForTimeout(6000)
        note(j, 'Accepted the cover', 'clicked Use this cover')
      }
    }

    // THE TICKETING STEP. A free event still needs one tier, named, of type
    // Free. Continue does not advance without it.
    if (await page.$('button:has-text("Add Ticket Tier")')) {
      await fill('#tier-name-0, input[placeholder^="e.g. General Admission"]', 'General admission')
      const typeSel = await page.$('select#type-21, select')
      if (typeSel) {
        const hasFree = await page.evaluate(
          (s) => [...s.options].some((o) => o.value === 'free'),
          typeSel,
        )
        if (hasFree) await typeSel.selectOption('free')
        note(j, 'Set the ticket type', hasFree ? 'Free' : 'no Free option offered')
        if (!hasFree) j.blockers.push('the ticketing step offers no Free ticket type')
      }
      // By id, not "the first number input": that filled PRICE with 100 and
      // left Total Capacity empty, on a FREE ticket. Price is not an input at
      // all once the tier is Free, which is correct and is why this tolerates
      // the miss rather than throwing.
      await fill('#tier-price-0', '0').catch(() => {})
      await fill('#tier-capacity-0', '100').catch(() => {})
      await page.waitForTimeout(1200)
    }

    const moved = (await clickText('Continue')) || (await clickText('Next')) || (await clickText('Save and continue'))
    await page.waitForTimeout(4000)
    const after = await fingerprint()
    const v = await describe(j, page, `Wizard step ${i + 3}`)
    if (v.errs.length) j.blockers.push(`step ${i + 3}: ${v.errs.join(' // ')}`)
    if (!moved || before === after) {
      /*
       * WHY it stopped, in the person's terms and the browser's. The gap
       * between the two is the finding: a step that refuses and says nothing
       * is indistinguishable from a dead button.
       */
      const why = await page.evaluate(() => {
        const invalid = []
        for (const f of document.querySelectorAll('input,select,textarea')) {
          if (f.getBoundingClientRect().width === 0) continue
          if (!f.checkValidity()) {
            const lbl = f.labels?.[0]?.textContent?.trim() || f.getAttribute('placeholder') || f.type
            invalid.push(`${lbl}: ${f.validationMessage}`)
          }
        }
        const shown = [...document.querySelectorAll('[role=alert],.text-red-600,.text-error,.text-amber-800,.text-amber-900,[data-error]')]
          .filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => e.textContent.trim().slice(0, 120))
          .filter(Boolean)
        const fields = [...document.querySelectorAll('input,select,textarea')]
          .filter((f) => f.getBoundingClientRect().width > 0)
          .map((f) => `${f.type}|req=${f.required}|value=${String(f.value).slice(0, 20)}`)
        const invalidMarked = [...document.querySelectorAll('[aria-invalid="true"]')].map(
          (e) => e.id || e.getAttribute('name') || e.tagName,
        )
        // The whole step in the person's words. If the refusal is written
        // anywhere at all, it is in here.
        const main = document.querySelector('main') || document.body
        const text = (main.innerText || '').replace(/\s+/g, ' ').slice(0, 1000)
        return { invalid, shown, fields, invalidMarked, text }
      })
      note(
        j,
        'The wizard stopped advancing here',
        `${moved ? 'Continue was clicked and nothing changed' : 'no Continue button found'}
      browser says invalid: ${why.invalid.length ? why.invalid.join(' // ') : '(nothing)'}
      shown to the person : ${why.shown.length ? why.shown.join(' // ') : 'NOTHING AT ALL'}
      aria-invalid marked : ${why.invalidMarked.length ? why.invalidMarked.join(' , ') : '(none)'}
      fields on this step : ${why.fields.join(' , ')}
      the step, in words  : ${why.text}`,
      )
      if (why.invalid.length && !why.shown.length) {
        j.blockers.push(
          `wizard: Continue does nothing and shows NO message while the browser knows: ${why.invalid.join(' // ')}`,
        )
      }
      break
    }
  }

  // ── 5. publish ────────────────────────────────────────────────────────────
  const pub = await page.$('button:has-text("Publish and get your launch kit")')
  if (!pub) {
    j.blockers.push('no Publish button on the review step')
  } else {
    const state = await page.evaluate((b) => ({ disabled: b.disabled }), pub)
    note(j, 'The Publish button', `disabled=${state.disabled}  cover made=${madeCover}`)
    if (state.disabled) {
      const why = await page.evaluate(() =>
        document.body.innerText
          .split('\n')
          .filter((l) => /cover|image|photo|required|missing/i.test(l))
          .slice(0, 4),
      )
      note(j, 'Why Publish is disabled', why.length ? why.join(' // ') : 'NOTHING ON SCREEN EXPLAINS IT')
      j.blockers.push(
        why.length
          ? `Publish still disabled after making a cover: ${why.join(' // ')}`
          : 'Publish disabled with no on-screen reason',
      )
    } else {
      const apiBefore = api.length
      await pub.click()
      await page.waitForTimeout(12000)
      const after = await describe(j, page, 'After Publish')
      if (after.errs.length) j.blockers.push(`publish: ${after.errs.join(' // ')}`)
      await page.screenshot({ path: `${j.OUT}/after-publish.png`, fullPage: true })
      const calls = api.slice(apiBefore)
      const shown = await page.evaluate(() =>
        [...document.querySelectorAll('[role=alert],.text-red-600,.text-error,.text-amber-800,.text-amber-900,[data-error]')]
          .filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => e.textContent.trim().slice(0, 160))
          .filter(Boolean),
      )
      note(
        j,
        'What Publish actually did',
        `landed on ${page.url().replace(BASE, '')}
      API calls it made: ${calls.length ? calls.join(' , ') : 'NONE AT ALL'}
      shown to the person: ${shown.length ? shown.join(' // ') : 'NOTHING AT ALL'}`,
      )
      /*
       * Judge the OUTCOME, not the traffic. Publish is a Server Action, which
       * posts to the page URL rather than to /api/, so "made no API call" is
       * true and means nothing. An earlier version of this journey reported a
       * blocker on a publish that had plainly worked.
       */
      const live = /\/launch-kit/.test(page.url())
      if (!live) {
        j.blockers.push(
          `Publish did not reach the launch kit. Landed on ${page.url().replace(BASE, '')}, ` +
            `shown: ${shown.length ? shown.join(' // ') : 'NOTHING AT ALL'}`,
        )
      } else {
        note(j, 'The event is live', page.url().replace(BASE, ''))
      }

      // ── 6. can a STRANGER see it? signed out, fresh context ──────────────
      const anon = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
      const ap = await anon.newPage()
      const search = await ap.goto(`${BASE}/events?q=${encodeURIComponent(TITLE)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      })
      await ap.waitForTimeout(3000)
      const found = await ap.evaluate(
        (t) => [...document.querySelectorAll('a')].some((a) => (a.innerText || '').includes(t)),
        TITLE,
      )
      note(j, 'A signed-out stranger searches for the event', `HTTP ${search?.status()}  found on /events: ${found}`)
      if (!found) j.blockers.push('the published event is not findable by a signed-out stranger on /events')
      await ap.screenshot({ path: `${j.OUT}/stranger-sees-the-event.png`, fullPage: false })
      await anon.close()
    }
  }
} catch (err) {
  note(j, 'THREW', String(err).slice(0, 200))
  j.blockers.push(`threw: ${String(err).slice(0, 140)}`)
} finally {
  await finish(j)
  console.log(`identity: ${EMAIL} / ${PASSWORD}`)
  console.log(`event title: ${TITLE}`)
  await browser.close()
}
