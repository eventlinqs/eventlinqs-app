'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { setVenueEnrolment, writeVenueShareRate, triggerVenuePayout } from '@/lib/admin/venues'

const RateSchema = z.object({
  countryCode: z.string().min(2).max(10),
  currency: z.string().length(3),
  percentage: z.coerce.number().min(0).max(100),
})

/** Edits the single-source venue share rate (a pricing_rules version). */
export async function updateVenueRateAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.venues.manage')

  const parsed = RateSchema.safeParse({
    countryCode: formData.get('countryCode'),
    currency: formData.get('currency'),
    percentage: formData.get('percentage'),
  })
  if (!parsed.success) redirect('/admin/venues?status=rate_invalid')

  const res = await writeVenueShareRate(parsed.data, session)
  if (!res.ok) redirect('/admin/venues?status=rate_error')
  redirect(`/admin/venues?status=rate_saved&changed=${res.changed ? 1 : 0}`)
}

const EnrolSchema = z.object({ venueId: z.string().uuid() })

export async function enrolVenueAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.venues.manage')
  const parsed = EnrolSchema.safeParse({ venueId: formData.get('venueId') })
  if (!parsed.success) redirect('/admin/venues?status=enrol_invalid')
  const res = await setVenueEnrolment(parsed.data.venueId, true, session)
  if (!res.ok) redirect('/admin/venues?status=enrol_error')
  redirect('/admin/venues?status=enrolled')
}

export async function unenrolVenueAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.venues.manage')
  const parsed = EnrolSchema.safeParse({ venueId: formData.get('venueId') })
  if (!parsed.success) redirect('/admin/venues?status=enrol_invalid')
  const res = await setVenueEnrolment(parsed.data.venueId, false, session)
  if (!res.ok) redirect('/admin/venues?status=enrol_error')
  redirect('/admin/venues?status=unenrolled')
}

const PayoutSchema = z.object({
  venueId: z.string().uuid(),
  eventId: z.string().uuid(),
})

export async function triggerVenuePayoutAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.venues.manage')
  const parsed = PayoutSchema.safeParse({
    venueId: formData.get('venueId'),
    eventId: formData.get('eventId'),
  })
  if (!parsed.success) redirect('/admin/venues?status=payout_invalid')

  const res = await triggerVenuePayout(parsed.data.venueId, parsed.data.eventId, session)
  const base = `/admin/venues/${parsed.data.venueId}`
  if (res.status === 'paid') redirect(`${base}?status=payout_paid&amount=${res.amountCents ?? 0}`)
  if (res.status === 'nothing') redirect(`${base}?status=payout_nothing`)
  if (res.status === 'not_ready') redirect(`${base}?status=payout_not_ready`)
  redirect(`${base}?status=payout_error`)
}
