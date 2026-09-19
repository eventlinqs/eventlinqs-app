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
import { tearDownAccountOrFailTheRun } from './teardown-account.mjs'

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
  await tearDownAccountOrFailTheRun(db, admin.id)
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

/**
 * WHICH SELLABLE EVENT THE OFFER DRIVE MAY GRANT A FOUNDING WINDOW TO.
 *
 * Extracted from `fo1-founding-offer-drive` on 14 September 2026 because the
 * rule it encodes was learned from a defect and a rule learned from a defect
 * needs a test, not a comment.
 *
 * The drive GRANTS a founding window, exercises it, and REVOKES it. That only
 * leaves TEST as it was found if the organisation started without one. The
 * version with no such filter took the first sellable event and, on a machine
 * where `fo1-founding-purchase-drive` had just run and KEPT its fixture,
 * picked that fixture: the precondition check failed, which read as a product
 * fault, and then the teardown revoked a window the other drive was relying on
 * and reported "left as found".
 *
 * @template {{organisation?: {name?: string, slug?: string, founding_fee_free_until?: string|null}}} T
 * @param {readonly T[]|undefined} sellable
 * @returns {{target: T|null, reason: string|null}} `reason` is the sentence the
 *   caller should refuse with, and is null exactly when `target` is not.
 */
export function chooseFoundingDriveTarget(sellable) {
  const candidates = sellable ?? []
  const standard = candidates.filter(e => e?.organisation?.founding_fee_free_until == null)
  if (standard.length > 0) return { target: standard[0], reason: null }
  if (candidates.length > 0) {
    return {
      target: null,
      reason:
        `every sellable PAID event on TEST belongs to an organisation that ALREADY holds a founding ` +
        `window (${candidates.length} candidate(s)). This drive grants and revokes, so it needs one ` +
        `that starts standard. Clear a fixture, or run it before fo1-founding-purchase-drive rather ` +
        `than after it.`,
    }
  }
  return { target: null, reason: 'no published, public, sellable PAID event with places left on TEST' }
}
