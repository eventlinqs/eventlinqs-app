import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Get the current effective price for a ticket tier.
 * Calls the get_current_tier_price RPC which handles dynamic pricing step logic.
 * Uses the admin (service-role) client so this works on public pages too:
 * the RPC is SECURITY DEFINER and only granted to authenticated + service_role.
 * Falls back to the tier's base price if the RPC fails.
 *
 * When SUPABASE_SERVICE_ROLE_KEY is absent (e.g. CI build runners that only
 * have NEXT_PUBLIC_* env), returns 0 so callers fall back to the static base
 * price. This keeps /events/[slug] statically pre-renderable in environments
 * that intentionally withhold the service role secret from the build.
 */
export async function getCurrentTierPrice(tierId: string): Promise<number> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return 0

  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('get_current_tier_price', {
    p_tier_id: tierId,
  })

  if (error || data === null || data === undefined) {
    console.error('[dynamic-pricing] get_current_tier_price RPC failed:', error)
    // Fall back to reading the base price directly
    const { data: tier, error: tierError } = await supabase
      .from('ticket_tiers')
      .select('price')
      .eq('id', tierId)
      .single()

    if (tierError || !tier) {
      console.error('[dynamic-pricing] Fallback base price read failed:', tierError)
      return 0
    }
    return tier.price
  }

  return data as number
}

/**
 * Build a map of tierId → current effective price for multiple tiers.
 * Runs all RPC calls in parallel for performance.
 */
export async function getDynamicPriceMap(tierIds: string[]): Promise<Map<string, number>> {
  if (tierIds.length === 0) return new Map()

  const results = await Promise.all(
    tierIds.map(async (id) => {
      const price = await getCurrentTierPrice(id)
      return [id, price] as [string, number]
    })
  )

  // Only include tiers with a positive price so callers can use ?? t.price as a
  // safe fallback. A 0 result means the RPC found no active dynamic pricing rules
  // for this tier (not that the tier is genuinely free).
  return new Map(results.filter(([, price]) => price > 0))
}
