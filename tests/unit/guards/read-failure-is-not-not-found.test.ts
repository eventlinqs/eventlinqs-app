import { describe, expect, test } from 'vitest'
import {
  findDecision,
  judgeSource,
  parseBindings,
  readRhs,
  scanApp,
} from '../../../scripts/guards/read-failure-is-not-not-found.mjs'

/**
 * THE GUARD FOR THE READ-FAILURE CLASS (12 September 2026, the fourth
 * occurrence). A read whose empty answer decides a 404 must name its error and
 * throw it. These fixtures are the shapes the class has actually taken on this
 * platform, plus the shapes that are NOT the class and must stay quiet, because
 * a guard that cries wolf is a guard somebody switches off.
 */

const FILE = 'src/app/x/[slug]/page.tsx'

/** The events layout exactly as it stood when the gate caught the 404 at 768. */
const THE_INCIDENT = `
import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public-client'

export default async function EventSlugLayout({ children, params }) {
  const { slug } = await params

  if (await fixtureEventExists(slug)) return children

  const supabase = createPublicClient()
  const { data } = await supabase
    .from('events')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (data) return children

  if (await viewerMayReachArchivedEvent(slug)) return children

  notFound()
}
`

describe('parseBindings', () => {
  test('reads data and error, plain or aliased', () => {
    expect(parseBindings(' data ')).toEqual({ data: 'data', error: null })
    expect(parseBindings('data: event')).toEqual({ data: 'event', error: null })
    expect(parseBindings('data: event, error: eventError')).toEqual({ data: 'event', error: 'eventError' })
    expect(parseBindings('error, data')).toEqual({ data: 'data', error: 'error' })
  })

  test('a nested data binding (the auth read) binds nothing this guard judges', () => {
    expect(parseBindings('data: { user }')).toEqual({ data: null, error: null })
  })
})

describe('readRhs', () => {
  test('follows a chained builder across lines and stops at the decision', () => {
    const src = 'const { data } = await supabase\n  .from(\'events\')\n  .select(\'id\')\n  .maybeSingle()\n\nif (data) return children\n'
    const start = src.indexOf('await')
    const { rhs } = readRhs(src, start)
    expect(rhs).toContain('.maybeSingle()')
    expect(rhs).not.toContain('return children')
  })

  test('follows a ternary with an await in each arm', () => {
    const src = 'const { data: order } = isUUID\n  ? await query.eq(\'id\', id).single()\n  : await query.eq(\'order_number\', id).single()\n\nif (!order) notFound()\n'
    const { rhs } = readRhs(src, src.indexOf('isUUID'))
    expect(rhs).toContain('order_number')
    expect(rhs).not.toContain('notFound')
  })

  test('keeps an `as` cast on the next line as part of the expression', () => {
    const src = 'const { data } = await q\n  .single() as { data: X | null; error: unknown }\nreturn data\n'
    const { rhs } = readRhs(src, src.indexOf('await'))
    expect(rhs).toContain('error: unknown }')
    expect(rhs).not.toContain('return data')
  })
})

describe('findDecision', () => {
  test('sees the four ways a bound value decides a 404', () => {
    expect(findDecision('\nif (!event) notFound()\n', 'event')?.how).toBe('if (!event) notFound()')
    expect(findDecision('\nif (!event || !event.organisation_id) {\n  notFound()\n}\n', 'event')?.how).toBe('if (!event) notFound()')
    expect(findDecision('\nif (data) return children\n', 'data')?.how).toBe('if (data) return children')
    expect(findDecision('\n  return data\n}', 'data')?.how).toBe('return data')
    expect(findDecision('\nconst ticket = data as unknown as T | null\nif (!ticket || ticket.secret !== s) notFound()\n', 'data')?.how).toContain('where ticket is data')
  })

  test('a value that feeds a list decides nothing', () => {
    expect(findDecision('\nconst all = (rows ?? []) as X[]\nreturn all\n', 'rows')).toBeNull()
    expect(findDecision('\n  return (data ?? []) as unknown as EventCardData[]\n}', 'data')).toBeNull()
    expect(findDecision('\n  return data ?? fallbackCents\n}', 'data')).toBeNull()
  })

  test('a returned scalar from a read that did not ask for one row is a value, not an existence answer', () => {
    expect(findDecision('\n  return data as number | null\n}', 'data', { singleRow: false })).toBeNull()
    expect(findDecision('\n  return data ?? null\n}', 'data', { singleRow: true })?.how).toBe('return data')
  })
})

describe('judgeSource: the three faults', () => {
  test('the incident: a discarded error deciding `return children` and notFound()', () => {
    const { faults, decisive, judged } = judgeSource(THE_INCIDENT, 'src/app/events/[slug]/layout.tsx')
    expect(judged).toBe(true)
    expect(decisive).toBe(1)
    expect(faults).toHaveLength(1)
    expect(faults[0]).toMatchObject({ kind: 'discarded', name: 'data', line: 11 })
    expect(faults[0].why).toContain('discards the error')
    expect(faults[0].fix).toContain('readOrThrow')
  })

  test('a discarded error deciding a direct notFound()', () => {
    const src = `
import { notFound } from 'next/navigation'
export default async function P({ params }) {
  const { id } = await params
  const { data: event } = await supabase
    .from('events')
    .select('id, title')
    .eq('id', id)
    .single()

  if (!event) notFound()
  return <h1>{event.title}</h1>
}`
    const { faults } = judgeSource(src, FILE)
    expect(faults.map((f) => f.kind)).toEqual(['discarded'])
  })

  test('a discarded error deciding notFound() through an alias', () => {
    const src = `
import { notFound } from 'next/navigation'
export default async function P({ params }) {
  const { code } = await params
  const { data } = await admin
    .from('tickets')
    .select('ticket_code, secret')
    .eq('ticket_code', code)
    .maybeSingle()

  const ticket = data as unknown as BearerTicket | null
  if (!ticket || ticket.secret !== secret) notFound()
  return null
}`
    const { faults } = judgeSource(src, FILE)
    expect(faults.map((f) => f.kind)).toEqual(['discarded'])
    expect(faults[0].decision).toContain('where ticket is data')
  })

  test('a discarded error returned from a fetch helper whose caller 404s', () => {
    const src = `
import { notFound } from 'next/navigation'
async function fetchEvent(slug) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .single() as { data: QueueEvent | null; error: unknown }
  return data
}
export default async function P({ params }) {
  const event = await fetchEvent((await params).slug)
  if (!event) notFound()
  return null
}`
    const { faults } = judgeSource(src, FILE)
    expect(faults.map((f) => f.kind)).toEqual(['discarded'])
    expect(faults[0].decision).toBe('return data')
  })

  test('a discarded error through a ternary with an await in each arm', () => {
    const src = `
import { notFound } from 'next/navigation'
export default async function P({ params }) {
  const { order_id } = await params
  const query = adminClient.from('orders').select('*')
  const { data: order } = isUUID
    ? await query.eq('id', order_id).single()
    : await query.eq('order_number', order_id).single()

  if (!order) notFound()
  return null
}`
    const { faults } = judgeSource(src, FILE)
    expect(faults.map((f) => f.kind)).toEqual(['discarded'])
  })

  test('the visible fold: the notFound() condition names the error', () => {
    const src = `
import { notFound } from 'next/navigation'
export default async function P({ params }) {
  const { id } = await params
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('id', id)
    .single()

  if (eventError || !event) notFound()
  return null
}`
    const { faults } = judgeSource(src, FILE)
    expect(faults.map((f) => f.kind)).toEqual(['folded'])
    expect(faults[0].why).toContain('eventError')
  })

  test('the error made visible and still 404ed: bound, logged, never thrown', () => {
    const src = `
import { notFound } from 'next/navigation'
export default async function P({ params }) {
  const { id } = await params
  const { data, error } = await supabase
    .from('events')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (error) console.error('[x] read failed:', error)
  if (!data) notFound()
  return null
}`
    const { faults } = judgeSource(src, FILE)
    expect(faults.map((f) => f.kind)).toEqual(['not thrown'])
  })
})

describe('judgeSource: what must stay quiet', () => {
  test('the squad shape: PGRST116 means absent, anything else throws', () => {
    const src = `
import { notFound } from 'next/navigation'
export default async function P({ params }) {
  const { member_id } = await params
  const { data: member, error } = await adminClient
    .from('squad_members')
    .select('*')
    .eq('id', member_id)
    .single()
  if (error && error.code !== 'PGRST116') throw new MemberReadFailed(member_id, error)
  if (!member) notFound()
  return null
}`
    const { faults, decisive } = judgeSource(src, FILE)
    expect(decisive).toBe(1)
    expect(faults).toEqual([])
  })

  test('a read behind readOrThrow leaves nothing to judge', () => {
    const src = `
import { notFound } from 'next/navigation'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
export default async function L({ children, params }) {
  const { slug } = await params
  const row = await readOrThrow('event-route', () =>
    supabase.from('events').select('id').eq('slug', slug).maybeSingle(),
  )
  if (row) return children
  notFound()
}`
    const { faults, reads } = judgeSource(src, FILE)
    expect(reads).toBe(0)
    expect(faults).toEqual([])
  })

  test('a read that feeds a list is not this class', () => {
    const src = `
import { notFound } from 'next/navigation'
export default async function P({ params }) {
  const { slug } = await params
  const event = await fetchEvent(slug)
  if (!event) notFound()
  const { data: lineupRows } = await publicDb
    .from('event_artists')
    .select('artist_id')
    .eq('event_id', event.id)
  return <ul>{(lineupRows ?? []).map((r) => <li key={r.artist_id} />)}</ul>
}`
    const { faults, reads, decisive } = judgeSource(src, FILE)
    expect(reads).toBe(1)
    expect(decisive).toBe(0)
    expect(faults).toEqual([])
  })

  test('a price resolver handing back an rpc scalar with a fallback is not this class', () => {
    const src = `
import { notFound } from 'next/navigation'
export default async function P({ params }) {
  const { id } = await params
  const event = await fetchEvent(id)
  if (!event) notFound()
  const price = await resolveSeatUnitPriceCents(
    seat,
    async (tierId) => {
      const { data } = await admin.rpc('get_current_tier_price', { p_tier_id: tierId })
      return data as number | null
    },
    fallbackCents,
  )
  return <p>{price}</p>
}`
    const { faults, reads, decisive } = judgeSource(src, FILE)
    expect(reads).toBe(1)
    expect(decisive).toBe(0)
    expect(faults).toEqual([])
  })

  test('the auth read is not a PostgREST read', () => {
    const src = `
import { notFound } from 'next/navigation'
export default async function P() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()
  return null
}`
    const { faults, reads } = judgeSource(src, FILE)
    expect(reads).toBe(0)
    expect(faults).toEqual([])
  })

  test('a file that cannot answer 404 is not judged at all', () => {
    const src = `
export default async function P() {
  const { data } = await supabase.from('events').select('id').maybeSingle()
  return data ? <p>{data.id}</p> : null
}`
    const { judged, faults } = judgeSource(src, FILE)
    expect(judged).toBe(false)
    expect(faults).toEqual([])
  })

  test('the incident quoted in a comment is a post-mortem, not a defect', () => {
    const src = `
import { notFound } from 'next/navigation'
/*
 * This used to read:
 *   const { data } = await supabase.from('events').select('id').eq('slug', slug).maybeSingle()
 *   if (data) return children
 */
export default async function L({ children, params }) {
  const { slug } = await params
  const row = await readOrThrow('event-route', () => supabase.from('events').select('id').eq('slug', slug).maybeSingle())
  if (row) return children
  notFound()
}`
    const { faults, reads } = judgeSource(src, FILE)
    expect(reads).toBe(0)
    expect(faults).toEqual([])
  })
})

describe('the tree', () => {
  test('no route under src/app decides a 404 on a read that discarded, folded or swallowed its error', () => {
    const { judged, faults } = scanApp()
    expect(judged).toBeGreaterThan(20)
    expect(
      faults.map((f) => `${f.file}:${f.line} ${f.kind}`),
      'a read whose failure would answer a false 404 is back in the tree',
    ).toEqual([])
  })
})
