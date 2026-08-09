import { resolveOrganisationScope, type OwnedOrganisation } from '@/lib/organisations/scope'

/**
 * The payouts view of "which of the caller's businesses is this about".
 *
 * ONE RESOLVER, NOT TWO. This used to hold its own copy of the list-and-verify
 * logic, written for the payouts surface while the other 28 call sites still used
 * `.eq('owner_id', user.id).single()`. Two definitions of the same question is how
 * the connect divergence happened in the first place, with three writers holding
 * three definitions of "what Stripe says", so this now delegates to
 * src/lib/organisations/scope.ts and keeps only the payouts-shaped return type its
 * callers already consume.
 *
 * The behaviour those callers depend on is unchanged: a LIST rather than
 * `maybeSingle()`, `?org=<id>` honoured, ownership verified with 403 rather than
 * 404 for somebody else's id, and the oldest organisation as a deterministic
 * default. What is added is that the default now also honours the remembered
 * business from the switcher, so the payouts page agrees with the rest of the
 * dashboard about which business the organiser is looking at.
 */

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
  | {
      ok: true
      org: ResolvedOrganisation
      choices: OrganisationChoice[]
      /** Every owned organisation in full, for the shared switcher. */
      organisations: OwnedOrganisation[]
    }
  | ResolveError

export async function resolveOrganiserScope(organisationId?: string): Promise<ResolveResult> {
  const scope = await resolveOrganisationScope(organisationId)
  if (!scope.ok) return scope

  return {
    ok: true,
    org: {
      userId: scope.userId,
      organisationId: scope.active.id,
      stripeAccountId: scope.active.stripeAccountId,
      stripeChargesEnabled: scope.active.stripeChargesEnabled,
      stripePayoutsEnabled: scope.active.stripePayoutsEnabled,
    },
    choices: scope.organisations.map((o) => ({
      id: o.id,
      name: o.name,
      active: o.id === scope.active.id,
      canSell: o.canSell,
    })),
    organisations: scope.organisations,
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
