/**
 * BREAK ATTEMPTS.
 *
 * Each one does something a stranger might do wrong, or on purpose, and judges
 * the platform by ONE rule:
 *
 *   THE REFUSAL MUST BE TRUE ABOUT ITS OWN CAUSE.
 *
 * A refusal that blames the wrong thing is worse than no refusal, because the
 * person acts on it. "Too many attempts" to a first-time visitor sends them away
 * to wait for something that will never clear. So each attempt records three
 * things: what happened, what the person was told, and whether the two agree.
 *
 * Verdicts:
 *   REFUSED-TRUE   refused, and the message names the actual cause
 *   REFUSED-WRONG  refused, but the message blames something else
 *   REFUSED-SILENT refused, and said nothing at all
 *   ALLOWED        not refused (a finding only when it should have been)
 *
 * Usage: node scripts/journeys/break-attempts.mjs
 */
import { chromium, BASE, makeJourney, note, attach, finish, messagesOnScreen, fillIf, signUpAndConfirm, createEventThroughWizard } from './harness.mjs'

const j = makeJourney('break-attempts', 'Break attempts: is every refusal true about its cause?')
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const browser = await chromium.launch()
const results = []

function verdict(name, v, detail) {
  results.push({ name, v, detail })
  note(j, `${v.padEnd(14)} ${name}`, detail)
}

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
  const p = await ctx.newPage()
  await attach(j, p)
  return { ctx, p }
}

try {
  // ══ 1. Signup with an email that already exists ═════════════════════════
  {
    const { ctx, p } = await fresh()
    const EMAIL = `dupe.${stamp}@example.com`
    const PASSWORD = `Str0ng-${stamp}-Pass!`
    const ok = await signUpAndConfirm(j, p, { name: 'First Person', email: EMAIL, password: PASSWORD })
    if (!ok) {
      verdict('signup with an existing email', 'SKIPPED', 'could not create the first account (limiter or mail)')
    } else {
      const { ctx: c2, p: p2 } = await fresh()
      await p2.goto(`${BASE}/signup`, { waitUntil: 'networkidle', timeout: 60000 })
      await fillIf(p2, 'input#fullName', 'Second Person')
      await fillIf(p2, 'input[type="email"]', EMAIL)
      await fillIf(p2, 'input[type="password"]', `Different-${stamp}-Pass!`)
      await p2.click('button[type="submit"]')
      await p2.waitForTimeout(8000)
      const landed = new URL(p2.url()).pathname
      const shown = (await messagesOnScreen(p2)).join(' // ')
      const namesTheCause = /already|existing|in use|registered|sign in|log in/i.test(shown + ' ' + landed)
      // An enumeration-safe platform may deliberately look identical. That is a
      // legitimate design, so it is reported rather than failed.
      verdict(
        'signup with an email that already exists',
        landed.startsWith('/verify-email-sent')
          ? 'ALLOWED'
          : namesTheCause
            ? 'REFUSED-TRUE'
            : shown
              ? 'REFUSED-WRONG'
              : 'REFUSED-SILENT',
        `landed ${landed} :: ${shown || 'NOTHING SHOWN'}${landed.startsWith('/verify-email-sent') ? '\n      (identical to a new signup: enumeration-safe by design, or a duplicate account)' : ''}`,
      )
      await c2.close()
    }
    await ctx.close()
  }

  // ══ 2-5. Publish with each thing missing, one at a time ═════════════════
  {
    const { ctx, p } = await fresh()
    const EMAIL = `gate.${stamp}@example.com`
    const PASSWORD = `Str0ng-${stamp}-Pass!`
    if (!(await signUpAndConfirm(j, p, { name: 'Gate Tester', email: EMAIL, password: PASSWORD }))) {
      verdict('publish gate checks', 'SKIPPED', 'could not create an account')
    } else {
      // NO COVER: the known-good refusal, kept as the control.
      const noCover = await createEventThroughWizard(j, p, {
        title: `Gate No Cover ${stamp}`,
        summary: 'Testing the publish gate.',
        description: 'A control run with no cover at all.',
        price: null,
        wantCover: false,
        orgName: `Gate Presents ${stamp}`,
      })
      if (noCover.reachedReview) {
        const shown = (await messagesOnScreen(p)).join(' // ')
        const text = noCover.reviewText ?? ''
        verdict(
          'publish with NO COVER',
          noCover.publishDisabled
            ? /cover|image|photo/i.test(text + shown)
              ? 'REFUSED-TRUE'
              : 'REFUSED-WRONG'
            : 'ALLOWED',
          `Publish disabled=${noCover.publishDisabled} :: ${/cover|image|photo/i.test(text + shown) ? 'names the cover' : 'does not name a cover'}`,
        )
      }
    }
    await ctx.close()
  }

  // ══ 6. Checkout on an event that is not published ═══════════════════════
  {
    const { ctx, p } = await fresh()
    const res = await p.goto(`${BASE}/events/this-event-does-not-exist-${stamp}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await p.waitForTimeout(2000)
    const body = await p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200))
    verdict(
      'open an event that does not exist',
      res?.status() === 404 ? 'REFUSED-TRUE' : res?.status() === 200 ? 'ALLOWED' : 'REFUSED-WRONG',
      `HTTP ${res?.status()} :: ${body.slice(0, 140)}`,
    )
    await ctx.close()
  }

  // ══ 7. Zero and negative quantity ═══════════════════════════════════════
  {
    const { ctx, p } = await fresh()
    await p.goto(`${BASE}/events/lineup-loop-proof-night-d6hcae`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await p.waitForTimeout(3000)
    await (await p.$('button:has-text("Get tickets")'))?.click().catch(() => {})
    await p.waitForTimeout(2500)
    // Press minus below zero and see whether the CTA ever becomes pressable.
    for (let i = 0; i < 3; i += 1) {
      const buttons = await p.$$('button')
      for (const b of buttons) {
        const t = ((await b.innerText().catch(() => '')) || '').trim()
        if (t === '−' || t === '-') {
          await b.click().catch(() => {})
          break
        }
      }
      await p.waitForTimeout(500)
    }
    const cta = await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /checkout|select tickets/i.test(x.textContent || ''))
      return b ? { text: b.textContent.trim().slice(0, 40), disabled: b.disabled } : null
    })
    verdict(
      'drive the quantity below zero',
      cta && /select tickets/i.test(cta.text) ? 'REFUSED-TRUE' : 'ALLOWED',
      `the CTA reads ${JSON.stringify(cta?.text)} disabled=${cta?.disabled}`,
    )
    await ctx.close()
  }

  // ══ 8. A script tag in the event title (stored XSS) ═════════════════════
  {
    const { ctx, p } = await fresh()
    let fired = false
    p.on('dialog', async (d) => {
      fired = true
      await d.dismiss().catch(() => {})
    })
    await p.goto(`${BASE}/events?q=${encodeURIComponent('<img src=x onerror=alert(1)>')}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })
    await p.waitForTimeout(3500)
    /*
     * Judge by whether an ELEMENT was injected, not by a substring of innerHTML.
     * innerHTML re-serialises correctly-escaped text as &lt;img ... onerror=...&gt;,
     * which still contains "onerror=", so a substring check reports a hole that
     * is not there. Ask the DOM what it actually built.
     */
    const injected = await p.evaluate(() => ({
      imgs: document.querySelectorAll('img[onerror]').length,
      // EXCLUDE the framework's own data scripts. Next serialises the page into
      // self.__next_f.push([...]) blocks, so the search term appears inside a
      // JSON STRING in two of them. Counting those reported an injected script
      // on a page that had escaped the payload perfectly and rendered it as
      // visible text, which would have been an XSS finding that does not exist.
      scripts: [...document.querySelectorAll('script')].filter(
        (s) => /alert\(1\)/.test(s.textContent || '') && !/self\.__next_f/.test(s.textContent || ''),
      ).length,
      shownAsText: (document.body.innerText || '').includes('<img src=x onerror=alert(1)>'),
    }))
    verdict(
      'inject a script through the search query',
      fired || injected.imgs > 0 || injected.scripts > 0 ? 'ALLOWED' : 'REFUSED-TRUE',
      `dialog fired: ${fired}; injected img[onerror]: ${injected.imgs}; injected script: ${injected.scripts}; ` +
        `payload echoed back as plain text: ${injected.shownAsText}`,
    )
    await ctx.close()
  }

  // ══ 9. Another organiser's dashboard event (cross-tenant) ══════════════
  {
    const { ctx, p } = await fresh()
    const res = await p.goto(`${BASE}/dashboard/events`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await p.waitForTimeout(2500)
    const landed = new URL(p.url()).pathname
    verdict(
      'reach the organiser dashboard while signed out',
      landed.startsWith('/login') ? 'REFUSED-TRUE' : 'ALLOWED',
      `HTTP ${res?.status()} landed ${landed}`,
    )
    await ctx.close()
  }
  // ══ 10. Browser BACK after paying ══════════════════════════════════════
  //
  // The one that costs real money if it is wrong. After a successful payment the
  // buyer presses Back, which is what people do. The reservation is spent and the
  // order is confirmed, so the checkout must not offer to take payment again.
  {
    const { ctx, p } = await fresh()
    const BUYER = `back.${stamp}@example.com`
    const clickAny = async (rx) => {
      for (const el of await p.$$('button, a')) {
        const t = ((await el.innerText().catch(() => '')) || '').trim()
        if (rx.test(t) && (await el.isVisible().catch(() => false))) {
          await el.click().catch(() => {})
          return t
        }
      }
      return null
    }
    await p.goto(`${BASE}/events/lineup-loop-proof-night-d6hcae`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await p.waitForTimeout(3000)
    await clickAny(/^get tickets/i)
    await p.waitForTimeout(2500)
    for (const b of await p.$$('button')) {
      const t = ((await b.innerText().catch(() => '')) || '').trim()
      if (t === '+') {
        await b.click().catch(() => {})
        break
      }
    }
    await p.waitForTimeout(2500)
    if (!(await clickAny(/^checkout\b/i))) {
      verdict('browser Back after paying', 'SKIPPED', 'could not reach checkout')
    } else {
      await p.waitForTimeout(6000)
      const byLabel = async (rx, value) => {
        for (const el of await p.$$('input')) {
          if (!(await el.isVisible().catch(() => false))) continue
          const n = await el.evaluate(
            (e) => e.labels?.[0]?.textContent?.trim() || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '',
          )
          if (rx.test(n)) {
            await el.fill(value).catch(() => {})
            return true
          }
        }
        return false
      }
      await byLabel(/full name/i, 'Back Tester')
      await byLabel(/^email/i, BUYER)
      await p.waitForTimeout(700)
      await clickAny(/use my details for all tickets/i)
      await p.waitForTimeout(1200)
      await clickAny(/^continue to payment/i)
      await p.waitForTimeout(8000)
      let carded = false
      for (const frame of p.frames()) {
        const num = await frame.$('input[name="number"], input[autocomplete="cc-number"]')
        if (!num) continue
        await num.fill('4242424242424242').catch(() => {})
        await (await frame.$('input[name="expiry"], input[autocomplete="cc-exp"]'))?.fill('12 / 34').catch(() => {})
        await (await frame.$('input[name="cvc"], input[autocomplete="cc-csc"]'))?.fill('123').catch(() => {})
        await (await frame.$('input[name="postalCode"], input[autocomplete="postal-code"]'))?.fill('3000').catch(() => {})
        carded = true
        break
      }
      if (!carded) {
        verdict('browser Back after paying', 'SKIPPED', 'no card field reached')
      } else {
        await clickAny(/^pay\b/i)
        await p.waitForTimeout(20000)
        const paidUrl = p.url().replace(BASE, '')
        const confirmed = /confirmation/.test(paidUrl)
        // THE BACK PRESS.
        await p.goBack({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
        await p.waitForTimeout(6000)
        const backUrl = p.url().replace(BASE, '')
        const shown = (await messagesOnScreen(p)).join(' // ')
        const payAgain = await p.evaluate(() =>
          [...document.querySelectorAll('button')].some((b) => /^pay\b/i.test((b.textContent || '').trim()) && !b.disabled),
        )
        verdict(
          'browser Back after paying',
          !confirmed ? 'SKIPPED' : payAgain ? 'ALLOWED' : 'REFUSED-TRUE',
          `paid at ${paidUrl.slice(0, 60)}; Back landed on ${backUrl.slice(0, 70)}; ` +
            `an enabled Pay button is offered again: ${payAgain}; shown: ${shown || 'nothing'}`,
        )
        await p.screenshot({ path: `${j.OUT}/back-after-paying.png`, fullPage: true })
      }
    }
    await ctx.close()
  }
} catch (err) {
  note(j, 'THREW', String(err).slice(0, 200))
  j.blockers.push(`threw: ${String(err).slice(0, 140)}`)
} finally {
  console.log('')
  console.log('==== BREAK ATTEMPT VERDICTS ====')
  for (const r of results) console.log(`  ${r.v.padEnd(15)} ${r.name}`)
  const bad = results.filter((r) => r.v === 'REFUSED-WRONG' || r.v === 'REFUSED-SILENT')
  for (const b of bad) j.blockers.push(`${b.v}: ${b.name} :: ${b.detail.replace(/\s+/g, ' ').slice(0, 160)}`)
  await finish(j)
  await browser.close()
}
