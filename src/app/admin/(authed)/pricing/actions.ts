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
  // gt(0), not min(0): pricing_rules_value_split_check requires
  // value_percentage > 0. See the note above OverrideSchema, which carries the
  // driven evidence. The region form has the same fault as the override form
  // for any scope with no rule yet, and on TEST that is IE/EUR, which holds
  // none of the three and so rendered a zero the database would refuse.
  platform_fee_percentage: z.coerce.number().gt(0).max(100),
  platform_fee_fixed: z.coerce.number().int().min(0).max(100000), // cents
  // ONE FEE (15 August 2026): the two processing-fee amounts were removed from
  // the form and from ADMIN_EDITABLE_FIELDS because nothing charges them. Only
  // the pass-through treatment remains, and it decides who carries the one fee.
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

/*
 * THE PERCENTAGE BOUND IS `gt(0)`, NOT `min(0)`, AND IT IS NOT A PREFERENCE.
 *
 * pricing_rules_value_split_check requires `value_percentage > 0`. Driven on
 * TEST before this line was changed:
 *
 *   insert ... value_percentage 0
 *   ERROR: 23514 ... violates check constraint "pricing_rules_value_split_check"
 *
 * The form used to ship `defaultValue={0}` on this field, so the override form
 * AS RENDERED submitted the one value the database refuses, and the screen
 * answered "Could not save ... Check the {scope} ID exists", blaming the target
 * id for a fault in the fee. A zero platform fee is a real configuration on
 * this platform and it is expressed by the Founding Organiser waiver
 * (organisations.founding_fee_free_until), a dated window the charge, the
 * display and the payout all read identically. It is NOT expressed by a zero
 * rule, because that would put a second way to say "no fee" into the one table
 * the fee doctrine says holds exactly one.
 *
 * Validating here rather than only in the database is what turns a 23514 into a
 * sentence the founder can act on.
 */
const OverrideSchema = z.object({
  scopeKind: z.enum(['organisation', 'event']),
  targetId: z.string().uuid(),
  currency: z.string().length(3),
  platform_fee_percentage: z.coerce.number().gt(0).max(100),
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
