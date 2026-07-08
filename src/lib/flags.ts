import 'server-only'
import { createPublicClient } from '@/lib/supabase/public-client'

/**
 * Feature flags, read from public.feature_flags (one row per flag, column
 * `flag`, public SELECT RLS: the primitive introduced by the broadcast layer
 * in 20260704000004). Each flag names its own fail-safe default so a
 * database blip never flips a surface unexpectedly: seated_events defaults
 * ON (founder directive 2026-07-05, on for testing).
 */
const FLAG_DEFAULTS: Record<string, boolean> = {
  seated_events: true,
  surpass_edges: true,
}

export async function isFlagEnabled(key: keyof typeof FLAG_DEFAULTS & string): Promise<boolean> {
  const fallback = FLAG_DEFAULTS[key] ?? false
  try {
    const client = createPublicClient()
    const { data, error } = await client
      .from('feature_flags')
      .select('enabled')
      .eq('flag', key)
      .maybeSingle()
    if (error || !data) return fallback
    return Boolean(data.enabled)
  } catch {
    return fallback
  }
}
