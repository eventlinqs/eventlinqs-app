import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
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

/**
 * DELETED ON PURPOSE: `resolveSeatingOrganisation(supabase, userId)`.
 *
 * It asked the wrong question, and it asked it in the broken way.
 *
 * The wrong way: it resolved the caller's organisation with
 * `.eq('owner_id', userId).maybeSingle()`, which returns PGRST116 and `data: null`
 * rather than a row when the caller owns more than one. So an owner of several
 * businesses fell straight through to the membership branch and, owning rather than
 * being a member of their own businesses, resolved to null. Every seating surface
 * answered "Organisation not found" and the seat-map builder was unreachable.
 *
 * The wrong question: even with the row-count bug fixed, "which ONE organisation
 * does this user manage" cannot gate a venue that belongs to their SECOND business.
 * The gate has to run the other way round. Read the venue or the chart first, find
 * which organisation it belongs to, then ask whether the caller may manage THAT one.
 * That is what canManageOrganisationSeating below already does, for a named
 * organisation, with the session client so RLS still applies.
 *
 * The permission granted is identical for a single-business organiser and is never
 * wider than "an organisation this caller owns or manages", so nothing is loosened
 * by the change.
 */

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

/**
 * The seating gate, in the only order that works for a person with several
 * businesses: find which organisation the VENUE belongs to, then ask whether this
 * caller may manage that one.
 *
 * The venue read runs on the admin client because a member who is not the owner is
 * blocked by owner-scoped venue RLS, which is why the old code read it that way
 * too. Reading a venue row is not the permission: `canManageOrganisationSeating`
 * below it is, and that runs on the caller's session client so RLS still applies to
 * the decision itself. A caller who may not manage the venue's organisation gets
 * exactly the same refusal as before.
 *
 * `is_active` is deliberately required, matching the previous behaviour, so a
 * soft-deleted venue stays unreachable.
 */
export async function requireVenueSeatingAccess(
  supabase: Client,
  userId: string,
  venueId: string,
): Promise<{ ok: true; organisationId: string } | { ok: false }> {
  const { data: venue } = await createAdminClient()
    .from('venues')
    .select('id, organisation_id')
    .eq('id', venueId)
    .eq('is_active', true)
    .maybeSingle()
  if (!venue?.organisation_id) return { ok: false }

  const allowed = await canManageOrganisationSeating(supabase, userId, venue.organisation_id)
  return allowed ? { ok: true, organisationId: venue.organisation_id } : { ok: false }
}
