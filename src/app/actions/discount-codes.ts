'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { DiscountCode } from '@/types/database'
import { resolveEventAccess } from '@/lib/organisations/event-access'
import { resolveDiscountCents } from '@/lib/payments/discount-math'

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

  /*
   * THE AMOUNT, through the one pure function that owns this arithmetic.
   *
   * This read `dc.discount_value`, a column migration 20260520000001 (P1-4)
   * DROPPED and split in two. The field was simply `undefined`, so a percentage
   * code computed NaN and a fixed code returned undefined, and BOTH were handed
   * back as `valid: true`. The math now lives in src/lib/payments/discount-math.ts
   * where it is tested against every shape the table allows.
   */
  const amount = resolveDiscountCents(dc, order_subtotal_cents)
  if (!amount.ok) return { valid: false, discount_cents: 0, error: amount.reason }

  return { valid: true, discount_cents: amount.discount_cents, discount_code_id: dc.id }
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

  /*
   * ACCESS, VIA THE SHARED GATE.
   *
   * PRIVILEGE: this filtered `.eq('owner_id', user.id)` on the SESSION client, and
   * the column lockdown does not grant `authenticated` owner_id. PostgreSQL needs
   * SELECT privilege on WHERE-clause columns, so the query was refused 42501 and
   * this returned "Access denied" to a legitimate organiser.
   *
   * AUTHORISATION: it admitted the OWNER only. resolveEventAccess admits owner or
   * a member holding owner/admin/manager, the same set updateEvent and
   * resolveRefundScope use, so a venue's manager can create a discount code for an event they run.
   */
  const access = await resolveEventAccess(parsed.data.event_id)
  if (!access.allowed) return { error: 'Access denied' }

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
      /*
       * THE TWO TYPED COLUMNS, NOT THE RETIRED ONE.
       *
       * This wrote `discount_value`, which migration 20260520000001 (P1-4)
       * dropped on 20 May 2026. Every insert since has failed PGRST204,
       * "Could not find the 'discount_value' column", and the panel reported
       * it as the generic "Failed to create discount code". No organiser has
       * been able to create a discount code since that migration landed.
       *
       * discount_codes_value_split_check requires EXACTLY one of these to be
       * set for the type, so the other is explicitly NULL rather than omitted.
       */
      discount_percentage: parsed.data.discount_type === 'percentage'
        ? parsed.data.discount_value
        : null,
      discount_amount_cents: parsed.data.discount_type === 'fixed_amount'
        ? Math.round(parsed.data.discount_value * 100) // dollars to cents
        : null,
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
    /*
     * SAY WHAT WENT WRONG, AND LEAVE IT IN THE LOG.
     *
     * "Failed to create discount code" was the whole message for three months
     * while every insert failed on a dropped column. A refusal that cannot name
     * its own cause hides a defect for exactly as long as nobody opens a
     * database client. The code is short and non-sensitive; the full error goes
     * to the server log where an incident starts.
     */
    console.error('[discount-codes] insert failed', {
      event_id: parsed.data.event_id,
      pg_code: error.code,
      message: error.message,
    })
    return { error: `Could not create the code (${error.code ?? 'unknown'}). It has been logged.` }
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

  /*
   * ACCESS, VIA THE SHARED GATE.
   *
   * PRIVILEGE: this filtered `.eq('owner_id', user.id)` on the SESSION client, and
   * the column lockdown does not grant `authenticated` owner_id. PostgreSQL needs
   * SELECT privilege on WHERE-clause columns, so the query was refused 42501 and
   * this returned "Access denied" to a legitimate organiser.
   *
   * AUTHORISATION: it admitted the OWNER only. resolveEventAccess admits owner or
   * a member holding owner/admin/manager, the same set updateEvent and
   * resolveRefundScope use, so a venue's manager can update a discount code on an event they run.
   */
  const access = await resolveEventAccess(dc.event_id)
  if (!access.allowed) return { error: 'Access denied' }

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

  /*
   * ACCESS, VIA THE SHARED GATE.
   *
   * PRIVILEGE: this filtered `.eq('owner_id', user.id)` on the SESSION client, and
   * the column lockdown does not grant `authenticated` owner_id. PostgreSQL needs
   * SELECT privilege on WHERE-clause columns, so the query was refused 42501 and
   * this returned "Access denied" to a legitimate organiser.
   *
   * AUTHORISATION: it admitted the OWNER only. resolveEventAccess admits owner or
   * a member holding owner/admin/manager, the same set updateEvent and
   * resolveRefundScope use, so a venue's manager can delete an unused discount code on an event they run.
   */
  const access = await resolveEventAccess(dc.event_id)
  if (!access.allowed) return { error: 'Access denied' }

  const { error } = await supabase.from('discount_codes').delete().eq('id', id)
  if (error) return { error: 'Failed to delete discount code' }
  revalidatePath(`/dashboard/events/${dc.event_id}/discounts`)
  return {}
}
