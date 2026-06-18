'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import {
  writePricingField,
  ADMIN_EDITABLE_FIELDS,
  ADMIN_OVERRIDE_FIELDS,
  countryForCurrency,
} from '@/lib/admin/pricing'

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
  assertCan(session, 'admin.pricing.manage')

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

const OverrideSchema = z.object({
  scopeKind: z.enum(['organisation', 'event']),
  targetId: z.string().uuid(),
  currency: z.string().length(3),
  platform_fee_percentage: z.coerce.number().min(0).max(100),
  platform_fee_fixed: z.coerce.number().int().min(0).max(100000), // cents
})

/**
 * Writes a per-organiser or per-event platform-fee override (percentage + fixed)
 * as new versioned, audit-logged pricing_rules rows. The resolver ranks an event
 * override above an org override above the region default, and the same resolver
 * drives the displayed fee, so the override is what the buyer sees and is
 * charged. Server-only form action.
 */
export async function updateOverridePricingAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.pricing.manage')

  const parsed = OverrideSchema.safeParse({
    scopeKind: formData.get('scopeKind'),
    targetId: formData.get('targetId'),
    currency: formData.get('currency'),
    platform_fee_percentage: formData.get('platform_fee_percentage'),
    platform_fee_fixed: formData.get('platform_fee_fixed'),
  })
  if (!parsed.success) {
    redirect('/admin/pricing?status=override_invalid')
  }

  const { scopeKind, targetId, currency } = parsed.data
  const countryCode = countryForCurrency(currency)
  const scope = scopeKind === 'event' ? { eventId: targetId } : { organisationId: targetId }

  let changed = 0
  for (const field of ADMIN_OVERRIDE_FIELDS) {
    const res = await writePricingField(
      { field, countryCode, currency, value: parsed.data[field], scope },
      session,
    )
    if (!res.ok) {
      redirect(`/admin/pricing?status=override_error&scope=${scopeKind}`)
    }
    if (res.changed) changed += 1
  }

  redirect(`/admin/pricing?status=override_saved&scope=${scopeKind}&changed=${changed}`)
}
