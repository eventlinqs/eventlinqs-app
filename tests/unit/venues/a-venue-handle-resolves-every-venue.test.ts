import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A VENUE HANDLE RESOLVES PAST THE FIFTIETH VENUE AND THROUGH PUNCTUATION.
 *
 * On 25 October 2026 the pre-push gate's indexing step refused a push: four venue pages the sitemap listed
 * answered 404 ("/venues/goldfields-libraries-eaglehawk-library is in the sitemap and answered 404"). TEST held
 * 54 active venues and the resolver read only the first 50, and its fallback searched events.venue_name for
 * the handle's words joined by spaces, which never finds "Goldfields Libraries (Eaglehawk Library)".
 *
 * The fake below answers the resolver's queries over two in-memory tables, applying eq, match, ilike, order,
 * limit and range as PostgREST does, so the test asserts what the resolver finds, not which calls it made.
 */

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = { venues: [], events: [] }

function likeToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`)
  return new RegExp(`^${escaped.replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i')
}

// Production revokes venues.slug from anon (migration 20260808000010 grants named columns only, and slug came later):
// the public client asking for it gets 'permission denied for column slug', the whole query with it.
function query(table: string, role: 'anon' | 'service' = 'anon') {
  let rows = [...tables[table]]
  let denied: string | null = null
  let window: [number, number] | null = null
  let cap: number | null = null
  const q = {
    select: (cols?: string) => {
      if (role === 'anon' && table === 'venues' && /\bslug\b/.test(cols ?? '')) denied = 'permission denied for column slug'
      return q
    },
    eq: (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] === val)), q),
    match: (m: Row) => ((rows = rows.filter((r) => Object.entries(m).every(([k, v]) => r[k] === v))), q),
    not: (col: string, op: string, val: unknown) => ((rows = rows.filter((r) => !(op === 'is' && val === null && r[col] === null))), q),
    ilike: (col: string, pattern: string) => ((rows = rows.filter((r) => typeof r[col] === 'string' && likeToRegex(pattern).test(r[col] as string))), q),
    order: (col: string) => ((rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])))), q),
    limit: (n: number) => ((cap = n), q),
    range: (from: number, to: number) => ((window = [from, to]), q),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) => {
      if (denied) return Promise.resolve({ data: null, error: { message: denied } }).then(resolve)
      let out = rows
      if (window) out = out.slice(window[0], window[1] + 1)
      if (cap !== null) out = out.slice(0, cap)
      return Promise.resolve({ data: out, error: null }).then(resolve)
    },
  }
  return q
}

vi.mock('@/lib/supabase/public-client', () => ({ createPublicClient: () => ({ from: (t: string) => query(t) }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => query(t, 'service') }) }))

const { resolveVenueProfile } = await import('@/lib/venues/resolver')

const venue = (n: number, name: string): Row => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
  name,
  description: null,
  image_url: null,
  capacity: null,
  city: 'Bendigo',
  state: 'VIC',
  country: 'AU',
  address: null,
  postal_code: null,
  is_active: true,
})
const event = (venueName: string): Row => ({
  status: 'published',
  visibility: 'public',
  venue_name: venueName,
  venue_city: 'Bendigo',
  venue_state: 'VIC',
  venue_country: 'AU',
  venue_address: null,
  venue_latitude: null,
  venue_longitude: null,
  start_date: '2026-11-01T09:00:00Z',
  category: null,
})

describe('a venue handle resolves every venue', () => {
  beforeEach(() => {
    tables.venues = Array.from({ length: 54 }, (_, i) => venue(i + 1, `Venue number ${i + 1}`))
    tables.events = []
  })

  it('finds the 55th active venue, past the 50 it used to read', async () => {
    tables.venues.push(venue(55, 'Goldfields Libraries (Eaglehawk Library)'))
    const profile = await resolveVenueProfile('goldfields-libraries-eaglehawk-library')
    expect(profile?.name).toBe('Goldfields Libraries (Eaglehawk Library)')
    expect(profile?.id).toBe(tables.venues[54].id)
  })

  it('with no venue row, finds a punctuated venue name on a public event', async () => {
    tables.events.push(event('Goldfields Libraries (Bendigo Library)'))
    const profile = await resolveVenueProfile('goldfields-libraries-bendigo-library')
    expect(profile?.name).toBe('Goldfields Libraries (Bendigo Library)')
    expect(profile?.id).toBeNull()
  })

  it('a handle that names no venue and no event is still nothing', async () => {
    tables.events.push(event('Goldfields Libraries (Bendigo Library)'))
    expect(await resolveVenueProfile('goldfields-libraries-heathcote-library')).toBeNull()
  })

  /**
   * A RENAMED VENUE KEEPS ITS OLD ADDRESS (1 November 2026). Six venue records named after an organiser or an event
   * were renamed to their place ('Barwon Events' to 'Little Malop Street Central'); the page found venues by their
   * NAME's handle only, so /venues/barwon-events answered 404 on live while the link was still shared and indexed.
   * The stored slug keeps the old handle: the profile is found by it and carries the CURRENT name's handle, so the
   * page can send the visitor there.
   */
  it('finds a renamed venue by its stored slug and hands back its current handle', async () => {
    tables.venues.push({ ...venue(56, 'Little Malop Street Central'), slug: 'barwon-events' })
    const profile = await resolveVenueProfile('barwon-events')
    expect(profile?.name).toBe('Little Malop Street Central')
    expect(profile?.handle).toBe('little-malop-street-central')
  })

  it('a venue found by its own name keeps the handle it was asked by', async () => {
    tables.venues.push({ ...venue(57, 'Little Malop Street Central'), slug: 'barwon-events' })
    const profile = await resolveVenueProfile('little-malop-street-central')
    expect(profile?.handle).toBe('little-malop-street-central')
  })

  it('the venue page sends an old handle to the current one, permanently', async () => {
    const { readFileSync } = await import('node:fs')
    const page = readFileSync('src/app/venues/[handle]/page.tsx', 'utf8').replace(/\r\n/g, '\n')
    expect(page).toMatch(/if \(venue\.handle !== handle\) permanentRedirect\(`\/venues\/\$\{venue\.handle\}`\)/)
  })
})
