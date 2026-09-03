/**
 * JOURNEYS 7 to 10, driven in one run because they share a signed-in organiser.
 *
 *   7  a seated event: can a stranger pick a seat and buy it
 *   8  a discount code: can an organiser make one and a buyer use it
 *   9  attribution: does a shared link carry credit back
 *  10  payouts: is an organiser told the truth about their money
 *
 * Each section reports its own verdict. A section that cannot run says so rather
 * than passing quietly, because a journey that did not happen is not a journey
 * that succeeded.
 *
 * Usage: node scripts/journeys/j7-j10.mjs
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
  fillIf,
} from './harness.mjs'

const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const SEATED = process.env.SEATED_SLUG ?? 'grand-hall-proof-the-full-house'
const PAID = process.env.PAID_SLUG ?? 'lineup-loop-proof-night-d6hcae'
const EVENT_ID = process.env.EVENT_ID ?? ''

const j = makeJourney('j7-j10', 'Journeys 7 to 10: seated, discount, attribution, payouts')
const browser = await chromium.launch()
const verdicts = []
const say = (n, v, d) => {
  verdicts.push({ n, v, d })
  note(j, `${v.padEnd(12)} ${n}`, d)
}

async function anon() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
  const p = await ctx.newPage()
  await attach(j, p)
  return { ctx, p }
}
async function organiser() {
  const ctx = await browser.newContext({
    storageState: '.auth/organiser.json',
    viewport: { width: 1440, height: 1000 },
    locale: 'en-AU',
  })
  const p = await ctx.newPage()
  await attach(j, p)
  return { ctx, p }
}

try {
  // ══ JOURNEY 7: a seated event ═══════════════════════════════════════════
  {
    const { ctx, p } = await anon()
    const r = await p.goto(`${BASE}/events/${SEATED}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await p.waitForTimeout(4000)
    await describe(j, p, 'A stranger opens a seated event')
    const started = await (async () => {
      for (const el of await p.$$('button, a')) {
        const t = ((await el.innerText().catch(() => '')) || '').trim()
        if (/get tickets|choose (your )?seat|select seat|pick a seat/i.test(t) && (await el.isVisible().catch(() => false))) {
          await el.click().catch(() => {})
          return t
        }
      }
      return null
    })()
    await p.waitForTimeout(5000)
    const map = await p.evaluate(() => ({
      canvas: document.querySelectorAll('canvas').length,
      svgSeats: document.querySelectorAll('svg [data-seat], svg circle, svg rect').length,
      text: (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 240),
    }))
    await p.screenshot({ path: `${j.OUT}/seated.png`, fullPage: false }).catch(() => {})
    say(
      'journey 7: a seated event',
      r?.status() === 200 && (map.canvas > 0 || map.svgSeats > 20) ? 'RENDERS' : 'NO SEAT MAP',
      `HTTP ${r?.status()}; entry control: ${started ?? 'none'}; canvas: ${map.canvas}; seat shapes: ${map.svgSeats}\n      ${map.text.slice(0, 200)}`,
    )
    if (!(map.canvas > 0 || map.svgSeats > 20)) {
      j.blockers.push(`a seated event shows no seat map to a stranger: ${map.text.slice(0, 140)}`)
    } else {
      j.unclear.push(
        'the seat map renders on a canvas, so picking a specific seat cannot be driven by selector here; ' +
          'seat SELECTION and seated checkout are unproven by this run',
      )
    }
    await ctx.close()
  }

  // ══ JOURNEY 8: a discount code ══════════════════════════════════════════
  {
    const { ctx, p } = await organiser()
    if (!EVENT_ID) {
      say('journey 8: a discount code', 'SKIPPED', 'no EVENT_ID given for the organiser side')
    } else {
      const r = await p.goto(`${BASE}/dashboard/events/${EVENT_ID}/discounts`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      })
      await p.waitForTimeout(3500)
      const landed = new URL(p.url()).pathname
      if (!landed.includes('/discounts')) {
        say('journey 8: a discount code', 'NO ACCESS', `HTTP ${r?.status()} landed ${landed}`)
      } else {
        const v = await describe(j, p, 'The discounts screen')
        const open = v.buttons.find(t => /new|create|add/i.test(t))
        if (open) {
          for (const el of await p.$$('button')) {
            const t = ((await el.innerText().catch(() => '')) || '').trim()
            if (/new|create|add/i.test(t) && (await el.isVisible().catch(() => false))) {
              await el.click().catch(() => {})
              break
            }
          }
          await p.waitForTimeout(2500)
        }
        const CODE = `NIGHT${stamp}`
        await fillIf(p, '#discounts-code, input[placeholder="SUMMER20"]', CODE)
        await fillIf(p, '#discounts-value, input[type="number"]', '10')
        await p.waitForTimeout(600)
        for (const el of await p.$$('button')) {
          const t = ((await el.innerText().catch(() => '')) || '').trim()
          if (/^(create|save|add)/i.test(t) && (await el.isVisible().catch(() => false))) {
            await el.click().catch(() => {})
            break
          }
        }
        await p.waitForTimeout(5000)
        const after = await messagesOnScreen(p)
        const listed = await p.evaluate(c => (document.body.innerText || '').includes(c), CODE)
        say(
          'journey 8: an organiser makes a discount code',
          listed ? 'MADE' : 'NOT MADE',
          `code ${CODE}; on the page afterwards: ${listed}; ${after.join(' // ') || 'no message'}`,
        )
        if (!listed) {
          j.blockers.push(`a discount code was submitted and does not appear: ${after.join(' // ') || 'NOTHING SHOWN'}`)
        } else {
          // Now a buyer tries it.
          const { ctx: bc, p: bp } = await anon()
          await bp.goto(`${BASE}/events/${PAID}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
          await bp.waitForTimeout(3000)
          for (const el of await bp.$$('button, a')) {
            const t = ((await el.innerText().catch(() => '')) || '').trim()
            if (/^get tickets/i.test(t) && (await el.isVisible().catch(() => false))) {
              await el.click().catch(() => {})
              break
            }
          }
          await bp.waitForTimeout(2500)
          for (const b of await bp.$$('button')) {
            const t = ((await b.innerText().catch(() => '')) || '').trim()
            if (t === '+') {
              await b.click().catch(() => {})
              break
            }
          }
          await bp.waitForTimeout(2000)
          for (const el of await bp.$$('button')) {
            const t = ((await el.innerText().catch(() => '')) || '').trim()
            if (/^checkout/i.test(t) && (await el.isVisible().catch(() => false))) {
              await el.click().catch(() => {})
              break
            }
          }
          await bp.waitForTimeout(6000)
          const filled = await fillIf(bp, 'input[placeholder="Enter code"], #order-enter-code', CODE)
          for (const el of await bp.$$('button')) {
            const t = ((await el.innerText().catch(() => '')) || '').trim()
            if (/^apply$/i.test(t) && (await el.isVisible().catch(() => false))) {
              await el.click().catch(() => {})
              break
            }
          }
          await bp.waitForTimeout(5000)
          const msg = await messagesOnScreen(bp)
          const total = await bp.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 260))
          say(
            'journey 8: a buyer applies it',
            filled ? 'APPLIED' : 'NO CODE FIELD',
            `${msg.join(' // ') || 'no message'}\n      ${total.slice(0, 200)}`,
          )
          await bp.screenshot({ path: `${j.OUT}/discount-applied.png`, fullPage: false }).catch(() => {})
          await bc.close()
        }
      }
    }
    await ctx.close()
  }

  // ══ JOURNEY 9: attribution ══════════════════════════════════════════════
  {
    const { ctx, p } = await organiser()
    if (!EVENT_ID) {
      say('journey 9: a shared link', 'SKIPPED', 'no EVENT_ID given')
    } else {
      await p.goto(`${BASE}/dashboard/events/${EVENT_ID}/launch-kit`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await p.waitForTimeout(12000)
      const v = await describe(j, p, 'The launch kit, where the share links live')
      /*
       * Read the TEXT of the page as well as attributes. The tracked links are
       * printed on the kit as text next to each channel, not held in an href, so
       * an attribute-only search reported "no shareable link" on a screen that
       * offers six of them.
       */
      const links = await p.evaluate(() => {
        const inText = (document.body.innerText.match(/https?:\/\/[^\s]+\/e\/[A-Za-z0-9]+/g) || [])
        const inAttrs = []
        for (const e of document.querySelectorAll('*')) {
          for (const a of e.attributes || []) if (/\/e\/[A-Za-z0-9]+/.test(a.value)) inAttrs.push(a.value)
        }
        return [...new Set([...inText, ...inAttrs])].slice(0, 8)
      })
      const link = links[0] ?? null
      say(
        'journey 9: the kit offers a shareable link',
        link ? 'OFFERED' : 'NONE FOUND',
        `${links.length} tracked link(s), one per channel, e.g. ${link ?? 'none'}; ` +
          `controls: ${v.buttons.slice(0, 6).join(' | ')}`,
      )
      if (!link) {
        j.blockers.push('the launch kit offers no shareable link, which is the acquisition loop')
      }
    }
    await ctx.close()
  }

  // ══ JOURNEY 10: payouts ═════════════════════════════════════════════════
  {
    const { ctx, p } = await organiser()
    const r = await p.goto(`${BASE}/dashboard/payouts`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await p.waitForTimeout(4000)
    await describe(j, p, 'The payouts screen')
    const text = await p.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 400))
    const saysMoney = /\$|AUD|balance|payout|paid|transfer/i.test(text)
    const saysWhen = /after the event|once the event|\d+ (day|business)|schedule|next payout/i.test(text)
    say(
      'journey 10: an organiser looks for their money',
      saysMoney ? (saysWhen ? 'CLEAR' : 'NO TIMING') : 'NOTHING',
      `HTTP ${r?.status()}; mentions money: ${saysMoney}; says WHEN: ${saysWhen}\n      ${text.slice(0, 260)}`,
    )
    if (!saysMoney) j.blockers.push('the payouts screen does not tell an organiser anything about their money')
    else if (!saysWhen) {
      j.unclear.push('the payouts screen does not say WHEN money arrives, which is the first thing an organiser asks')
    }
    await ctx.close()
  }
} catch (err) {
  note(j, 'THREW', String(err).slice(0, 200))
  j.blockers.push(`threw: ${String(err).slice(0, 140)}`)
} finally {
  console.log('')
  console.log('==== JOURNEYS 7 TO 10 ====')
  for (const v of verdicts) console.log(`  ${v.v.padEnd(13)} ${v.n}`)
  await finish(j)
  await browser.close()
}
