import 'server-only'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * WHICH of the caller's businesses a dashboard request is about.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO END, PROVEN RATHER THAN ASSERTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Thirty-odd surfaces resolved the caller's organisation like this:
 *
 *     .from('organisations').select('id').eq('owner_id', user.id).single()
 *
 * That shape does not return the first row when several match. Run against the
 * TEST database on 2026-08-09 for an owner holding 26 organisations
 * (scripts/verify/maybe-single-behaviour.mjs, output saved at
 * docs/security/evidence/connect-lockout-2026-08-09/maybe-single-behaviour.txt):
 *
 *     .maybeSingle()  ->  406 Not Acceptable, PGRST116,
 *                         "JSON object requested, multiple (or no) rows returned"
 *                         details: Results contain 26 rows, ... requires 1 row
 *                         data: null
 *     .single()       ->  406 Not Acceptable, PGRST116,
 *                         "Cannot coerce the result to a single JSON object"
 *                         data: null
 *
 * Both hand back `data: null`, and every one of those call sites reads null as
 * "this person has no organisation". So the platform told an owner of 26
 * businesses that they had none: no events list, no event creation, no venues, no
 * invites, no organisation page, no payouts.
 *
 * That is the founder's product requirement failing at the second business:
 * "You cannot tie an organiser on my platform to one particular email address or
 * one particular bank account. People can have endless."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SHAPE OF THE FIX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Several organisations is the NORMAL case. So this resolver always reads a LIST,
 * never a single row, and it always names which member of that list the request is
 * scoped to. Every caller then works with one verified organisation and has the
 * full set available for a switcher.
 *
 * PRECEDENCE, and each step is deliberate:
 *
 *   1. An explicit id, from `?org=<uuid>`. The URL is the authority, so two browser
 *      tabs can sit on two different businesses at once and neither moves the
 *      other. That is what makes "switching never leaks one organisation's state
 *      onto another" true by construction rather than by careful state handling.
 *   2. The remembered id, from the `el_active_org` cookie, written only by the
 *      switch action. Without it, every sidebar link would drop the organiser back
 *      onto their first business, which makes a dashboard unusable at 26.
 *   3. The FIRST organisation by creation order. Deterministic on purpose: an
 *      unordered `limit(1)` picks an arbitrary row, and PostgREST really does vary
 *      it (two runs of the probe above returned the same 26 rows in two different
 *      orders), so a refresh could silently move somebody onto a different business.
 *
 * OWNERSHIP IS VERIFIED, NOT ASSUMED. An id that is not in the caller's own list is
 * refused with 403 rather than served, so changing a uuid in a query string cannot
 * read another owner's business. A stale COOKIE naming an organisation the caller
 * no longer owns is not an attack, it is a leftover, so that case falls back to the
 * default rather than erroring the organiser out of their own dashboard.
 *
 * WHY THE SERVICE ROLE. The stripe_* columns are revoked from `authenticated` by
 * column privilege (migration 20260808000010), because `authenticated` is one role
 * serving both the owner and any logged-in visitor. Identity is established with
 * the SESSION client (getUser, never getSession) and the service-role read is then
 * filtered to owner_id = that verified user, which is the pattern
 * src/lib/payouts/auth.ts already used and which was reviewed and accepted.
 */

/** Remembers the last business the organiser switched to. Written ONLY by switchOrganisation(). */
export const ACTIVE_ORGANISATION_COOKIE = 'el_active_org'

export type OwnedOrganisation = {
  id: string
  name: string
  slug: string
  status: string
  stripeAccountId: string | null
  stripeChargesEnabled: boolean
  stripePayoutsEnabled: boolean
  stripeOnboardingComplete: boolean
  payoutStatus: string
  createdAt: string
  /** Whether this business can take money right now. Drives the switcher's dot. */
  canSell: boolean
}

export type OrganisationScopeError =
  | { ok: false; status: 401; reason: 'unauthenticated' }
  | { ok: false; status: 404; reason: 'no_organisation' }
  | { ok: false; status: 403; reason: 'not_your_organisation' }

export type OrganisationScopeResult =
  | {
      ok: true
      userId: string
      /** The organisation this request is scoped to. Never null on the ok branch. */
      active: OwnedOrganisation
      /** Every organisation this user owns, oldest first. */
      organisations: OwnedOrganisation[]
      /** True when the caller named the organisation explicitly rather than defaulting. */
      explicit: boolean
    }
  | OrganisationScopeError

const SELECT_COLUMNS =
  'id, name, slug, status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarding_complete, payout_status, created_at'

type Row = {
  id: string
  name: string | null
  slug: string | null
  status: string | null
  stripe_account_id: string | null
  stripe_charges_enabled: boolean | null
  stripe_payouts_enabled: boolean | null
  stripe_onboarding_complete: boolean | null
  payout_status: string | null
  created_at: string | null
}

/**
 * Whether a business can sell paid tickets right now.
 *
 * 'unset' (no Stripe account) and 'restricted' both mean no, for different reasons,
 * and 'on_hold' is an EventLinqs admin decision. Only charges being enabled AND a
 * payout status that is neither withheld nor absent counts as yes.
 */
function canSellFrom(row: Row): boolean {
  return (
    Boolean(row.stripe_charges_enabled) &&
    row.payout_status !== 'restricted' &&
    row.payout_status !== 'on_hold' &&
    row.payout_status !== 'unset'
  )
}

function toOwned(row: Row): OwnedOrganisation {
  return {
    id: row.id,
    name: row.name ?? 'Untitled organisation',
    slug: row.slug ?? '',
    status: row.status ?? 'active',
    stripeAccountId: row.stripe_account_id,
    stripeChargesEnabled: Boolean(row.stripe_charges_enabled),
    stripePayoutsEnabled: Boolean(row.stripe_payouts_enabled),
    stripeOnboardingComplete: Boolean(row.stripe_onboarding_complete),
    payoutStatus: row.payout_status ?? 'active',
    createdAt: row.created_at ?? '',
    canSell: canSellFrom(row),
  }
}

/** Guard a query-string value before it reaches the database or a cookie. */
export function isUuid(value: string | null | undefined): value is string {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/**
 * Read the organisation id a request is asking for out of its search params.
 *
 * Accepts the resolved object a page gets from `await searchParams` and the
 * URLSearchParams a route handler gets, so both kinds of caller use one helper and
 * neither has to remember the parameter name.
 */
export function organisationIdFromParams(
  params: Record<string, string | string[] | undefined> | URLSearchParams | null | undefined,
): string | undefined {
  if (!params) return undefined
  const raw =
    params instanceof URLSearchParams
      ? params.get('org')
      : Array.isArray(params.org)
        ? params.org[0]
        : params.org
  return isUuid(raw) ? raw : undefined
}

export async function resolveOrganisationScope(
  requestedId?: string,
  options?: { useCookie?: boolean },
): Promise<OrganisationScopeResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, reason: 'unauthenticated' }

  const { data, error } = await createAdminClient()
    .from('organisations')
    .select(SELECT_COLUMNS)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[organisations/scope] list failed', { userId: user.id, error })
    return { ok: false, status: 404, reason: 'no_organisation' }
  }

  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return { ok: false, status: 404, reason: 'no_organisation' }

  const organisations = rows.map(toOwned)

  // 1. Explicit id wins. A uuid that is not the caller's own is refused, not served.
  if (isUuid(requestedId)) {
    const chosen = organisations.find((o) => o.id === requestedId)
    if (!chosen) return { ok: false, status: 403, reason: 'not_your_organisation' }
    return { ok: true, userId: user.id, active: chosen, organisations, explicit: true }
  }

  // 2. The remembered business. A cookie naming an organisation the caller no longer
  //    owns is a leftover rather than an attack, so it falls through to the default
  //    instead of locking them out of their own dashboard with a 403.
  if (options?.useCookie !== false) {
    const remembered = (await cookies()).get(ACTIVE_ORGANISATION_COOKIE)?.value
    if (isUuid(remembered)) {
      const chosen = organisations.find((o) => o.id === remembered)
      if (chosen) return { ok: true, userId: user.id, active: chosen, organisations, explicit: false }
    }
  }

  // 3. The oldest business. Deterministic, so a refresh never moves anybody.
  return { ok: true, userId: user.id, active: organisations[0], organisations, explicit: false }
}

/**
 * Every organisation the caller owns, for a switcher, with no active one nominated.
 *
 * Returns an empty list rather than throwing when the caller has none, because
 * every caller of this is chrome and chrome must not be the thing that errors.
 */
export async function listOwnedOrganisations(): Promise<OwnedOrganisation[]> {
  const scope = await resolveOrganisationScope()
  return scope.ok ? scope.organisations : []
}

/**
 * Append `?org=<id>` to a dashboard path, so a link keeps the organiser on the
 * business they are looking at.
 *
 * Only appended when there is more than one organisation, so a single-business
 * organiser's URLs are byte-for-byte what they were before this change and that
 * surface is provably unaltered.
 */
export function withOrganisation(path: string, organisationId: string, total: number): string {
  if (total < 2) return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}org=${encodeURIComponent(organisationId)}`
}
