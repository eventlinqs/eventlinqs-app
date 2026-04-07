'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { DiscountCode } from '@/types/database'

// ─── Validate a discount code at checkout ────────────────────────────────────

export interface ValidateDiscountResult {
  valid: boolean
  discount_cents: number
  discount_code_id?: string
  error?: string
}

export async function validateDiscountCode(
  code: string,
  event_id: string,
  user_id: string | null,
  order_subtotal_cents: number,
  tier_ids: string[]
): Promise<ValidateDiscountResult> {
  const supabase = await createClient()

  const { data: dc, error } = await supabase
    .from('discount_codes')
    .select('*')
    .eq('code', code.toUpperCase().trim())
    .eq('event_id', event_id)
    .maybeSingle()

  if (error || !dc) return { valid: false, discount_cents: 0, error: 'Invalid discount code' }

  if (!dc.is_active) return { valid: false, discount_cents: 0, error: 'This code is no longer active' }

  const now = new Date().toISOString()
  if (dc.valid_from && dc.valid_from > now) return { valid: false, discount_cents: 0, error: 'This code is not yet active' }
  if (dc.valid_until && dc.valid_until < now) return { valid: false, discount_cents: 0, error: 'This code has expired' }

  if (dc.max_uses !== null && dc.current_uses >= dc.max_uses) {
    return { valid: false, discount_cents: 0, error: 'This code has reached its usage limit' }
  }

  if (user_id && dc.max_uses_per_user > 0) {
    const { count } = await supabase
      .from('discount_code_usages')
      .select('*', { count: 'exact', head: true })
      .eq('discount_code_id', dc.id)
      .eq('user_id', user_id)

    if ((count ?? 0) >= dc.max_uses_per_user) {
      return { valid: false, discount_cents: 0, error: "You've already used this code" }
    }
  }

  if (dc.min_order_amount_cents !== null && order_subtotal_cents < dc.min_order_amount_cents) {
    const minFormatted = (dc.min_order_amount_cents / 100).toFixed(2)
    return { valid: false, discount_cents: 0, error: `Minimum order of $${minFormatted} required for this code` }
  }

  if (dc.applicable_tier_ids !== null && dc.applicable_tier_ids.length > 0) {
    const hasMatchingTier = tier_ids.some(id => dc.applicable_tier_ids!.includes(id))
    if (!hasMatchingTier) {
      return { valid: false, discount_cents: 0, error: "This code doesn't apply to your selected tickets" }
    }
  }

  // Calculate discount
  let discount_cents: number
  if (dc.discount_type === 'percentage') {
    discount_cents = Math.round(order_subtotal_cents * (dc.discount_value / 100))
  } else {
    discount_cents = dc.discount_value
  }

  // Cap at subtotal
  discount_cents = Math.min(discount_cents, order_subtotal_cents)

  return { valid: true, discount_cents, discount_code_id: dc.id }
}

// ─── Organiser: Create discount code ────────────────────────────────────────

const CreateDiscountCodeSchema = z.object({
  event_id: z.string().uuid(),
  code: z.string().min(3).max(20).regex(/^[A-Z0-9-]+$/, 'Code must be uppercase letters, numbers, and hyphens only'),
  discount_type: z.enum(['percentage', 'fixed_amount']),
  discount_value: z.number().positive(),
  currency: z.string().nullable().optional(),
  max_uses: z.number().int().positive().nullable().optional(),
  max_uses_per_user: z.number().int().min(1).default(1),
  min_order_amount_cents: z.number().int().min(0).nullable().optional(),
  applicable_tier_ids: z.array(z.string().uuid()).nullable().optional(),
  valid_from: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
})

export type CreateDiscountCodeInput = z.infer<typeof CreateDiscountCodeSchema>

export async function createDiscountCode(
  input: CreateDiscountCodeInput
): Promise<{ error?: string; code?: DiscountCode }> {
  const parsed = CreateDiscountCodeSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify organiser owns the event
  const { data: event } = await supabase
    .from('events')
    .select('id, organisation_id')
    .eq('id', parsed.data.event_id)
    .single()

  if (!event) return { error: 'Event not found' }

  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', event.organisation_id)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!org) return { error: 'Access denied' }

  // Validate percentage range
  if (parsed.data.discount_type === 'percentage' && (parsed.data.discount_value < 1 || parsed.data.discount_value > 100)) {
    return { error: 'Percentage discount must be between 1 and 100' }
  }

  const { data, error } = await supabase
    .from('discount_codes')
    .insert({
      event_id: parsed.data.event_id,
      organisation_id: event.organisation_id,
      code: parsed.data.code.toUpperCase(),
      discount_type: parsed.data.discount_type,
      discount_value: parsed.data.discount_type === 'percentage'
        ? parsed.data.discount_value
        : Math.round(parsed.data.discount_value * 100), // dollars to cents
      currency: parsed.data.currency ?? null,
      max_uses: parsed.data.max_uses ?? null,
      max_uses_per_user: parsed.data.max_uses_per_user,
      min_order_amount_cents: parsed.data.min_order_amount_cents ?? null,
      applicable_tier_ids: parsed.data.applicable_tier_ids ?? null,
      valid_from: parsed.data.valid_from ?? null,
      valid_until: parsed.data.valid_until ?? null,
      is_active: parsed.data.is_active,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'A code with that name already exists for this event' }
    return { error: 'Failed to create discount code' }
  }

  revalidatePath(`/dashboard/events/${parsed.data.event_id}/discounts`)
  return { code: data as DiscountCode }
}

export async function updateDiscountCode(
  id: string,
  updates: { is_active?: boolean }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: dc } = await supabase
    .from('discount_codes')
    .select('event_id, organisation_id')
    .eq('id', id)
    .single()

  if (!dc) return { error: 'Discount code not found' }

  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', dc.organisation_id)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!org) return { error: 'Access denied' }

  const { error } = await supabase
    .from('discount_codes')
    .update(updates)
    .eq('id', id)

  if (error) return { error: 'Failed to update discount code' }
  revalidatePath(`/dashboard/events/${dc.event_id}/discounts`)
  return {}
}

export async function deleteDiscountCode(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: dc } = await supabase
    .from('discount_codes')
    .select('event_id, organisation_id, current_uses')
    .eq('id', id)
    .single()

  if (!dc) return { error: 'Discount code not found' }
  if (dc.current_uses > 0) return { error: 'Cannot delete a code that has been used. Deactivate it instead.' }

  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', dc.organisation_id)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!org) return { error: 'Access denied' }

  const { error } = await supabase.from('discount_codes').delete().eq('id', id)
  if (error) return { error: 'Failed to delete discount code' }
  revalidatePath(`/dashboard/events/${dc.event_id}/discounts`)
  return {}
}
