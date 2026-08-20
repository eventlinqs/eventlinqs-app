import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * MAY THIS USER MANAGE THIS EVENT? One answer, used by every event-scoped
 * organiser surface.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DIVERGENCE THIS ENDS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Founder ruling, 2026-08-19: "any organiser can refund". The refund machinery
 * already agreed. `resolveRefundScope` (src/lib/payments/refund-scope.ts) admits the
 * organisation OWNER **or** an organisation_members row with role owner, admin or
 * manager, and `create_refund_request` re-checks exactly the same set in SQL.
 *
 * The ROUTE that hosts the refund control did not. Both order pages resolved access
 * with
 *
 *     .from('organisations').select('id').eq('id', ...).eq('owner_id', user.id)
 *
 * and `getOrganiserEvent` did the same. So a manager could pass every
 * authorisation check the refund path performs and still never reach the button:
 * the page called notFound() first. Not a security hole, the wrong way round, but a
 * venue with staff hits it in week one and the ruling is not honoured.
 *
 * Two definitions of "may this person act on this event" is the defect. This is the
 * one definition, and it is deliberately written to match resolveRefundScope's role
 * list exactly. tests/unit/payments/event-access-matches-refund-scope.test.ts pins
 * the two together so they cannot drift apart again.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DELIBERATELY DOES NOT TOUCH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The MONEY and IDENTITY surfaces stay owner-only, and that is a decision rather
 * than an omission. `src/lib/organisations/scope.ts` resolves the caller's
 * organisations for roughly thirty dashboard surfaces, including /dashboard/payouts
 * and the organisation settings, and it lists by `owner_id` alone. Widening THAT
 * resolver would hand every manager the bank account, the payout destination and
 * the Connect onboarding in the same edit, which is a different ruling and is not
 * implied by "any organiser can refund".
 *
 * So this gate covers the event-scoped surfaces (an event's orders, attendees,
 * reporting) and the owner-only resolver keeps the money surfaces. The full audit of
 * which routes sit on which side is in
 * docs/roast/dashboard-access-divergence-2026-08-19.md, for a founder ruling.
 *
 * IT IS A GATE, NOT A DATA READER. It verifies identity with the SESSION client, so
 * RLS still applies to who the caller is, then answers only the access question.
 * Callers that need rows the organiser is not the subject of (orders, payments) go
 * on using the service-role client AFTER this returns allowed, which is the pattern
 * src/lib/payouts/auth.ts already uses and which was reviewed and accepted.
 */

/** The roles that may act on an organisation's events. Must equal ORG_MEMBER_ROLES. */
export const EVENT_MANAGER_ROLES = ['owner', 'admin', 'manager'] as const

export type EventAccess =
  | { allowed: true; via: 'owner' | 'member'; organisationId: string; userId: string; role: string }
  | { allowed: false; reason: 'unauthenticated' | 'event_not_found' | 'not_authorised' }

/**
 * Resolve whether the signed-in user may manage `eventId`.
 *
 * @param eventId the event being acted on
 */
export async function resolveEventAccess(eventId: string): Promise<EventAccess> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { allowed: false, reason: 'unauthenticated' }

  // The event is read with the ADMIN client on purpose. Reading it with the session
  // client makes "this event is not visible to you under RLS" indistinguishable from
  // "this event does not exist", and the events SELECT policy for organisers is one
  // of the policies being refactored in 20260819000001. The access decision below
  // does not depend on that policy, so it must not be gated by it.
  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('id, organisation_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!event?.organisation_id) return { allowed: false, reason: 'event_not_found' }

  const organisationId = event.organisation_id as string

  const { data: owned } = await admin
    .from('organisations')
    .select('id, owner_id')
    .eq('id', organisationId)
    .maybeSingle()
  if (owned?.owner_id === user.id) {
    return { allowed: true, via: 'owner', organisationId, userId: user.id, role: 'owner' }
  }

  const { data: member } = await admin
    .from('organisation_members')
    .select('role')
    .eq('organisation_id', organisationId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (member && (EVENT_MANAGER_ROLES as readonly string[]).includes(member.role as string)) {
    return { allowed: true, via: 'member', organisationId, userId: user.id, role: member.role as string }
  }

  return { allowed: false, reason: 'not_authorised' }
}
