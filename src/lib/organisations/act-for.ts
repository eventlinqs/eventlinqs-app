import { createAdminClient } from '@/lib/supabase/admin'

/**
 * MAY THIS CALLER ACT FOR THIS ORGANISATION? Answered under the service role,
 * deliberately, and answered BEFORE any privileged read of that organisation.
 *
 * WHY THIS EXISTS, and why the obvious alternative is wrong.
 *
 * The publish gate reads five columns of `organisations` (stripe_account_id,
 * stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country,
 * payout_status) to decide whether a paid event may go on sale. Migration
 * 20260819000002 revokes SELECT on `organisations` from anon AND authenticated
 * and re-grants six columns: id, name, slug, description, logo_url, website.
 * None of the five are in that list, so once that migration lands the gate's read
 * is a permission-denied (42501) on the session client and every publish is
 * refused with "Organisation not found."
 *
 * The ownership checks themselves broke on the same revoke, which is the part
 * that is easy to miss: they FILTER on `owner_id`, and PostgreSQL requires SELECT
 * privilege on every column named in a WHERE clause, not merely on the columns
 * returned. `.eq('owner_id', user.id)` is therefore denied just as surely as
 * selecting the column would be. So the fix cannot be "check ownership on the
 * session client, then read on the service role": the first half does not survive
 * the migration either.
 *
 * The rejected alternative was granting the five columns back to `authenticated`.
 * That reopens exactly what the migration closes: the "Organisations are viewable
 * by everyone" policy admits any active organisation, so every signed-in user
 * could read every active organiser's Stripe posture. Founder ruling, 20 August
 * 2026: those fields are a platform decision about whether an organiser may sell,
 * not data a browser session needs.
 *
 * THE SERVICE ROLE BYPASSES RLS, so this helper is the ownership check that RLS
 * would otherwise have been. A service-role read with no ownership check does not
 * remove an exposure, it converts it into a cross-tenant read, which is worse.
 * That is why this returns an authority rather than a row: the caller cannot get
 * the organisation's sale posture without first passing the check, because the
 * check and the read live behind one function.
 *
 * ROLES ARE PER CALL SITE, NOT UNIFORM, and unifying them would silently widen
 * access. `createEvent` admits the OWNER only. `updateEvent` admits the owner or a
 * member holding owner/admin/manager. Those were the semantics before this helper
 * and they are the semantics after it; `allow` makes the difference explicit at
 * each site instead of hiding it in a shared default.
 */

/** Membership roles that may act for an organisation, most privileged first. */
export const MANAGING_ROLES = ['owner', 'admin', 'manager'] as const
export type ManagingRole = (typeof MANAGING_ROLES)[number]

export type ActForOrganisation =
  | { ok: true; organisationId: string; via: 'owner' | ManagingRole }
  | { ok: false; reason: 'not_your_organisation' }

/**
 * @param userId          the authenticated caller, from getUser(). Never trust a client-supplied id.
 * @param organisationId  the organisation the caller wants to act for.
 * @param allow           'owner' admits the owner only; 'owner_or_manager' also admits
 *                        a member holding one of MANAGING_ROLES.
 */
export async function assertCallerMayActForOrganisation(
  userId: string,
  organisationId: string | null | undefined,
  allow: 'owner' | 'owner_or_manager',
): Promise<ActForOrganisation> {
  if (!userId || !organisationId) return { ok: false, reason: 'not_your_organisation' }

  const admin = createAdminClient()

  // The owner test. Filtering on owner_id is legal here BECAUSE this is the
  // service role; the same filter on the session client is what the column
  // lockdown denies.
  const { data: owned } = await admin
    .from('organisations')
    .select('id')
    .eq('id', organisationId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (owned) return { ok: true, organisationId, via: 'owner' }

  if (allow === 'owner') return { ok: false, reason: 'not_your_organisation' }

  const { data: membership } = await admin
    .from('organisation_members')
    .select('role')
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
    .in('role', MANAGING_ROLES as unknown as string[])
    .maybeSingle()

  if (membership?.role) return { ok: true, organisationId, via: membership.role as ManagingRole }

  return { ok: false, reason: 'not_your_organisation' }
}
