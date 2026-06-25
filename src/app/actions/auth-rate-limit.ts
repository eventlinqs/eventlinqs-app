'use server'

import { actionRateLimit } from '@/lib/rate-limit/action'

/**
 * Edge rate-limit gate for the client login form. Login runs client-side against
 * Supabase, so this server action is called first to throttle attempts per IP
 * (credential-stuffing / brute-force and magic-link email-bombing) at the app
 * edge. The auth-login policy is failClosed, so a missing Upstash config blocks
 * in production. Supabase GoTrue keeps its own limit underneath.
 */
export async function assertLoginRateLimit(): Promise<{ ok: boolean }> {
  const rl = await actionRateLimit('auth-login')
  return { ok: rl.ok }
}
