'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeClient } from '@/lib/payments/payout'
import { getSiteUrl } from '@/lib/site-url'
import { resolveOrganiserScope } from '@/lib/payouts/auth'
import { startOrder } from '@/lib/promotions/promotions'

/**
 * AN ORGANISER ORDERS A FEATURED SLOT OR A SERVICE (Train C, rows 12 and 13). Only the signed in owner of the
 * organisation, for one of their own listings still to come, for an offer Lawal has priced; the order is written at
 * that price, and the organiser is sent to Stripe Checkout to pay. Nothing is charged here.
 */
export async function orderPromotionAction(formData: FormData): Promise<void> {
  const scope = await resolveOrganiserScope(String(formData.get('organisation') ?? '') || undefined)
  if (!scope.ok) redirect(scope.status === 401 ? '/login?next=/dashboard/promote' : '/dashboard')
  const done = await startOrder(createAdminClient(), getStripeClient(), {
    offerId: String(formData.get('offer') ?? ''),
    eventId: String(formData.get('event') ?? ''),
    organisationId: scope.org.organisationId,
    userId: scope.org.userId,
    origin: getSiteUrl(),
    now: new Date(),
  })
  if (done.state === 'refused') redirect(`/dashboard/promote?problem=${encodeURIComponent(done.reason)}`)
  redirect(done.url)
}
