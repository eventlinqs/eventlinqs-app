/**
 * JOURNEY 5: a buyer passes their ticket to a friend.
 *
 * Driven TWICE on purpose, because the interesting question is not "does
 * transfer work" but "who can reach it".
 *
 *   A. as a GUEST, the way most people buy
 *   B. as a SIGNED-IN buyer, with an account made before checkout
 *
 * If A fails and B succeeds, transfer is not broken: it is unreachable for the
 * majority path, which is a different defect with a different fix, and reporting
 * the first without the second would be wrong.
 *
 * Usage: node scripts/journeys/j5.mjs [slug]
 */
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  describe,
  finish,
  messagesOnScreen,
  buyTicket,
  signUpAndConfirm,
} from './harness.mjs'

const SLUG = process.argv[2] ?? 'lineup-loop-proof-night-d6hcae'
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)

const j = makeJourney('j5-transfer', 'Journey 5: passing a ticket to a friend')
const browser = await chromium.launch()

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
  const p = await ctx.newPage()
  await attach(j, p)
  return { ctx, p }
}

/** Try to reach and use the transfer control. Returns what happened. */
async function tryTransfer(p, who) {
  const r = await p.goto(`${BASE}/tickets`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(3500)
  const landed = new URL(p.url()).pathname
  if (landed.startsWith('/login')) {
    return { who, reached: false, landed, shown: await messagesOnScreen(p), status: r?.status() }
  }
  const v = await describe(p === null ? null : j, p, `The tickets screen (${who})`)
  const control = v.buttons.concat(v.links).find(t => /transfer|send to|give/i.test(t))
  if (!control) {
    return { who, reached: true, landed, control: null, text: (await p.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 240))) }
  }
  for (const el of await p.$$('button, a')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (/transfer|send to|give/i.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      break
    }
  }
  await p.waitForTimeout(3000)
  const byPlaceholder = async (rx, val) => {
    for (const el of await p.$$('input')) {
      if (!(await el.isVisible().catch(() => false))) continue
      const ph = await el.evaluate(e => e.getAttribute('placeholder') || e.getAttribute('aria-label') || '')
      if (rx.test(ph)) {
        await el.fill(val).catch(() => {})
        return true
      }
    }
    return false
  }
  await byPlaceholder(/name/i, 'Alex Friend')
  await byPlaceholder(/email/i, `friend.${stamp}@example.com`)
  await p.waitForTimeout(800)
  for (const el of await p.$$('button')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (/^(transfer|send|confirm)/i.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      break
    }
  }
  await p.waitForTimeout(7000)
  return {
    who,
    reached: true,
    landed: new URL(p.url()).pathname,
    control,
    shown: await messagesOnScreen(p),
    text: await p.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 240)),
  }
}

try {
  // ── A. the guest ──────────────────────────────────────────────────────────
  {
    const { ctx, p } = await fresh()
    const email = `guest.transfer.${stamp}@example.com`
    const orderId = await buyTicket(j, p, SLUG, email, 'Guest Buyer')
    if (orderId) {
      const conf = await (async () => {
        await p.goto(`${BASE}/orders/${orderId}/confirmation`, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await p.waitForTimeout(3500)
        return describe(j, p, 'A guest looks at their order for a way to pass the ticket on')
      })()
      const onOrder = conf.buttons.concat(conf.links).find(t => /transfer|send to|give/i.test(t))
      note(j, 'A transfer control on the order itself', onOrder ?? 'NONE')
      const res = await tryTransfer(p, 'guest')
      note(
        j,
        'The guest tries /tickets',
        `landed ${res.landed}; reached the list: ${res.reached}; ${(res.shown ?? []).join(' // ') || res.text || ''}`.slice(0, 260),
      )
      if (!onOrder && !res.reached) {
        j.blockers.push(
          'a GUEST who bought a ticket has no way to pass it on: nothing on their order offers a transfer, ' +
            `and /tickets sends them to ${res.landed} for an account that guest checkout never created`,
        )
      }
    }
    await ctx.close()
  }

  // ── B. the signed-in buyer ────────────────────────────────────────────────
  {
    const { ctx, p } = await fresh()
    const email = `member.transfer.${stamp}@example.com`
    const ok = await signUpAndConfirm(j, p, { name: 'Member Buyer', email, password: `Str0ng-${stamp}-Pass!` })
    if (!ok) {
      note(j, 'Could not make an account for the signed-in half', 'the signup limiter is 5 per 10 minutes per IP')
    } else {
      const orderId = await buyTicket(j, p, SLUG, email, 'Member Buyer')
      note(j, 'The signed-in buyer has an order', orderId ?? 'none')
      const res = await tryTransfer(p, 'signed in')
      note(
        j,
        'The signed-in buyer tries to transfer',
        `landed ${res.landed}; control: ${res.control ?? 'NONE OFFERED'}; ` +
          `${(res.shown ?? []).join(' // ') || res.text || ''}`.slice(0, 300),
      )
      if (!res.reached) {
        j.blockers.push(`even a signed-in buyer cannot reach /tickets: landed ${res.landed}`)
      } else if (!res.control) {
        j.blockers.push('a signed-in buyer holding a ticket is offered no way to transfer it')
      } else {
        const done = /transferred|sent|on its way|new holder/i.test(`${(res.shown ?? []).join(' ')} ${res.text ?? ''}`)
        if (!done) {
          j.blockers.push(
            `the transfer was attempted and not confirmed: ${(res.shown ?? []).join(' // ') || 'NOTHING SHOWN'}`,
          )
        } else {
          note(j, 'The ticket moved', `${(res.shown ?? []).join(' // ')}`)
        }
      }
      await p.screenshot({ path: `${j.OUT}/signed-in-transfer.png`, fullPage: true }).catch(() => {})
    }
    await ctx.close()
  }
} catch (err) {
  note(j, 'THREW', String(err).slice(0, 200))
  j.blockers.push(`threw: ${String(err).slice(0, 140)}`)
} finally {
  await finish(j)
  await browser.close()
}
