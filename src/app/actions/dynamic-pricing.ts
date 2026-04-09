'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

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

  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', event.organisation_id)
    .eq('owner_id', user.id)
    .single()

  if (!org) return { success: false, error: 'Access denied' }

  // All writes use adminClient (Principle 1)
  const adminClient = createAdminClient()

  // Toggle dynamic_pricing_enabled on the tier
  const { error: toggleError } = await adminClient
    .from('ticket_tiers')
    .update({ dynamic_pricing_enabled: enabled })
    .eq('id', tier_id)

  if (toggleError) {
    console.error('[dynamic-pricing] Failed to toggle dynamic_pricing_enabled:', toggleError)
    return { success: false, error: 'Failed to update tier' }
  }

  // Delete all existing steps and replace (simplest correct approach)
  const { error: deleteError } = await adminClient
    .from('dynamic_pricing_rules')
    .delete()
    .eq('ticket_tier_id', tier_id)

  if (deleteError) {
    console.error('[dynamic-pricing] Failed to delete existing rules:', deleteError)
    return { success: false, error: 'Failed to update pricing steps' }
  }

  if (enabled && steps.length > 0) {
    const rows = steps.map((s, i) => ({
      ticket_tier_id: tier_id,
      step_order: i + 1,
      capacity_threshold_percent: s.capacity_threshold_percent,
      price_cents: s.price_cents,
    }))

    const { error: insertError } = await adminClient
      .from('dynamic_pricing_rules')
      .insert(rows)

    if (insertError) {
      console.error('[dynamic-pricing] Failed to insert pricing rules:', insertError)
      return { success: false, error: 'Failed to save pricing steps' }
    }
  }

  revalidatePath(`/dashboard/events/${event_id}/pricing`)
  return { success: true }
}
