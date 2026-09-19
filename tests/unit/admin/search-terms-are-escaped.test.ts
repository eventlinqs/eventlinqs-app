import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * EVERY ADMIN SEARCH BOX CAN BE ASKED FOR A NAME WITH A COMMA IN IT.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS BROKEN, AND IT WAS NOT SUBTLE.
 *
 * Inside a PostgREST `or(...)` the characters `,` `.` `(` `)` are GRAMMAR. Five
 * reads built their filter by dropping a raw search term into a template
 * literal, so a term carrying one of them was parsed as MORE CLAUSES. Measured
 * against TEST on 19 September 2026, before anything was changed:
 *
 *     .or(`title.ilike.%Night, Geelong%,slug.ilike.%Night, Geelong%`)
 *       -> PGRST100 failed to parse logic tree
 *     the same search, escaped
 *       -> 3 rows: "Artist Layer Launch Night, Geelong",
 *                  "Broadcast Gate Proof Night, Geelong",
 *                  "Marketplace Gate Night, Geelong"
 *
 * THE TWO OUTCOMES ARE DIFFERENT AND BOTH ARE BAD, which is why both are
 * asserted below rather than one standing in for the other:
 *
 *   listEvents, listOrganisations and listProfiles all end `if (error) throw
 *   error`, so the operator got a CRASHED SCREEN, not an empty table.
 *   globalAdminSearch reads `res.data ?? []`, so the topbar search reported
 *   NOTHING FOUND, silently, which is worse: it looks like an answer.
 *
 * A person who has written their name "Smith, John" could not be found by the
 * screen that suspends accounts.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ASSERTED. The filter each read actually sends is recorded and split
 * the way PostgREST would split it: exactly one clause per column, whatever was
 * typed, with the comma INSIDE the quoted value. See tests/helpers/postgrest-or.ts
 * for why that property, rather than the output string, is the invariant.
 */

import { topLevelClauses } from '../../helpers/postgrest-or'

const DQ = String.fromCharCode(34)

/** Terms a real operator types on a real Australian platform. */
const HOSTILE = ['Night, Geelong', 'Smith, John', 'Rock, Paper', 'a(b)c', 'name.eq.anything']

const datasets: Record<string, unknown[]> = {}
const orFilters: Array<{ table: string; filter: string }> = []

/**
 * A recording builder. It answers every method the readers chain, records what
 * reaches `.or()`, and resolves to the rows the case put in `datasets`.
 *
 * It is thenable rather than a promise, because the readers `await q` after
 * chaining, which is exactly how the real builder behaves.
 */
function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'range', 'limit', 'eq', 'ilike', 'not']) b[m] = () => b
  b.or = (filter: string) => {
    orFilters.push({ table, filter })
    return b
  }
  ;(b as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve({ data: datasets[table] ?? [], error: null })
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}))
vi.mock('@/lib/supabase/public-client', () => ({
  createPublicClient: () => ({ from: (table: string) => builder(table) }),
}))
vi.mock('@/lib/admin/audit', () => ({ recordAuditEvent: vi.fn() }))

import { listEvents } from '@/lib/admin/events'
import { listOrganisations } from '@/lib/admin/organisers'
import { listProfiles } from '@/lib/admin/users'
import { globalAdminSearch } from '@/lib/admin/search'
import { searchOrganisers } from '@/lib/events/search-scopes'

beforeEach(() => {
  for (const k of Object.keys(datasets)) delete datasets[k]
  orFilters.length = 0
})

/** Every read under test, with the columns it is entitled to search. */
const READS = [
  {
    what: 'the admin event list',
    columns: ['title', 'slug'],
    run: (term: string) => listEvents({ search: term }),
  },
  {
    what: 'the admin organiser list',
    columns: ['name', 'slug', 'email'],
    run: (term: string) => listOrganisations({ search: term }),
  },
  {
    what: 'the admin user list',
    columns: ['email', 'full_name', 'display_name'],
    run: (term: string) => listProfiles({ search: term }),
  },
  {
    what: 'the public organiser search scope',
    columns: ['name', 'slug'],
    run: (term: string) => searchOrganisers(term),
  },
] as const

for (const read of READS) {
  describe(`${read.what} sends a term the PostgREST grammar cannot split`, () => {
    for (const term of HOSTILE) {
      it(`a search for ${JSON.stringify(term)} is one clause per column`, async () => {
        await read.run(term)
        expect(orFilters).toHaveLength(1)
        const clauses = topLevelClauses(orFilters[0].filter)
        expect(clauses).toHaveLength(read.columns.length)
        for (let i = 0; i < read.columns.length; i += 1) {
          expect(clauses[i].startsWith(`${read.columns[i]}.ilike.`)).toBe(true)
        }
        // The term survives whole, inside the quoting that makes it data.
        expect(orFilters[0].filter).toContain(`${DQ}%${term}%${DQ}`)
      })
    }

    it('searches the columns it is entitled to and no others', async () => {
      await read.run('plain')
      const named = topLevelClauses(orFilters[0].filter).map(c => c.split('.ilike.')[0])
      expect(named).toEqual([...read.columns])
    })

    it('an empty search sends no or() filter at all', async () => {
      await read.run('')
      expect(orFilters).toHaveLength(0)
    })
  })
}

describe('the global admin topbar search, which reads three tables at once', () => {
  it('escapes the term in both of its own or() reads and in the profile read it delegates', async () => {
    datasets.organisations = [{ id: 'o1', name: 'Rock, Paper', slug: 'rock-paper' }]
    datasets.events = [
      { id: 'e1', title: 'Launch Night, Geelong', slug: 'launch-night', status: 'published' },
    ]
    datasets.profiles = [
      {
        id: 'u1',
        email: 'sj@test.invalid',
        full_name: 'Smith, John',
        display_name: null,
        role: 'attendee',
        is_verified: true,
        created_at: '2026-09-01T00:00:00Z',
      },
    ]

    const results = await globalAdminSearch('Night, Geelong')

    // Three reads, three escaped filters: organisations, events, and the
    // profiles read listProfiles makes on its behalf.
    expect(orFilters.map(f => f.table).sort()).toEqual(['events', 'organisations', 'profiles'])
    for (const { filter } of orFilters) {
      expect(filter).toContain(`${DQ}%Night, Geelong%${DQ}`)
    }
    expect(topLevelClauses(orFilters.find(f => f.table === 'events')!.filter)).toHaveLength(2)
    expect(topLevelClauses(orFilters.find(f => f.table === 'profiles')!.filter)).toHaveLength(3)

    // And it answers with the rows rather than the silent empty result the
    // swallowed PGRST100 used to produce.
    expect(results.events[0].primary).toBe('Launch Night, Geelong')
    expect(results.organisations[0].primary).toBe('Rock, Paper')
    expect(results.users[0].primary).toBe('Smith, John')
  })

  it('an empty query reads nothing at all', async () => {
    const results = await globalAdminSearch('   ')
    expect(orFilters).toHaveLength(0)
    expect(results).toMatchObject({ query: '', organisations: [], events: [], users: [] })
  })
})

describe('the shape this replaces, so the test says what it defends against', () => {
  it('a raw interpolation of the same term really does add clauses', () => {
    const naive = ['title', 'slug'].map(c => `${c}.ilike.%Night, Geelong%`).join(',')
    expect(topLevelClauses(naive)).toHaveLength(4)
  })
})
