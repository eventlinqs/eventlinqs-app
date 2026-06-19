import { createClient } from '@supabase/supabase-js'

/**
 * Safety + teardown for the purchase E2E.
 *
 * The whole platform currently has ONE database: the production Sydney project.
 * A purchase test writes real rows (reservations/orders/order_items/payments/
 * tickets), so it must NEVER run against production. assertNotProd is the hard
 * guard; cleanupPurchaseRows removes the rows a run created (children first),
 * via a service-role client, and only when a non-prod service role is supplied.
 */

const PROD_REF = 'gndnldyfudbytbboxesk'

export function assertNotProd(supabaseUrl: string | undefined): void {
  if (supabaseUrl && supabaseUrl.includes(PROD_REF)) {
    throw new Error(
      `Refusing to run the purchase E2E against the PRODUCTION database (${PROD_REF}). ` +
        'Point CERT_SUPABASE_URL at a staging/test Supabase project.',
    )
  }
}

export interface CleanupEnv {
  url?: string
  serviceRoleKey?: string
}

/**
 * Delete every row the purchase test created for `buyerEmail`. No-op (returns
 * false) unless a non-prod service-role is configured, so the suite stays safe
 * to leave in the repo. Returns true when a cleanup actually ran.
 */
export async function cleanupPurchaseRows(env: CleanupEnv, buyerEmail: string): Promise<boolean> {
  if (!env.url || !env.serviceRoleKey) return false
  assertNotProd(env.url)

  const svc = createClient(env.url, env.serviceRoleKey, { auth: { persistSession: false } })

  const { data: orders } = await svc.from('orders').select('id').eq('guest_email', buyerEmail)
  const orderIds = (orders ?? []).map(o => (o as { id: string }).id)
  if (orderIds.length === 0) return true

  // Children first so foreign keys never block the delete.
  await svc.from('tickets').delete().in('order_id', orderIds)
  await svc.from('order_items').delete().in('order_id', orderIds)
  await svc.from('payments').delete().in('order_id', orderIds)
  await svc.from('orders').delete().in('id', orderIds)
  // Reservations carry a 10-minute TTL and self-expire, but clear any tied to
  // this buyer's email if the column is present (best-effort).
  await svc.from('reservations').delete().eq('guest_email', buyerEmail)

  return true
}
