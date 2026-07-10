import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Organisation access resolution for the seating surfaces.
 *
 * The seat-map builder and seats management were owner-only; the door scanner
 * already trusted organisation members with the owner/admin/manager roles
 * (scan_ticket). This helper brings the seating surfaces to the same policy,
 * so the team member who runs the room can also build and manage it. Reads
 * run under the caller's session client, so RLS still applies: a user can
 * only ever resolve organisations they genuinely own or belong to.
 */

export const SEATING_MANAGER_ROLES = ['owner', 'admin', 'manager'] as const

type Client = SupabaseClient<Database>

export interface ManagedOrganisation {
  id: string
  /** 'owner' when the caller owns the organisation, else their member role. */
  via: string
}

/** The organisation this user may manage seating for (owner first). */
export async function resolveSeatingOrganisation(
  supabase: Client,
  userId: string,
): Promise<ManagedOrganisation | null> {
  const { data: owned } = await supabase
    .from('organisations')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle()
  if (owned) return { id: owned.id, via: 'owner' }

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('organisation_id, role')
    .eq('user_id', userId)
    .in('role', [...SEATING_MANAGER_ROLES])
    .limit(1)
    .maybeSingle()
  if (membership) return { id: membership.organisation_id, via: membership.role }

  return null
}

/** May this user manage seating for the given organisation? */
export async function canManageOrganisationSeating(
  supabase: Client,
  userId: string,
  organisationId: string,
): Promise<boolean> {
  const { data: owned } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', organisationId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (owned) return true

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('id')
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
    .in('role', [...SEATING_MANAGER_ROLES])
    .maybeSingle()
  return !!membership
}
