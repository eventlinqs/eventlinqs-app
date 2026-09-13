/**
 * STRIPE'S TEST CARD, PRESSED THE WAY A PERSON PRESSES IT.
 *
 * Shared by the D2 proofs (a returning buyer completing an abandoned checkout;
 * a buyer taking the last paid place before a refund frees it) so the two do
 * not carry two copies of the same frame handling. Everything here was learnt
 * on the preview drives of 12 September 2026 and is recorded in the session
 * memory: Stripe mounts TWO frames titled "Secure payment input frame" once
 * Link is present and the card fields live in the first; Link's "save my
 * information" must be off or Stripe asks for a phone number; and under mobile
 * emulation the cross-origin frame is still fillable by name.
 *
 * The judge of a purchase is never the page. `waitForConfirmedOrder` polls
 * the TEST database for the order the webhook confirmed and the tickets it
 * issued, which is the only evidence that Stripe's event reached the route.
 */
export const PAYMENT_FRAME = 'iframe[title="Secure payment input frame"]'

/** True once the card number field is visible inside Stripe's frame. */
export async function stripeFrameOn(page, timeout = 60_000) {
  try {
    await page.frameLocator(PAYMENT_FRAME).first().locator('input[name="number"]').waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

async function pressButton(page, rx) {
  for (const el of await page.$$('button, a[role=button], a')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (rx.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      return t
    }
  }
  return null
}

/**
 * Fill 4242 4242 4242 4242, a future expiry, a CVC and an Australian postcode,
 * then press Pay. Returns the text of the button pressed, or null when there
 * was no Pay button to press.
 */
export async function payWithTestCard(page) {
  const frame = page.frameLocator(PAYMENT_FRAME).first()
  await frame.locator('input[name="number"]').waitFor({ state: 'visible', timeout: 60_000 })
  const save = frame.locator('input[type="checkbox"]').first()
  if ((await save.count()) > 0 && (await save.isChecked().catch(() => false))) {
    await save.uncheck().catch(() => {})
  }
  await frame.locator('input[name="number"]').fill('4242424242424242')
  await frame.locator('input[name="expiry"]').fill('12/34')
  await frame.locator('input[name="cvc"]').fill('123')
  const postcode = frame.locator('input[name="postalCode"]')
  if ((await postcode.count()) > 0 && (await postcode.isVisible().catch(() => false))) {
    await postcode.fill('3000')
  }
  return pressButton(page, /^pay\b/i)
}

/**
 * Poll the database until the order is confirmed with at least one ticket, or
 * the time runs out. Returns the last state seen either way, so a failure
 * names what the order was rather than only that it was not confirmed.
 */
export async function waitForConfirmedOrder(db, orderId, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs
  let last = { status: null, tickets: 0, totalCents: null, confirmedAt: null }
  while (Date.now() < until) {
    const { data: order } = await db
      .from('orders')
      .select('status, confirmed_at, total_cents')
      .eq('id', orderId)
      .maybeSingle()
    const { count } = await db.from('tickets').select('id', { count: 'exact', head: true }).eq('order_id', orderId)
    last = {
      status: order?.status ?? null,
      tickets: count ?? 0,
      totalCents: order?.total_cents ?? null,
      confirmedAt: order?.confirmed_at ?? null,
    }
    if (last.status === 'confirmed' && last.tickets > 0) return last
    await new Promise((r) => setTimeout(r, 3000))
  }
  return last
}
