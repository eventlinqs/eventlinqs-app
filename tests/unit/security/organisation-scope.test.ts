/**
 * The platform was broken for anyone running two businesses.
 *
 * THE DEFECT. Thirty-odd surfaces resolved "the caller's organisation" with
 * `.eq('owner_id', user.id).single()` or `.maybeSingle()`. Neither returns the first
 * row when several match. Run against the real TEST database on 2026-08-09 for an
 * owner holding 26 organisations (scripts/verify/maybe-single-behaviour.mjs, saved at
 * docs/security/evidence/connect-lockout-2026-08-09/maybe-single-behaviour.txt):
 *
 *     .maybeSingle()  ->  406, PGRST116, data: null
 *                         "Results contain 26 rows, ... requires 1 row"
 *     .single()       ->  406, PGRST116, data: null
 *                         "Cannot coerce the result to a single JSON object"
 *
 * Every one of those call sites read `data: null` as "this person has no
 * organisation". So the platform told an owner of 26 businesses that they had none.
 *
 * These tests pin the resolver that replaces all of them, and they pin the two
 * properties that matter for money: an id belonging to somebody else is refused, and
 * the default is deterministic so a refresh cannot silently move an organiser onto a
 * different business.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const cookieStore = { value: undefined as string | undefined }
const authUser = { id: 'user-1' as string | null }
const orgRows = {
  data: [] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'el_active_org' && cookieStore.value ? { name, value: cookieStore.value } : undefined,
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: authUser.id ? { id: authUser.id } : null } }),
    },
  }),
}))

// The mock HONOURS .order(), deliberately. A mock that ignored it would let the
// determinism test pass on nothing but the order the fixture happened to be written
// in, which is precisely the assumption that made the real `.limit(1)` call sites
// look safe.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: (column: string, opts?: { ascending?: boolean }) => {
            if (orgRows.error) return Promise.resolve(orgRows)
            const direction = opts?.ascending === false ? -1 : 1
            const sorted = [...orgRows.data].sort((a, b) =>
              String(a[column]) < String(b[column]) ? -direction : direction,
            )
            return Promise.resolve({ data: sorted, error: null })
          },
        }),
      }),
    }),
  }),
}))

const { resolveOrganisationScope, isUuid, withOrganisation, organisationIdFromParams } =
  await import('@/lib/organisations/scope')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const SOMEBODY_ELSES = '33333333-3333-4333-8333-333333333333'

function org(id: string, name: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/ /g, '-'),
    status: 'active',
    stripe_account_id: `acct_${id.slice(0, 4)}`,
    stripe_charges_enabled: true,
    stripe_payouts_enabled: true,
    stripe_onboarding_complete: true,
    payout_status: 'active',
    created_at: createdAt,
    ...extra,
  }
}

beforeEach(() => {
  cookieStore.value = undefined
  authUser.id = 'user-1'
  orgRows.data = [
    org(A, 'First Business', '2026-01-01T00:00:00Z'),
    org(B, 'Second Business', '2026-06-01T00:00:00Z'),
  ]
  orgRows.error = null
})

describe('resolveOrganisationScope: the defect that broke the second business', () => {
  it('returns BOTH organisations rather than erroring, which is the whole fix', async () => {
    const scope = await resolveOrganisationScope()
    expect(scope.ok).toBe(true)
    if (!scope.ok) return
    expect(scope.organisations.map((o) => o.id)).toEqual([A, B])
  })

  it('still works for the single-business organiser, unchanged', async () => {
    orgRows.data = [org(A, 'Only Business', '2026-01-01T00:00:00Z')]
    const scope = await resolveOrganisationScope()
    expect(scope.ok).toBe(true)
    if (!scope.ok) return
    expect(scope.active.id).toBe(A)
    expect(scope.organisations).toHaveLength(1)
  })

  it('defaults to the OLDEST business, deterministically, never an arbitrary row', async () => {
    // An unordered limit(1) picks whatever the planner returned, and PostgREST does
    // vary it: two runs of the probe returned the same 26 rows in two different
    // orders. A refresh must never silently move somebody onto another business.
    const first = await resolveOrganisationScope()
    orgRows.data = [orgRows.data[1], orgRows.data[0]] // same rows, other order
    const second = await resolveOrganisationScope()
    expect(first.ok && first.active.id).toBe(A)
    expect(second.ok && second.active.id).toBe(A)
  })
})

describe('resolveOrganisationScope: ownership', () => {
  it('refuses an id belonging to somebody else with 403, not 404', async () => {
    const scope = await resolveOrganisationScope(SOMEBODY_ELSES)
    expect(scope.ok).toBe(false)
    if (scope.ok) return
    expect(scope.status).toBe(403)
    expect(scope.reason).toBe('not_your_organisation')
  })

  it('refuses an unauthenticated caller before touching the database', async () => {
    authUser.id = null
    const scope = await resolveOrganisationScope(A)
    expect(scope.ok).toBe(false)
    if (scope.ok) return
    expect(scope.status).toBe(401)
  })

  it('reports no organisation when the caller genuinely owns none', async () => {
    orgRows.data = []
    const scope = await resolveOrganisationScope()
    expect(scope.ok).toBe(false)
    if (scope.ok) return
    expect(scope.status).toBe(404)
  })
})

describe('resolveOrganisationScope: precedence', () => {
  it('an explicit id beats the remembered one, so a tab is pinned by its URL', async () => {
    cookieStore.value = A
    const scope = await resolveOrganisationScope(B)
    expect(scope.ok && scope.active.id).toBe(B)
    expect(scope.ok && scope.explicit).toBe(true)
  })

  it('the remembered business is used when the URL says nothing', async () => {
    cookieStore.value = B
    const scope = await resolveOrganisationScope()
    expect(scope.ok && scope.active.id).toBe(B)
    expect(scope.ok && scope.explicit).toBe(false)
  })

  it('a cookie naming a business the caller no longer owns falls back, never 403s', async () => {
    // A leftover cookie is not an attack. Erroring here would lock an organiser out
    // of their own dashboard until they cleared their browser.
    cookieStore.value = SOMEBODY_ELSES
    const scope = await resolveOrganisationScope()
    expect(scope.ok).toBe(true)
    expect(scope.ok && scope.active.id).toBe(A)
  })

  it('ignores the cookie entirely when asked to, which is what the switch action needs', async () => {
    cookieStore.value = B
    const scope = await resolveOrganisationScope(undefined, { useCookie: false })
    expect(scope.ok && scope.active.id).toBe(A)
  })
})

describe('canSell, the dot on the switcher', () => {
  it('is false for every status that stops a business trading', async () => {
    orgRows.data = [
      org(A, 'Restricted', '2026-01-01T00:00:00Z', { payout_status: 'restricted' }),
      org(B, 'Held', '2026-02-01T00:00:00Z', { payout_status: 'on_hold' }),
      org('44444444-4444-4444-8444-444444444444', 'Unset', '2026-03-01T00:00:00Z', {
        payout_status: 'unset',
        stripe_account_id: null,
        stripe_charges_enabled: false,
      }),
      org('55555555-5555-4555-8555-555555555555', 'No charges', '2026-04-01T00:00:00Z', {
        stripe_charges_enabled: false,
      }),
      org('66666666-6666-4666-8666-666666666666', 'Healthy', '2026-05-01T00:00:00Z'),
    ]
    const scope = await resolveOrganisationScope()
    expect(scope.ok).toBe(true)
    if (!scope.ok) return
    expect(scope.organisations.map((o) => o.canSell)).toEqual([false, false, false, false, true])
  })
})

describe('the query-string guards', () => {
  it('accepts only a uuid, so nothing else reaches the database or a cookie', () => {
    expect(isUuid(A)).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid("' OR 1=1 --")).toBe(false)
    expect(isUuid(null)).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })

  it('reads ?org= from both a page searchParams object and a route URLSearchParams', () => {
    expect(organisationIdFromParams({ org: A })).toBe(A)
    expect(organisationIdFromParams({ org: [A, B] })).toBe(A)
    expect(organisationIdFromParams(new URLSearchParams(`org=${A}`))).toBe(A)
    expect(organisationIdFromParams({ org: 'junk' })).toBeUndefined()
    expect(organisationIdFromParams(undefined)).toBeUndefined()
  })
})

describe('withOrganisation: the single-business surface is provably unchanged', () => {
  it('adds nothing at all when the caller owns one business', () => {
    expect(withOrganisation('/dashboard/events', A, 1)).toBe('/dashboard/events')
    expect(withOrganisation('/dashboard/events?tab=draft', A, 1)).toBe('/dashboard/events?tab=draft')
  })

  it('names the business when there are several, respecting an existing query string', () => {
    expect(withOrganisation('/dashboard/events', A, 2)).toBe(`/dashboard/events?org=${A}`)
    expect(withOrganisation('/dashboard/events?tab=draft', A, 2)).toBe(
      `/dashboard/events?tab=draft&org=${A}`,
    )
  })
})
