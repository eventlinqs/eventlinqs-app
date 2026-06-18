// Buyer-journey flow capture: event detail (ticket steppers + gold CTA) ->
// select a ticket -> checkout form (unified gold CTAs, 44px fields). Live PAID
// step is NOT taken (stops at the payment form). Outputs gitignored.
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const OUT = 'docs/benchmark/system-pass/phase-b/buyer-flow'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const SLUGS = process.argv.slice(2)
const browser = await chromium.launch()

async function run(slug, width) {
  const ctx = await browser.newContext({
    viewport: { width, height: 1000 },
    userAgent: REAL_UA,
    deviceScaleFactor: 1,
  })
  const page = await ctx.newPage()
  const tag = `${slug}-${width}`
  try {
    await page.goto(`http://localhost:3000/events/${slug}`, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(800)
    // Find the first enabled increase-quantity stepper.
    const plus = page.locator('button[aria-label^="Increase"]:not([disabled])').first()
    const hasStepper = await plus.count()
    if (!hasStepper) {
      console.log(`${tag}: no on-sale stepper (sale blocked / sold out) - skipping flow`)
      await page.screenshot({ path: `${OUT}/${tag}-detail-nostepper.png` })
      await ctx.close()
      return false
    }
    // Scroll the stepper into view and shoot the selector (unselected).
    await plus.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/${tag}-detail-selector.png` })
    // Select one ticket -> selected state (gold + filled, subtotal shows).
    await plus.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/${tag}-detail-selected.png` })
    // Proceed to checkout.
    const checkout = page.locator('button:has-text("Checkout"), button:has-text("Register")').first()
    if (await checkout.count()) {
      await checkout.click()
      await page.waitForURL(/\/checkout\//, { timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(1500)
      await page.screenshot({ path: `${OUT}/${tag}-checkout-form.png`, fullPage: true })
      console.log(`${tag}: captured detail + checkout (${page.url()})`)
    } else {
      console.log(`${tag}: stepper ok, no checkout button found`)
    }
    await ctx.close()
    return true
  } catch (e) {
    console.log(`${tag}: FAIL ${String(e.message ?? e).slice(0, 120)}`)
    await ctx.close()
    return false
  }
}

for (const slug of SLUGS) {
  const ok = await run(slug, 1440)
  if (ok) { await run(slug, 390); break } // capture mobile only for the working slug
}
await browser.close()
console.log('done')
