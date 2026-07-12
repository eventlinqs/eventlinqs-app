import { chromium } from 'playwright'
const B = 'https://eventlinqs-staging.vercel.app'
const OUT = 'docs/verification/reservation-bug-2026-07-12'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
const reqs = []
p.on('response', async r => {
  const u = r.url()
  if (/reservation|checkout|action/i.test(u) || r.request().method() === 'POST') {
    let body = ''
    try { body = (await r.text()).slice(0, 400) } catch {}
    reqs.push({ url: u.slice(0, 90), status: r.status(), method: r.request().method(), body })
  }
})
await p.goto(`${B}/events/cat-late-night-jazz-at-the-metro-sydney`, { waitUntil: 'load', timeout: 90000 })
await p.waitForTimeout(1500)
console.log('event page title:', await p.title())
// Add one GA ticket
const inc = p.locator('button[aria-label^="Increase"]').first()
await inc.click()
await p.waitForTimeout(600)
await p.screenshot({ path: `${OUT}/1-ticket-selected.png` })
// Click Checkout
await p.getByRole('button', { name: /Checkout/ }).first().click()
await p.waitForTimeout(4000)
await p.screenshot({ path: `${OUT}/2-after-checkout-click.png` })
const bodyTxt = await p.textContent('body')
const errShown = /Invalid reservation data/i.test(bodyTxt)
console.log('URL now:', p.url())
console.log('"Invalid reservation data" shown:', errShown)
console.log('POST responses seen:', JSON.stringify(reqs.slice(-4), null, 1))
await b.close()
