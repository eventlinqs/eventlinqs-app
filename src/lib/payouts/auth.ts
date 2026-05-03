import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ResolvedOrganisation = {
  userId: string
  organisationId: string
  stripeAccountId: string | null
  stripeChargesEnabled: boolean
  stripePayoutsEnabled: boolean
}

export type ResolveError =
  | { ok: false; status: 401; reason: 'unauthenticated' }
  | { ok: false; status: 404; reason: 'no_organisation' }

export type ResolveResult = { ok: true; org: ResolvedOrganisation } | ResolveError

/**
 * Resolves the authenticated user's owned organisation for the M6 Phase 4
 * Payouts dashboard. Owner-only for v1; member-scope (read-only finance
 * role) is a Phase 5 follow-up once the membership-role model lands.
 *
 * Uses the session client to read auth.uid(), then the admin client to
 * select the organisation row so we get the columns the API routes need
 * without paying RLS cost on a query that the user is already entitled to.
 */
export async function resolveOrganiserScope(): Promise<ResolveResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, reason: 'unauthenticated' }

  const admin = createAdminClient()
  const { data: org, error } = await admin
    .from('organisations')
    .select('id, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[payouts/auth] org lookup failed', { userId: user.id, error })
    return { ok: false, status: 404, reason: 'no_organisation' }
  }
  if (!org) return { ok: false, status: 404, reason: 'no_organisation' }

  return {
    ok: true,
    org: {
      userId: user.id,
      organisationId: org.id as string,
      stripeAccountId: (org.stripe_account_id as string | null) ?? null,
      stripeChargesEnabled: Boolean(org.stripe_charges_enabled),
      stripePayoutsEnabled: Boolean(org.stripe_payouts_enabled),
    },
  }
}
