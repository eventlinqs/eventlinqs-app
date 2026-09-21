'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { DiscountCode } from '@/types/database'
import { resolveEventAccess } from '@/lib/organisations/event-access'
import { validateDiscountCodeWith, type ValidateDiscountResult } from '@/lib/pricing/discount-validation'
import { withBuildRetry } from '@/lib/supabase/build-retry'

/**
 * THE ONE SENTENCE FOR A READ THAT COULD NOT BE MADE, on the ORGANISER side.
 *
 * The three functions below each opened with a read whose error was discarded
 * and whose empty answer became a statement of FACT: "Event not found" and
 * "Discount code not found". A dropped socket therefore told an organiser that
 * their own event, or a code they were looking at a second earlier, did not
 * exist. That is the same defect as the buyer-facing one this file was opened
 * to fix, pointed at the other user, and it was three more instances of it.
 *
 * The not-found sentences are KEPT and still reached, because a code that has
 * genuinely been deleted in another tab must still say so. What changed is
 * that a failure is no longer allowed to borrow them.
 */
const COULD_NOT_READ = 'We could not reach the database just now. Please try again.'

// ─── Validate a discount code at checkout ────────────────────────────

/**
 * THE BUYER-FACING DOOR.
 *
 * TWO THINGS THIS RESOLVES THAT THE CALLER MAY NOT BE TRUSTED WITH, and both
 * were live defects until 21 September 2026.
 *
 *   THE CLIENT. `discount_codes` and `discount_code_usages` are service-role
 *   only by policy (asked of the live database, not read off the source), so
 *   the SESSION client this used to pass saw zero rows and every valid code on
 *   the platform came back "Invalid discount code". A wider policy is the wrong
 *   answer, because a code is a secret and a buyer-readable table is a listable
 *   one. See the reader's own header.
 *
 *   THE USER. The `user_id` ARGUMENT IS IGNORED. This action is called from a
 *   client component, so an id arriving through it is an id the browser chose,
 *   and it decides the per-user cap that nothing else holds. The signed-in user
 *   is read from the session here instead. `src/app/actions/checkout.ts` passes
 *   its own server-resolved id, so that call site is unaffected either way; the
 *   parameter is kept so neither caller has to change, and removing it is a
 *   BORDER line for the lane that owns checkout.ts.
 */
export async function validateDiscountCode(
  code: string,
  event_id: string,
  _ignored_user_id: string | null,
  order_subtotal_cents: number,
  tier_ids: string[]
): Promise<ValidateDiscountResult> {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()

  return validateDiscountCodeWith(createAdminClient(), {
    code,
    event_id,
    user_id: user?.id ?? null,
    order_subtotal_cents,
    tier_ids,
  })
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
  const { data: event, error: eventError } = await withBuildRetry(
    () =>
      supabase
        .from('events')
        .select('id, organisation_id')
        .eq('id', parsed.data.event_id)
        .maybeSingle() as unknown as PromiseLike<{ data: { id: string; organisation_id: string } | null; error: unknown }>,
    { label: 'discount-create-event-lookup' },
  )

  if (eventError) {
    console.error('[discount-codes] could not read the event, so no verdict is given about it:', eventError)
    return { error: COULD_NOT_READ }
  }
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

  const { data: dc, error: dcError } = await withBuildRetry(
    () =>
      supabase
        .from('discount_codes')
        .select('event_id, organisation_id')
        .eq('id', id)
        .maybeSingle() as unknown as PromiseLike<{ data: { event_id: string; organisation_id: string } | null; error: unknown }>,
    { label: 'discount-update-code-lookup' },
  )

  if (dcError) {
    console.error('[discount-codes] could not read the code before updating it:', dcError)
    return { error: COULD_NOT_READ }
  }
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

  const { data: dc, error: dcError } = await withBuildRetry(
    () =>
      supabase
        .from('discount_codes')
        .select('event_id, organisation_id, current_uses, reserved_uses')
        .eq('id', id)
        .maybeSingle() as unknown as PromiseLike<{ data: { event_id: string; organisation_id: string; current_uses: number; reserved_uses: number } | null; error: unknown }>,
    { label: 'discount-delete-code-lookup' },
  )

  if (dcError) {
    console.error('[discount-codes] could not read the code before deleting it:', dcError)
    return { error: COULD_NOT_READ }
  }
  if (!dc) return { error: 'Discount code not found' }
  /*
   * A HELD USE IS A USE, and this read only current_uses.
   *
   * Migration 20260829000003 split the count in two: `current_uses` moves when
   * an order CONFIRMS, `reserved_uses` the moment a buyer applies the code to
   * their reservation. Every other place that asks "is this code in use" adds
   * the two, which is the whole point of the hold. This one did not, so a code
   * a buyer was holding at that instant looked untouched and could be deleted
   * out from under them: `discount_code_claims` cascades, `orders
   * .discount_code_id` is ON DELETE SET NULL, and the organiser is left with a
   * discounted order and no record of which promotion gave it away.
   */
  if ((dc.current_uses ?? 0) + (dc.reserved_uses ?? 0) > 0) {
    return { error: 'Cannot delete a code that has been used. Deactivate it instead.' }
  }

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
