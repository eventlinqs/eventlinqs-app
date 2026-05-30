'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCapability } from '@/lib/admin/rbac'
import { writePricingField, ADMIN_EDITABLE_FIELDS } from '@/lib/admin/pricing'

const ScopeSchema = z.object({
  countryCode: z.string().min(2).max(10),
  currency: z.string().length(3),
  platform_fee_percentage: z.coerce.number().min(0).max(100),
  platform_fee_fixed: z.coerce.number().int().min(0).max(100000), // cents
  processing_fee_pass_through: z.coerce.number().int().min(0).max(1),
})

/**
 * Writes one region scope's three editable fee fields as new pricing_rules
 * versions (only the changed ones), then redirects back with a status banner.
 * Server-only form action - no client JS required.
 */
export async function updateScopePricingAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCapability(session.admin.role, 'admin.pricing.manage')

  const parsed = ScopeSchema.safeParse({
    countryCode: formData.get('countryCode'),
    currency: formData.get('currency'),
    platform_fee_percentage: formData.get('platform_fee_percentage'),
    platform_fee_fixed: formData.get('platform_fee_fixed'),
    processing_fee_pass_through: formData.get('processing_fee_pass_through'),
  })
  if (!parsed.success) {
    redirect('/admin/pricing?status=invalid')
  }

  const { countryCode, currency } = parsed.data
  let changed = 0
  for (const field of ADMIN_EDITABLE_FIELDS) {
    const res = await writePricingField({ field, countryCode, currency, value: parsed.data[field] }, session)
    if (!res.ok) {
      redirect(`/admin/pricing?status=error&scope=${encodeURIComponent(countryCode)}`)
    }
    if (res.changed) changed += 1
  }

  redirect(`/admin/pricing?status=saved&scope=${encodeURIComponent(countryCode)}&changed=${changed}`)
}
