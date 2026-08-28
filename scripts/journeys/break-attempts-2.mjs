/**
 * BREAK ATTEMPTS, second set: the publish gate and the tenancy boundary.
 *
 * Same single rule as the first set: THE REFUSAL MUST BE TRUE ABOUT ITS OWN
 * CAUSE. A gate that refuses for the right reason and names a different one is
 * worse than no gate, because the organiser goes and fixes the wrong thing.
 *
 * The publish trio (past date, no venue, no price) is driven through the real
 * wizard rather than the gate function, because the question is not "does the
 * server refuse" but "does the person find out, on the screen they are on".
 *
 * Usage: node scripts/journeys/break-attempts-2.mjs
 */
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  finish,
  messagesOnScreen,
  fillIf,
  clickText,
  signUpAndConfirm,
} from './harness.mjs'

const j = makeJourney('break-attempts-2', 'Break attempts 2: the publish gate and tenancy')
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const browser = await chromium.launch()
const results = []

function verdict(name, v, detail) {
  results.push({ name, v, detail })
  note(j, `${v.padEnd(15)} ${name}`, detail)
}

async function fresh(state) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-AU',
    ...(state ? { storageState: state } : {}),
  })
  const p = await ctx.newPage()
  await attach(j, p)
  return { ctx, p }
}

/** Walk to the review step, leaving ONE thing deliberately wrong. */
async function wizardOmitting(p, omit, title) {
  await p.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'networkidle', timeout: 60000 })
  await p.waitForTimeout(2500)
  if (await p.$('button:has-text("Continue to event details")')) {
    await fillIf(p, 'input#name, input[name="name"]', `Gate ${omit} Presents ${stamp}`)
    await fillIf(p, 'textarea#description, textarea[name="description"]', 'Events for our community.')
    await clickText(p, 'Continue to event details')
    await p.waitForTimeout(6000)
  }
  await fillIf(p, 'input[placeholder^="e.g. Summer Music Festival"]', title)
  await fillIf(p, 'input[placeholder^="A brief one-line"]', 'Testing one publish requirement.')
  await fillIf(p, 'textarea[placeholder^="Describe your event in detail"]', 'A deliberately incomplete event.')
  const sel = await p.$('select')
  if (sel) {
    const v = await p.evaluate(() => {
      const s = document.querySelector('select')
      return ([...s.options].find(o => /arts/i.test(o.textContent)) ?? [...s.options].find(o => o.value))?.value ?? null
    })
    if (v) await p.selectOption('select', v)
  }
  await clickText(p, 'Continue')
  await p.waitForTimeout(4000)

  for (let i = 0; i < 9; i += 1) {
    const onTicketing = Boolean(await p.$('button:has-text("Add Ticket Tier")'))
    if (!onTicketing) {
      const dates = await p.$$('input[type="date"], input[type="datetime-local"]')
      for (let d = 0; d < dates.length; d += 1) {
        // THE PAST DATE ATTEMPT: an event that already happened.
        const when =
          omit === 'date'
            ? new Date(Date.now() - 30 * 864e5 + d * 3 * 36e5)
            : new Date(Date.now() + 21 * 864e5 + d * 3 * 36e5)
        const type = await p.evaluate(e => e.type, dates[d])
        await dates[d]
          .fill(type === 'date' ? when.toISOString().slice(0, 10) : when.toISOString().slice(0, 16))
          .catch(() => {})
      }
      if (omit !== 'venue') {
        await fillIf(p, 'input[placeholder*="Venue"], input[placeholder*="Address"]', 'The Wool Exchange, Geelong')
      }
    }
    if (await p.$('input[type="file"]')) {
      const input = await p.$('input[type="file"]')
      await input.setInputFiles('public/images/hero/afrobeats.jpg')
      const started = Date.now()
      while (Date.now() - started < 45000) {
        const ok = await p.evaluate(() =>
          [...document.querySelectorAll('img')].some(im => {
            const r = im.getBoundingClientRect()
            return r.width > 120 && r.height > 80 && im.complete && im.naturalWidth > 0
          }),
        )
        if (ok) break
        await p.waitForTimeout(1500)
      }
      // The wizard blocks Continue while the upload is in flight and says so.
      // Waiting for that message to clear is the difference between testing the
      // publish gate and testing my own impatience.
      const uploadDone = Date.now()
      while (Date.now() - uploadDone < 30000) {
        const busy = (await messagesOnScreen(p)).some(t => /still uploading/i.test(t))
        if (!busy) break
        await p.waitForTimeout(1500)
      }
    }
    if (await p.$('button:has-text("Add Ticket Tier")')) {
      await fillIf(p, '#tier-name-0, input[placeholder^="e.g. General Admission"]', 'General admission')
      if (omit !== 'price') {
        const typeSel = await p.$('#type-21, select')
        if (typeSel) await typeSel.selectOption('free').catch(() => {})
      }
      await fillIf(p, '#tier-capacity-0', '100')
      await p.waitForTimeout(1000)
    }
    if (await p.$('button:has-text("Publish and get your launch kit")')) break
    const before = await p.evaluate(() => (document.querySelector('main')?.innerText || '').slice(0, 400))
    if (!(await clickText(p, 'Continue'))) break
    await p.waitForTimeout(3500)
    const after = await p.evaluate(() => (document.querySelector('main')?.innerText || '').slice(0, 400))
    if (before === after) {
      // Refused mid-wizard. That is a legitimate place to refuse, so report what
      // it said rather than treating it as reaching Review.
      return { stoppedAt: 'wizard', shown: await messagesOnScreen(p) }
    }
  }
  const pub = await p.$('button:has-text("Publish and get your launch kit")')
  if (!pub) return { stoppedAt: 'no-review', shown: await messagesOnScreen(p) }
  const disabled = await p.evaluate(b => b.disabled, pub)
  if (!disabled) {
    await pub.click()
    await p.waitForTimeout(12000)
  }
  return {
    stoppedAt: 'review',
    disabled,
    url: p.url().replace(BASE, ''),
    shown: await messagesOnScreen(p),
    text: await p.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 600)),
  }
}

try {
  // ── The publish trio ─────────────────────────────────────────────────────
  const CASES = [
    ['publish with a PAST date', 'date', /past|already|future|before|date/i],
    ['publish with NO venue', 'venue', /venue|address|location|where/i],
    ['publish with NO price set', 'price', /price|free|ticket|amount/i],
  ]
  /*
   * ONE account for all three cases. Signup is limited to 5 per 10 minutes per
   * IP, so three signups plus anything else running spends the whole budget and
   * the later cases report SKIPPED for a reason that has nothing to do with the
   * publish gate. The organisation step only appears on the first pass.
   */
  const { ctx: gateCtx, p: gateP } = await fresh()
  const gateOk = await signUpAndConfirm(j, gateP, {
    name: 'Gate Tester',
    email: `gate.${stamp}@example.com`,
    password: `Str0ng-${stamp}-Pass!`,
  })
  for (const [name, omit, wants] of CASES) {
    const p = gateP
    if (!gateOk) {
      verdict(name, 'SKIPPED', 'could not create an account (signup limiter is 5 per 10 minutes per IP)')
      continue
    }
    const r = await wizardOmitting(p, omit, `Gate ${omit} ${stamp}`)
    const said = (r.shown ?? []).join(' // ')
    const all = `${said} ${r.text ?? ''}`
    const published = /\/launch-kit/.test(r.url ?? '')
    verdict(
      name,
      published
        ? 'ALLOWED'
        : wants.test(all)
          ? 'REFUSED-TRUE'
          : said || r.stoppedAt === 'wizard'
            ? 'REFUSED-WRONG'
            : 'REFUSED-SILENT',
      `stopped at ${r.stoppedAt}${r.disabled !== undefined ? ` (publish disabled=${r.disabled})` : ''}; ` +
        `said: ${said || 'NOTHING'}`,
    )
    await p.screenshot({ path: `${j.OUT}/gate-${omit}.png`, fullPage: true }).catch(() => {})
  }
  await gateCtx.close()

  // ── Checkout on an event that is not published ───────────────────────────
  {
    const { ctx, p } = await fresh()
    const res = await p.goto(`${BASE}/checkout/00000000-0000-4000-8000-000000000000`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await p.waitForTimeout(2500)
    const shown = (await messagesOnScreen(p)).join(' // ')
    const body = await p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160))
    verdict(
      'checkout on a reservation that does not exist',
      res?.status() === 404 || /not found|no longer|expired|choose your tickets/i.test(shown + body)
        ? 'REFUSED-TRUE'
        : 'ALLOWED',
      `HTTP ${res?.status()} :: ${(shown || body).slice(0, 140)}`,
    )
    await ctx.close()
  }

  // ── Cross-tenant: another organiser's event in the dashboard ─────────────
  {
    const { ctx, p } = await fresh('.auth/organiser.json')
    // An event id belonging to a DIFFERENT organisation than the signed-in one.
    const foreign = process.env.FOREIGN_EVENT_ID
    if (!foreign) {
      verdict('open another organisation event', 'SKIPPED', 'no FOREIGN_EVENT_ID supplied')
    } else {
      const res = await p.goto(`${BASE}/dashboard/events/${foreign}/edit`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      })
      await p.waitForTimeout(2500)
      const landed = new URL(p.url()).pathname
      const body = await p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160))
      /*
       * Judge by CONTENT. Next renders its not-found page with a 200 here, so a
       * status check called a correctly refused request "ALLOWED". What decides
       * tenancy is whether the other organisation's data is on the screen.
       */
      const leaked = await p.evaluate(() => {
        const main = document.querySelector('main')?.innerText || ''
        const notFound = /can.t find that page|404/i.test(main)
        const values = [...document.querySelectorAll('input')].map(i => i.value).filter(Boolean)
        return { notFound, values: values.slice(0, 5) }
      })
      const refused = leaked.notFound || res?.status() === 404 || res?.status() === 403
      verdict(
        'open another organisation event in the dashboard',
        refused ? 'REFUSED-TRUE' : 'ALLOWED',
        `HTTP ${res?.status()} landed ${landed}; not-found state: ${leaked.notFound}; ` +
          `form values exposed: ${JSON.stringify(leaked.values)}`,
      )
    }
    await ctx.close()
  }
} catch (err) {
  note(j, 'THREW', String(err).slice(0, 200))
  j.blockers.push(`threw: ${String(err).slice(0, 140)}`)
} finally {
  console.log('')
  console.log('==== BREAK ATTEMPT VERDICTS (set 2) ====')
  for (const r of results) console.log(`  ${r.v.padEnd(15)} ${r.name}`)
  for (const b of results.filter(r => r.v === 'REFUSED-WRONG' || r.v === 'REFUSED-SILENT' || r.v === 'ALLOWED')) {
    j.blockers.push(`${b.v}: ${b.name} :: ${b.detail.replace(/\s+/g, ' ').slice(0, 170)}`)
  }
  await finish(j)
  await browser.close()
}
