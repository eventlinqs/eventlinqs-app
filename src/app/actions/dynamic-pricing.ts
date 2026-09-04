'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { revalidateEventSurfacesById } from '@/lib/events/revalidate-event'
import { resolveEventAccess } from '@/lib/organisations/event-access'
import { normaliseDynamicPricingSteps } from '@/lib/pricing/steps'
import type { Json } from '@/types/database'

const StepSchema = z.object({
  id: z.string().uuid().optional(),
  step_order: z.number().int().min(1).max(10),
  capacity_threshold_percent: z.number().min(1).max(100),
  price_cents: z.number().int().min(0),
})

const SaveDynamicPricingSchema = z.object({
  tier_id: z.string().uuid(),
  enabled: z.boolean(),
  steps: z.array(StepSchema).min(1).max(10),
  event_id: z.string().uuid(),
})

export type SaveDynamicPricingInput = z.infer<typeof SaveDynamicPricingSchema>

export interface SaveDynamicPricingResult {
  success: boolean
  error?: string
}

export async function saveDynamicPricing(
  input: SaveDynamicPricingInput
): Promise<SaveDynamicPricingResult> {
  const parsed = SaveDynamicPricingSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { tier_id, enabled, steps, event_id } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Verify the user owns this event's organisation
  const { data: tier, error: tierError } = await supabase
    .from('ticket_tiers')
    .select('id, event_id')
    .eq('id', tier_id)
    .single()

  if (tierError || !tier) {
    console.error('[dynamic-pricing] Tier lookup failed:', tierError)
    return { success: false, error: 'Tier not found' }
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, organisation_id')
    .eq('id', tier.event_id)
    .single()

  if (eventError || !event) {
    console.error('[dynamic-pricing] Event lookup failed:', eventError)
    return { success: false, error: 'Event not found' }
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
   * resolveRefundScope use, so a venue's manager can save dynamic pricing for an event they run.
   */
  const access = await resolveEventAccess(event.id)
  if (!access.allowed) return { success: false, error: 'Access denied' }

  // All writes use adminClient (Principle 1)
  const adminClient = createAdminClient()

  /*
   * ONE TRANSACTION, NOT THREE STATEMENTS (Scope v5 3.3, 4 September 2026).
   *
   * This used to toggle dynamic_pricing_enabled, delete every rule and insert
   * the new rules as three auto-committed writes. The price history triggers
   * (migration 20260904000002) judge a tier's effective price at commit, so
   * three commits would have recorded a flip to the base price between the
   * delete and the insert, a move no buyer ever saw. save_dynamic_pricing does
   * the same three writes inside one transaction, and the deferred triggers see
   * only the final state. The steps are normalised first (sorted by threshold,
   * renumbered, clamped) so what is stored says what the database will do.
   * scripts/guards/price-history-integrity.mjs refuses a return to direct
   * writes on dynamic_pricing_rules from application code.
   */
  const normalised = enabled ? normaliseDynamicPricingSteps(steps) : []
  const { error: saveError } = await adminClient.rpc('save_dynamic_pricing', {
    p_tier_id: tier_id,
    p_enabled: enabled,
    p_steps: normalised.map((s) => ({ ...s })) as unknown as Json,
  })

  if (saveError) {
    console.error('[dynamic-pricing] save_dynamic_pricing failed:', {
      tier_id,
      code: saveError.code,
      message: saveError.message,
      hint:
        saveError.code === 'PGRST202'
          ? 'The function does not exist on this database. Apply migration 20260904000002_ticket_price_history.sql.'
          : undefined,
    })
    return { success: false, error: 'Failed to save pricing steps' }
  }

  revalidatePath(`/dashboard/events/${event_id}/pricing`)
  // THE PUBLIC PAGE TOO. This used to invalidate the organiser's own pricing
  // screen and nothing else, so a price change was visible to the person who
  // made it and to nobody else until the event page expired on its own timer.
  // A price is the single most important thing on that page to be right.
  await revalidateEventSurfacesById(adminClient, event_id)
  return { success: true }
}
