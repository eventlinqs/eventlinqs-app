import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A VALUE INSIDE A POSTGREST `or(...)` IS NOT PLAIN TEXT.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT, measured against TEST on 19 September 2026.
 *
 * `,` `.` `(` `)` are GRAMMAR inside `or(...)`. An unescaped term carrying one
 * is parsed as more filter clauses:
 *
 *     .or(`title.ilike.%Session, Geelong%,slug.ilike.%Session, Geelong%`)
 *     PGRST100  failed to parse logic tree
 *
 * The request answers 500 and the screen shows nothing, with no way for the
 * person typing to know a comma is the reason. Four of the first 320 event
 * titles on TEST carry a comma and every one of them is of the shape
 * "Something Night, Geelong", which is the natural title for this platform.
 *
 * The escape existed, privately, in src/lib/events/fetchers.ts with the whole
 * reasoning above it. By that date the same decision had been made three more
 * times in three different ways and missed in six reads, including the picker a
 * fee override is attached from.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY THE LAST ONE IS THE REAL INVARIANT.
 *
 * Checking the exact output string pins today's spelling. The property that
 * actually matters is that the caller's term cannot ADD A CLAUSE: split the
 * produced filter on commas that are not inside quotes and there must be
 * exactly one clause per column, whatever was typed. Everything else is detail.
 */

import { escapeOrValue, ilikeAnyOf } from '@/lib/supabase/or-filter'
// The splitter is shared: see tests/helpers/postgrest-or.ts for why a second
// private copy of the parser that judges this grammar would be the same mistake
// the guard beside it exists to stop.
import { topLevelClauses } from '../../helpers/postgrest-or'

const BS = String.fromCharCode(92)
const DQ = String.fromCharCode(34)


/** Terms a person actually types, and the ones that break the grammar. */
const HOSTILE = [
  'Session, Geelong',
  'Rock, Paper, Scissors',
  'The ' + DQ + 'Big' + DQ + ' Night',
  'back' + BS + 'slash',
  'a(b)c',
  'name.eq.anything',
  'plain',
  '',
]

describe('escapeOrValue makes a value literal', () => {
  it('wraps the value in quotes', () => {
    expect(escapeOrValue('plain')).toBe(`${DQ}plain${DQ}`)
  })

  it('escapes a backslash BEFORE a quote, so an escaped quote is not re-escaped', () => {
    // If the order were reversed, the backslash this adds in front of a quote
    // would itself be doubled and the quoting would end in the wrong place.
    expect(escapeOrValue(`a${DQ}b`)).toBe(`${DQ}a${BS}${DQ}b${DQ}`)
    expect(escapeOrValue(`a${BS}b`)).toBe(`${DQ}a${BS}${BS}b${DQ}`)
    expect(escapeOrValue(`a${BS}${DQ}b`)).toBe(`${DQ}a${BS}${BS}${BS}${DQ}b${DQ}`)
  })

  it('leaves the grammar characters alone inside the quotes, because quoting is what makes them data', () => {
    expect(escapeOrValue('a,b.c(d)')).toBe(`${DQ}a,b.c(d)${DQ}`)
  })
})

describe('ilikeAnyOf composes one clause per column, whatever was typed', () => {
  it('builds the shape every call site was spelling out by hand', () => {
    expect(ilikeAnyOf(['title', 'slug'], 'plain')).toBe(
      `title.ilike.${DQ}%plain%${DQ},slug.ilike.${DQ}%plain%${DQ}`,
    )
  })

  for (const term of HOSTILE) {
    it(`a term of ${JSON.stringify(term)} still produces exactly one clause per column`, () => {
      for (const columns of [['title'], ['title', 'slug'], ['name', 'slug', 'email']]) {
        const clauses = topLevelClauses(ilikeAnyOf(columns, term))
        expect(clauses).toHaveLength(columns.length)
        for (let i = 0; i < columns.length; i += 1) {
          expect(clauses[i].startsWith(`${columns[i]}.ilike.`)).toBe(true)
        }
      }
    })
  }

  it('the UNESCAPED form is what this replaces, and it does add a clause', () => {
    // The defect, written out, so the test says what it is defending against
    // rather than only what it wants.
    const naive = ['title', 'slug'].map(c => `${c}.ilike.%Session, Geelong%`).join(',')
    expect(topLevelClauses(naive)).toHaveLength(4)
  })
})

/* --------------------------------------------------------------------------
 * The fee-override target picker, through its own GET.
 * ------------------------------------------------------------------------ */

const datasets: Record<string, unknown[]> = {}
const orFilters: string[] = []

function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'limit', 'ilike', 'eq']) b[m] = () => b
  b.or = (filter: string) => {
    orFilters.push(filter)
    return b
  }
  ;(b as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve({ data: datasets[table] ?? [], error: null })
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}))
vi.mock('@/lib/admin/auth', () => ({
  getAdminSession: async () => ({ userId: 'admin-1', roles: ['founder'] }),
}))
vi.mock('@/lib/admin/rbac', () => ({ can: () => true }))

import { GET } from '@/app/admin/(authed)/pricing/targets/route'

beforeEach(() => {
  for (const k of Object.keys(datasets)) delete datasets[k]
  orFilters.length = 0
})

describe('the fee-override picker can be asked for an event whose title has a comma', () => {
  it('sends one clause per column, with the comma inside the value', async () => {
    datasets.events = [
      {
        id: 'e1',
        title: 'Broadcast Gate Encore Session, Geelong',
        slug: 'lane-b-comma',
        start_date: '2026-09-22T14:30:00Z',
        timezone: 'Australia/Sydney',
        organisations: { name: 'Lane B Presents' },
      },
    ]
    const response = await GET(
      new Request(
        'https://el.test/admin/pricing/targets?kind=event&q=' + encodeURIComponent('Session, Geelong'),
      ),
    )
    const json = (await response.json()) as { results: { label: string }[] }

    expect(response.status).toBe(200)
    expect(json.results[0].label).toBe('Broadcast Gate Encore Session, Geelong')
    expect(orFilters).toHaveLength(1)
    expect(topLevelClauses(orFilters[0])).toHaveLength(2)
    expect(orFilters[0]).toContain(`${DQ}%Session, Geelong%${DQ}`)
  })

  it('searching an organisation uses ilike, which is not the or() grammar at all', async () => {
    datasets.organisations = [{ id: 'o1', name: 'Rock, Paper' }]
    const response = await GET(
      new Request(
        'https://el.test/admin/pricing/targets?kind=organisation&q=' + encodeURIComponent('Rock, Paper'),
      ),
    )
    const json = (await response.json()) as { results: { label: string }[] }
    expect(json.results[0].label).toBe('Rock, Paper')
    // Nothing went into an or() on this branch, which is why the comma was
    // never a problem there. Verified against TEST as well as asserted here.
    expect(orFilters).toHaveLength(0)
  })
})
