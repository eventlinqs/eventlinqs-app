/**
 * The owner's side of the Founding Organiser offer, driven through the real
 * admin screens.
 *
 * EXTRACTED so the two FO1 proofs press the SAME buttons. `fo1-founding-offer-drive`
 * proves what the offer LOOKS like (the badge, the selector, grant/extend/revoke),
 * and `fo1-founding-purchase-drive` proves what it COSTS (a completed card
 * payment and the ledger row underneath it). Two copies of "find the row and
 * press Grant" drift, and then a pass in one is not comparable with a failure in
 * the other, which is the reason the refund proofs share a fixture builder too.
 *
 * TEST ONLY. Every caller asserts the TEST Supabase ref before importing rows.
 */
import { randomUUID } from 'node:crypto'

/**
 * A throwaway super-admin, created here rather than borrowed, because the
 * alternative is knowing a real owner's password and no proof should.
 *
 * Returns the credentials AND the id, so the caller can delete the user again.
 */
export async function createProofAdmin(db, { label = 'Lane B FO1 Proof' } = {}) {
  const email = `lane-b-fo1-admin-${Date.now().toString(36)}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw new Error(`create admin auth user: ${created.error.message}`)
  const id = created.data.user.id
  await db.from('profiles').upsert({ id, email, full_name: label })
  const { error } = await db.from('admin_users').insert({ id, role: 'super_admin', display_name: label })
  if (error) throw new Error(`admin_users insert: ${error.message}`)
  return { id, email, password }
}

/** Removes the throwaway admin. Safe to call when creation failed. */
export async function removeProofAdmin(db, admin) {
  if (!admin?.id) return
  await db.from('admin_users').delete().eq('id', admin.id)
  await db.from('profiles').delete().eq('id', admin.id)
  await db.auth.admin.deleteUser(admin.id).catch(() => {})
}

/** Signs in at the real /admin/login. Returns true when the console was reached. */
export async function signInAsOwner(page, base, admin) {
  await page.goto(`${base}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.locator('input[name="email"]').fill(admin.email)
  await page.locator('input[name="password"]').fill(admin.password)
  await Promise.all([
    page.waitForURL(u => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ])
  await page.waitForTimeout(2500)
  return !new URL(page.url()).pathname.endsWith('/admin/login')
}

/**
 * Presses one of Grant, Extend or Revoke on the row for `orgName`, through the
 * real screen, and reads back what the screen then says.
 *
 * The row is found through the screen's OWN SEARCH, the way an owner finds one
 * of two hundred and fifty organisations, rather than by scrolling a list the
 * proof has arranged to be short.
 */
export async function pressFoundingTerm(page, base, orgName, label, shotPath) {
  await page.goto(`${base}/admin/network?org=${encodeURIComponent(orgName)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  })
  await page.waitForTimeout(2500)
  const row = page.locator('li', { hasText: orgName }).first()
  if ((await row.count()) === 0) return { ok: false, message: `no row for ${orgName} on /admin/network` }
  await row.getByRole('button', { name: label, exact: true }).click()
  await page.waitForTimeout(4000)
  const text = (await row.innerText().catch(() => '')) || ''
  if (shotPath) await page.screenshot({ path: shotPath, fullPage: false })
  return { ok: true, message: text.replace(/\s+/g, ' ').slice(0, 200) }
}
