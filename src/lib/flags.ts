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
  // Surpass edges (Fill the room panel, Know before you go, What you keep
  // pricing comparison): launch features, ON for launch (founder ruling
  // 2026-07-11, migration 20260711000003 records it).
  surpass_edges: true,
  // Event Launch Kit (post-publish kit screen, city waitlist, tool-first
  // organiser positioning). Default ON for testing per the founder directive.
  launch_kit: true,
  // Magic Start: describe-your-event AI draft + voice input at the top of
  // event creation. Default ON for testing.
  magic_start: true,
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
