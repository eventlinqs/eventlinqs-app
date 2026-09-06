import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * THE OWNERSHIP CHECK THAT MAKES THE SERVICE-ROLE READ SAFE.
 *
 * Migration 20260819000002 revokes SELECT on public.organisations from anon and
 * authenticated and re-grants six columns. The publish gate reads five columns
 * that are NOT among them, so it had to move to the service role. The service
 * role bypasses RLS, so every one of those reads must prove the caller may act
 * for the organisation FIRST, or the fix replaces an exposure with a cross-tenant
 * read. Founder condition, 20 August 2026.
 *
 * Proven on TEST against the real database as the real Postgres roles as well:
 * the session client is denied 42501 on those columns and on an owner_id filter,
 * the service role reads them, and org B's owner matches neither the owner branch
 * nor the manager branch for org A.
 */

type Row = Record<string, unknown> | null

const state: { orgRow: Row; memberRow: Row; calls: string[] } = {
  orgRow: null,
  memberRow: null,
  calls: [],
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      state.calls.push(table)
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data: table === 'organisations' ? state.orgRow : state.memberRow,
            error: null,
          }),
      }
      return chain
    },
  }),
}))

const { assertCallerMayActForOrganisation } = await import('@/lib/organisations/act-for')

const OWNER = '11111111-1111-1111-1111-111111111111'
const STRANGER = '22222222-2222-2222-2222-222222222222'
const ORG = '33333333-3333-3333-3333-333333333333'

beforeEach(() => {
  state.orgRow = null
  state.memberRow = null
  state.calls = []
})

describe('assertCallerMayActForOrganisation', () => {
  it('admits the owner', async () => {
    state.orgRow = { id: ORG }
    const r = await assertCallerMayActForOrganisation(OWNER, ORG, 'owner')
    expect(r).toEqual({ ok: true, organisationId: ORG, via: 'owner' })
  })

  it('refuses a stranger who owns nothing and manages nothing', async () => {
    state.orgRow = null
    state.memberRow = null
    const r = await assertCallerMayActForOrganisation(STRANGER, ORG, 'owner_or_manager')
    expect(r).toEqual({ ok: false, reason: 'not_your_organisation' })
  })

  it("does NOT widen createEvent: a manager is refused in 'owner' mode", async () => {
    // The membership row exists, but owner-only must ignore it. Widening this
    // would let a manager create events under an organisation that has never
    // admitted them to that action.
    state.orgRow = null
    state.memberRow = { role: 'manager' }
    const r = await assertCallerMayActForOrganisation(STRANGER, ORG, 'owner')
    expect(r).toEqual({ ok: false, reason: 'not_your_organisation' })
    // and it must not even ASK about membership in owner-only mode
    expect(state.calls).not.toContain('organisation_members')
  })

  it("admits a manager in 'owner_or_manager' mode", async () => {
    state.orgRow = null
    state.memberRow = { role: 'manager' }
    const r = await assertCallerMayActForOrganisation(STRANGER, ORG, 'owner_or_manager')
    expect(r).toEqual({ ok: true, organisationId: ORG, via: 'manager' })
  })

  it('refuses a missing organisation id without touching the database', async () => {
    const r = await assertCallerMayActForOrganisation(OWNER, null, 'owner_or_manager')
    expect(r).toEqual({ ok: false, reason: 'not_your_organisation' })
    expect(state.calls).toEqual([])
  })

  it('refuses a missing user id without touching the database', async () => {
    const r = await assertCallerMayActForOrganisation('', ORG, 'owner_or_manager')
    expect(r).toEqual({ ok: false, reason: 'not_your_organisation' })
    expect(state.calls).toEqual([])
  })
})

describe('every service-role publish-gate call site proves ownership first', () => {
  const SRC = 'src/app/(dashboard)/dashboard/events/actions.ts'
  const src = readFileSync(SRC, 'utf8')

  it('hands the gate the service-role client at every call site', () => {
    const total = (src.match(/checkPublishGate\(/g) ?? []).length
    const serviceRole = (src.match(/checkPublishGate\(createAdminClient\(\)/g) ?? []).length
    expect(total).toBeGreaterThan(0)
    expect(serviceRole).toBe(total)
  })

  it('proves ownership before the gate INSIDE the same function, at every call site', () => {
    /*
     * This used to require one ownership call per gate call, file-wide, in
     * order. That proxy broke on 6 September 2026 when archive, restore and
     * delete (close-out C13) each added an ownership check with no gate call,
     * and it was always weaker than it looked: an ownership call anywhere
     * earlier in the file satisfied it. The contract is per FUNCTION: between
     * the start of the function that calls the gate and the call itself, the
     * ownership proof must appear. That is what the no-unowned-organisation-read
     * guard enforces at build time; this test pins it in the suite.
     */
    const gateAt = [...src.matchAll(/checkPublishGate\(/g)].map((m) => m.index ?? 0)
    expect(gateAt.length).toBeGreaterThan(0)
    const fnStarts = [...src.matchAll(/^(?:export )?async function \w+\(/gm)].map((m) => m.index ?? 0)
    for (const g of gateAt) {
      const start = fnStarts.filter((s) => s < g).pop() ?? 0
      const body = src.slice(start, g)
      expect(body, `no ownership proof before the gate in ${body.slice(0, 60)}`).toContain('assertCallerMayActForOrganisation(')
    }
  })

  it('keeps createEvent and deleteEvent owner-only and the editing paths owner-or-manager', () => {
    expect(src).toContain("assertCallerMayActForOrganisation(user.id, input.organisationId, 'owner')")
    // Delete is destructive and stays with the owner, like create.
    const deleteBody = src.slice(src.indexOf('export async function deleteEvent('))
    expect(deleteBody.slice(0, deleteBody.indexOf('deleteEventEverywhere('))).toContain("'owner')")
    // Every other ownership call admits a manager, and there are no other modes.
    const modes = [...src.matchAll(/assertCallerMayActForOrganisation\([^)]*'(owner|owner_or_manager)'\)/g)].map((m) => m[1])
    expect(modes.filter((m) => m === 'owner').length).toBe(2)
    expect(modes.every((m) => m === 'owner' || m === 'owner_or_manager')).toBe(true)
  })
})

describe('the organisation insert cannot return ungranted columns', () => {
  it('narrows the returning list to columns inside the anon/authenticated grant', () => {
    const src = readFileSync('src/app/(dashboard)/dashboard/organisation/actions.ts', 'utf8')
    // A bare .select() after .insert() returns every column, and INSERT ... RETURNING
    // needs SELECT privilege on each one.
    expect(src).not.toMatch(/\.insert\([\s\S]{0,600}?\)\s*\n\s*\.select\(\)/)
    expect(src).toContain(".select('id, name, slug')")
  })
})
