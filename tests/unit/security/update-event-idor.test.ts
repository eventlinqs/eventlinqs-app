import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * IDOR-01 proof: updateEvent must verify the caller owns (or co-manages) the
 * event's organisation before any privileged write.
 *
 * The mutation path runs under the service-role admin client (RLS bypassed), so
 * without an ownership gate any authenticated organiser could pass another org's
 * eventId and overwrite that event or wipe its ticket tiers. This test drives
 * the real updateEvent action with clients that return the target event but NO
 * ownership/membership, and asserts the action refuses and never reaches a
 * privileged WRITE. See the note on `adminWrite` for why the assertion is the
 * write verb rather than the construction of the admin client.
 */

const h = vi.hoisted(() => ({
  owned: null as null | { id: string },
  membership: null as null | { role: string },
  adminCreated: vi.fn(),
  /*
   * THE PRIVILEGED WRITE ITSELF, which is what this test actually cares about.
   *
   * It used to assert `adminCreated` was never called, using "the service-role
   * client was never constructed" as a proxy for "no privileged write happened".
   * That proxy died on 2026-08-20, when the ownership check moved to the service
   * role: 20260819000002 revokes SELECT on organisations from `authenticated`,
   * and a WHERE clause needs SELECT privilege on the columns it names, so the
   * session-client `.eq('owner_id', ...)` this test was built around is now
   * denied 42501 and cannot be the gate any more.
   *
   * Constructing the admin client is therefore no longer evidence of anything.
   * Spying on the write VERBS is stricter than the old assertion, not looser: it
   * fails if a refused caller reaches an update, insert or delete, which is the
   * IDOR this test exists to prevent, and it would keep failing even if the
   * ownership check were removed entirely.
   */
  adminWrite: vi.fn(),
}))

function thenable(result: { data: unknown; error: unknown }, onWrite?: (verb: string) => void) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'or', 'in', 'order', 'limit']) {
    b[m] = () => b
  }
  for (const m of ['update', 'delete', 'insert', 'upsert']) {
    b[m] = () => {
      onWrite?.(m)
      return b
    }
  }
  b.single = async () => result
  b.maybeSingle = async () => result
  b.then = (resolve: (r: unknown) => void) => resolve(result)
  return b
}

const sessionClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'attacker' } }, error: null }) },
  from: (table: string) => {
    if (table === 'events') {
      return thenable({ data: { id: 'victim-event', organisation_id: 'victim-org', status: 'draft', slug: 'victim' }, error: null })
    }
    if (table === 'organisations') return thenable({ data: h.owned, error: null })
    if (table === 'organisation_members') return thenable({ data: h.membership, error: null })
    return thenable({ data: null, error: null })
  },
}

/*
 * The ownership check now runs HERE, on the service role, so the admin mock has
 * to answer the ownership questions from the same h.owned / h.membership the
 * session mock used to. The scenarios in the tests below are unchanged: a caller
 * with neither is still a stranger.
 */
const adminClient = {
  from: (table: string) => {
    if (table === 'organisations') return thenable({ data: h.owned, error: null }, h.adminWrite)
    if (table === 'organisation_members') return thenable({ data: h.membership, error: null }, h.adminWrite)
    return thenable({ data: { id: 'x' }, error: null }, h.adminWrite)
  },
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => sessionClient }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    h.adminCreated()
    return adminClient
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT')
  }),
}))

import { updateEvent } from '@/app/(dashboard)/dashboard/events/actions'

function input() {
  // Only eventId + status are read before the ownership gate; the rest satisfy
  // the type for the success-path control.
  return {
    eventId: 'victim-event',
    title: 'Hijacked',
    status: 'draft',
    ticket_tiers: [],
    tags: [],
    timezone: 'Australia/Sydney',
    is_multi_day: false,
    is_recurring: false,
    event_type: 'in_person',
    visibility: 'public',
    is_age_restricted: false,
    has_reserved_seating: false,
    squad_booking_enabled: false,
  } as unknown as Parameters<typeof updateEvent>[0]
}

beforeEach(() => {
  h.owned = null
  h.membership = null
  vi.clearAllMocks()
})

describe('IDOR-01: updateEvent ownership gate', () => {
  test('a non-owner, non-member caller is refused and no admin write is constructed', async () => {
    h.owned = null
    h.membership = null
    const res = await updateEvent(input())
    expect(res).toEqual({ error: 'Event not found' })
    expect(h.adminWrite).not.toHaveBeenCalled()
  })

  test('the org owner passes the gate and proceeds to the privileged write', async () => {
    h.owned = { id: 'victim-org' }
    // Success path ends in redirect(), which our mock throws; the gate having
    // passed is proven by the admin client being constructed.
    await expect(updateEvent(input())).rejects.toThrow('REDIRECT')
    expect(h.adminWrite).toHaveBeenCalled()
  })

  test('a managing org member passes the gate', async () => {
    h.membership = { role: 'manager' }
    await expect(updateEvent(input())).rejects.toThrow('REDIRECT')
    expect(h.adminWrite).toHaveBeenCalled()
  })
})
