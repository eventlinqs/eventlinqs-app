'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { markOrderDone, priceFromDollars, setOfferPrice } from '@/lib/promotions/promotions'

/** The admin's presses on /admin/promotions (Train C, rows 12 and 13): a price set or cleared, and an order marked done. */

const back = (said: string) => redirect(`/admin/promotions?said=${encodeURIComponent(said)}`)

export async function setOfferPriceAction(formData: FormData): Promise<void> {
  const s = await requireAdminSession()
  if (!can(s, 'admin.pricing.manage')) back('Your role cannot set prices.')
  const id = String(formData.get('id') ?? '')
  const price = priceFromDollars(String(formData.get('price') ?? ''))
  if (price === 'invalid') back('A price is in dollars, as in 49 or 49.50. Leave it empty to take it off sale.')
  const cents = price as number | null
  const ok = await setOfferPrice(createAdminClient(), id, cents, s.userId)
  if (!ok) back('Nothing was changed just now. Try again in a minute.')
  await recordAuditEvent({ action: 'admin.promotion_offer.price', session: s, targetType: 'promotion_offer', targetId: id, metadata: { price_cents: cents } })
  revalidatePath('/admin/promotions')
  back(cents === null ? 'Off sale. Organisers see it as not on sale yet.' : 'Priced. Organisers can order it now.')
}

export async function markOrderDoneAction(formData: FormData): Promise<void> {
  const s = await requireAdminSession()
  if (!can(s, 'admin.network.manage')) back('Your role cannot change orders.')
  const id = String(formData.get('id') ?? '')
  const ok = await markOrderDone(createAdminClient(), id, s.userId)
  if (!ok) back('Nothing was changed just now. Try again in a minute.')
  await recordAuditEvent({ action: 'admin.promotion_order.done', session: s, targetType: 'promotion_order', targetId: id })
  revalidatePath('/admin/promotions')
  back('Marked done.')
}
