import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * M6 Phase 5 - Refund authorization scope.
 *
 * Two roles can interact with a refund:
 *   - Organiser owner: full read/write on refunds for their org
 *   - Buyer: read on refunds tied to their orders, write only on the
 *     create-request endpoint for their own orders
 *
 * Member-scope (finance role) is deferred to M7 admin like Phase 4.
 */

export interface OrganiserScope {
  kind: 'organiser'
  userId: string
  organisationId: string
  ownerId: string
}

export interface BuyerScope {
  kind: 'buyer'
  userId: string
}

export type RefundScope = OrganiserScope | BuyerScope

export type ResolveOrganiserResult =
  | { ok: true; org: OrganiserScope }
  | { ok: false; status: 401 | 403 | 404; reason: string }

export type ResolveBuyerResult =
  | { ok: true; buyer: BuyerScope }
  | { ok: false; status: 401; reason: string }

export async function resolveOrganiserRefundScope(): Promise<ResolveOrganiserResult> {
  const sessionClient = await createClient()
  const {
    data: { user },
    error: userError,
  } = await sessionClient.auth.getUser()
  if (userError || !user) {
    return { ok: false, status: 401, reason: 'unauthenticated' }
  }

  const admin = createAdminClient()
  const { data: org, error: orgError } = await admin
    .from('organisations')
    .select('id, owner_id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (orgError) return { ok: false, status: 404, reason: 'no_organisation' }
  if (!org) return { ok: false, status: 404, reason: 'no_organisation' }

  return {
    ok: true,
    org: {
      kind: 'organiser',
      userId: user.id,
      organisationId: org.id as string,
      ownerId: org.owner_id as string,
    },
  }
}

export async function resolveBuyerScope(): Promise<ResolveBuyerResult> {
  const sessionClient = await createClient()
  const {
    data: { user },
    error: userError,
  } = await sessionClient.auth.getUser()
  if (userError || !user) {
    return { ok: false, status: 401, reason: 'unauthenticated' }
  }
  return { ok: true, buyer: { kind: 'buyer', userId: user.id } }
}
