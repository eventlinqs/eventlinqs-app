import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ResolvedOrganisation = {
  userId: string
  organisationId: string
  stripeAccountId: string | null
  stripeChargesEnabled: boolean
  stripePayoutsEnabled: boolean
}

export type OrganisationChoice = {
  id: string
  name: string
  /** True when this is the organisation the request is scoped to. */
  active: boolean
  /** So the switcher can show which businesses can take money and which cannot. */
  canSell: boolean
}

export type ResolveError =
  | { ok: false; status: 401; reason: 'unauthenticated' }
  | { ok: false; status: 404; reason: 'no_organisation' }
  | { ok: false; status: 403; reason: 'not_your_organisation' }

export type ResolveResult =
  | { ok: true; org: ResolvedOrganisation; choices: OrganisationChoice[] }
  | ResolveError

/**
 * Resolve WHICH of the caller's organisations this request is about.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS REPLACES, and it broke the founder's own account completely
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This function used to do:
 *
 *     .from('organisations').select(...).eq('owner_id', user.id).maybeSingle()
 *     if (error) return { ok: false, status: 404, reason: 'no_organisation' }
 *
 * `maybeSingle()` does not return the first row when several match. From the
 * postgrest-js implementation itself
 * (node_modules/@supabase/postgrest-js/dist/index.mjs):
 *
 *     if (isMaybeSingle && Array.isArray(data)) if (data.length > 1) {
 *       error = { code: "PGRST116",
 *         details: `Results contain ${data.length} rows, ...requires 1 row`,
 *         message: "JSON object requested, multiple (or no) rows returned" }
 *       data = null; status = 406
 *     }
 *
 * So a user with two or more organisations got PGRST116, fell into the `if (error)`
 * branch, and was told they had NO organisation. One owner_id on production holds
 * SIXTEEN. Every payouts surface, the summary, the history, the refunds list and
 * the Stripe dashboard link, returned 404 "no_organisation" to the person who owns
 * all sixteen businesses.
 *
 * That is not an edge case. The founder's ruling is that a person may run endless
 * businesses with endless bank accounts, so a platform that breaks at the second
 * one is broken at its most fundamental level.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SHAPE OF THE FIX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Multiple organisations is the NORMAL case, not the exception, so the resolver
 * returns the full list alongside the active one. That single change is what stops
 * one organisation's payout state leaking onto another: every caller now says which
 * organisation it means, rather than relying on there being exactly one.
 *
 * An explicit `organisationId` is verified against `owner_id` and refused with 403
 * rather than 404 when it belongs to somebody else, so a caller cannot read another
 * owner's payout state by changing an id in a query string.
 *
 * With no `organisationId`, the FIRST organisation by creation order is used. That
 * is deliberately deterministic rather than "most recent": a stable default means a
 * page refresh cannot silently move the organiser onto a different business, which
 * is its own version of leaking state between them.
 */
export async function resolveOrganiserScope(organisationId?: string): Promise<ResolveResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, reason: 'unauthenticated' }

  const admin = createAdminClient()
  // A LIST, never maybeSingle. This is the whole fix.
  const { data: rows, error } = await admin
    .from('organisations')
    .select(
      'id, name, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, payout_status, created_at',
    )
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[payouts/auth] org lookup failed', { userId: user.id, error })
    return { ok: false, status: 404, reason: 'no_organisation' }
  }
  if (!rows || rows.length === 0) return { ok: false, status: 404, reason: 'no_organisation' }

  const selected = organisationId ? rows.find((r) => r.id === organisationId) : rows[0]

  // An id that is not in the caller's own list is somebody else's organisation, or
  // does not exist. 403 rather than 404 so the caller is told the difference between
  // "you have none" and "that one is not yours".
  if (!selected) return { ok: false, status: 403, reason: 'not_your_organisation' }

  return {
    ok: true,
    org: {
      userId: user.id,
      organisationId: selected.id as string,
      stripeAccountId: (selected.stripe_account_id as string | null) ?? null,
      stripeChargesEnabled: Boolean(selected.stripe_charges_enabled),
      stripePayoutsEnabled: Boolean(selected.stripe_payouts_enabled),
    },
    choices: rows.map((r) => ({
      id: r.id as string,
      name: (r.name as string) ?? 'Untitled organisation',
      active: r.id === selected.id,
      canSell:
        Boolean(r.stripe_charges_enabled) &&
        r.payout_status !== 'restricted' &&
        r.payout_status !== 'on_hold',
    })),
  }
}

/**
 * Every organisation this user owns, for a switcher or a picker.
 *
 * Separate from resolveOrganiserScope so a surface that only needs the list does
 * not have to nominate an active organisation to get it.
 */
export async function listOwnedOrganisations(): Promise<OrganisationChoice[]> {
  const scope = await resolveOrganiserScope()
  return scope.ok ? scope.choices : []
}
