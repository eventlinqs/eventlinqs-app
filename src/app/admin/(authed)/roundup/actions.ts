'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { getCity } from '@/lib/cities/data'
import { fetchDigestEvents, resolveDigestPeriod } from '@/lib/broadcast/digest'
import { whatsappEdition } from '@/lib/broadcast/whatsapp-edition'
import { approveRoundup } from '@/lib/broadcast/roundup'

/**
 * APPROVE ONE CITY'S WEEKLY ROUNDUP (Train C, row 9). The edition is drafted again here from the database, never
 * taken from the form, so what is approved is exactly what the week's listings say; the WhatsApp text as approved is
 * kept with the approval. It sends nothing: the weekly digest cron sends a city once its edition is approved.
 */
export async function approveRoundupAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  const back = (said: string) => redirect(`/admin/roundup?said=${encodeURIComponent(said)}`)
  if (!can(session, 'admin.network.manage')) back('Your role cannot approve a roundup.')
  const citySlug = String(formData.get('city') ?? '').trim()
  const city = getCity(citySlug)
  if (city === null) back('Nothing was approved: no city was named.')
  const admin = createAdminClient()
  const now = new Date()
  const origin = getSiteUrl()
  const events = await fetchDigestEvents(admin, citySlug, resolveDigestPeriod(now), 10, origin, city!.name)
  const text = whatsappEdition({ cityName: city!.name, events, cityUrl: `${origin}/city/${citySlug}` })
  const done = await approveRoundup(admin, { citySlug, whatsappText: text, eventCount: events.length, approvedBy: session.userId, now })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: 'admin.roundup.approve', session, metadata: { city: citySlug, events: events.length } })
  revalidatePath('/admin/roundup')
  back(`Approved. ${city!.name}'s roundup goes to its subscribers with Thursday's send.`)
}
