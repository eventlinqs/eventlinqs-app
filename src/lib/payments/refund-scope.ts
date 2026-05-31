import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Authorisation for the refund operator path. Resolves whether an actor may
 * refund a given order:
 *   - platform admin (admin_users role super_admin/admin/support, not disabled)
 *     may refund any order;
 *   - an organiser who owns the order's organisation, or is an
 *     organisation_members owner/admin/manager of it, may refund only their
 *     own events' orders;
 *   - everyone else is rejected.
 *
 * Enforced here (service layer), again inside the create_refund_request and
 * reconcile_refund RPCs (defence in depth via p_actor_id), and in RLS.
 */

export type RefundScope =
  | { allowed: true; via: 'admin' | 'organiser'; organisationId: string }
  | { allowed: false; reason: string }

const ADMIN_ROLES = ['super_admin', 'admin', 'support']
const ORG_MEMBER_ROLES = ['owner', 'admin', 'manager']

export async function resolveRefundScope(
  client: SupabaseClient,
  orderId: string,
  actorId: string,
): Promise<RefundScope> {
  const { data: order } = await client
    .from('orders')
    .select('id, organisation_id')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return { allowed: false, reason: 'order_not_found' }

  const organisationId = order.organisation_id as string

  const { data: admin } = await client
    .from('admin_users')
    .select('id, role, disabled_at')
    .eq('id', actorId)
    .maybeSingle()
  if (admin && !admin.disabled_at && ADMIN_ROLES.includes(admin.role)) {
    return { allowed: true, via: 'admin', organisationId }
  }

  const { data: owned } = await client
    .from('organisations')
    .select('id, owner_id')
    .eq('id', organisationId)
    .maybeSingle()
  if (owned && owned.owner_id === actorId) {
    return { allowed: true, via: 'organiser', organisationId }
  }

  const { data: member } = await client
    .from('organisation_members')
    .select('organisation_id, user_id, role')
    .eq('organisation_id', organisationId)
    .eq('user_id', actorId)
    .maybeSingle()
  if (member && ORG_MEMBER_ROLES.includes(member.role)) {
    return { allowed: true, via: 'organiser', organisationId }
  }

  return { allowed: false, reason: 'not_authorised' }
}
