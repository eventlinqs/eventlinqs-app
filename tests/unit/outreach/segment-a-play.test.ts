import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { renderTemplate } from '@/lib/outreach/rules'
import { SEGMENT_A_FIRST, segmentAFields, type SegmentAFacts } from '@/lib/outreach/segment-a-letter'

/*
 * A SEGMENT A PLAY'S LETTER (the PM's 02:00 of 18 November 2026, item 2; the standard's Part 2 rule 8): drafted in a
 * Melbourne business hour with that hour's facts, queued ONLY when no CRM rule and no gateway check holds it, the
 * database judging the move again; anything else stays held with its reasons. The facts reader and the drafter are
 * stood in here; each is tested on its own (segment-a-letter.test.ts, drafts and rules tests).
 */
const UNSUB = 'https://www.eventlinqs.com.au/unsubscribe/outreach?t=00000000-0000-0000-0000-000000000000'
const PHOTO = 'https://www.eventlinqs.com.au/photos/00000000-0000-0000-0000-000000000000/00000000000000000000000000000000'
const IAN: SegmentAFacts = {
  organiserName: "Her Majesty's Theatre Ballarat",
  personName: null,
  night: { title: 'Ian Moss and Troy Cassar-Daley: Together Alone Tour', slug: 'ian-moss-2026-11-28', startDate: '2026-11-28T08:30:00Z', timezone: 'Australia/Melbourne', categorySlug: 'music', hasPhoto: true, hasBooking: true },
  listedNow: 13,
  listedWithBooking: 13,
  openers: 6,
  photoLink: PHOTO,
  origin: 'https://www.eventlinqs.com.au',
}
const CONSENT = { basis: 'conspicuous_publication', publishedOnUrl: 'https://hermaj.com/contact', noMarketingStatementChecked: true }
const THU_10 = new Date('2026-11-18T23:00:00Z') // Thursday 19 November, 10:00 in Melbourne

const read = vi.hoisted(() => ({ answer: null as unknown }))
const drafted = vi.hoisted(() => ({ answer: null as unknown }))
vi.mock('@/lib/outreach/segment-a-read', () => ({ readSegmentAFacts: vi.fn(async () => read.answer) }))
vi.mock('@/lib/outreach/drafts', () => ({ draftFromTemplate: vi.fn(async () => drafted.answer) }))

const { draftSegmentALetter } = await import('@/lib/outreach/segment-a-play')

function fakeDb(body: string, opts: { refuseQueue?: string } = {}) {
  const updates: { payload: Record<string, unknown>; filters: [string, unknown][] }[] = []
  const rendered = renderTemplate(SEGMENT_A_FIRST, segmentAFields(IAN), UNSUB)
  const db = {
    from: (table: string) => ({
      select: () => {
        const b: Record<string, unknown> = {}
        b.eq = () => b
        b.single = async () =>
          table === 'outreach_touches' ? { data: { subject: rendered.subject, body }, error: null } : { data: { address: 'hermaj@hermaj.com' }, error: null }
        return b
      },
      update: (payload: Record<string, unknown>) => {
        const u = { payload, filters: [] as [string, unknown][] }
        updates.push(u)
        const b: Record<string, unknown> = {}
        b.eq = (c: string, v: unknown) => (u.filters.push([c, v]), b)
        b.select = () => b
        b.maybeSingle = async () => (opts.refuseQueue ? { data: null, error: { message: `refused: ${opts.refuseQueue}` } } : { data: { id: 't1' }, error: null })
        b.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })
        return b
      },
    }),
  }
  return { db: db as unknown as SupabaseClient<Database>, updates, rendered }
}

const input = (scheduledFor = THU_10) => ({ play: { id: 'p1', name: 'Segment A' }, contactId: 'c1', step: 1 as const, templateId: 'tpl1', scheduledFor, now: scheduledFor, origin: 'https://www.eventlinqs.com.au', actingUser: 'u1' })

describe('a segment A letter is queued only when it passes whole', () => {
  beforeEach(() => {
    read.answer = { state: 'read', facts: IAN, consent: CONSENT, eventDate: '2026-11-28', eventId: 'e1' }
    drafted.answer = { state: 'done', value: { id: 't1', state: 'held', heldBecause: [] } }
  })

  it('passes every rule and the gateway: moved from held to queued, for its own time', async () => {
    const { db, updates, rendered } = fakeDb(renderTemplate(SEGMENT_A_FIRST, segmentAFields(IAN), UNSUB).body)
    expect(rendered.heldBecause).toEqual([])
    const r = await draftSegmentALetter(db, input())
    expect(r).toEqual({ state: 'queued', touchId: 't1' })
    expect(updates).toHaveLength(1)
    expect(updates[0].payload).toEqual({ state: 'queued', scheduled_for: THU_10.toISOString() })
    expect(updates[0].filters).toContainEqual(['state', 'held'])
  })

  it('outside a Melbourne business hour nothing is drafted: its numbers are read in the hour it goes', async () => {
    const r = await draftSegmentALetter(fakeDb('').db, input(new Date('2026-11-21T00:00:00Z')))
    expect(r.state).toBe('not drafted')
  })

  it('a fact that cannot be read means no letter, with why', async () => {
    read.answer = { state: 'not read', why: 'no night of theirs starts 3 or more days after 2026-11-19' }
    expect(await draftSegmentALetter(fakeDb('').db, input())).toEqual({ state: 'not drafted', why: 'no night of theirs starts 3 or more days after 2026-11-19' })
  })

  it('a CRM rule that fails keeps it held with the rule named', async () => {
    drafted.answer = { state: 'done', value: { id: 't1', state: 'held', heldBecause: ['a field could not be filled from verified facts: [photo link]'] } }
    const { db, updates } = fakeDb('')
    expect(await draftSegmentALetter(db, input())).toEqual({ state: 'held', touchId: 't1', why: ['a field could not be filled from verified facts: [photo link]'] })
    expect(updates).toHaveLength(0)
  })

  it('a gateway refusal keeps it held, its reasons written on the draft: here a night too close to the day it lands', async () => {
    read.answer = { state: 'read', facts: IAN, consent: CONSENT, eventDate: '2026-11-21', eventId: 'e1' }
    const { db, updates } = fakeDb(renderTemplate(SEGMENT_A_FIRST, segmentAFields(IAN), UNSUB).body)
    const r = await draftSegmentALetter(db, input())
    expect(r.state).toBe('held')
    expect((r as { why: string[] }).why.some((w) => w.startsWith('timing'))).toBe(true)
    expect(updates.map((u) => u.payload)).toEqual([{ held_because: (r as { why: string[] }).why }])
  })

  it('a consent basis whose no refusal statement is not checked keeps it held', async () => {
    read.answer = { state: 'read', facts: IAN, consent: { ...CONSENT, noMarketingStatementChecked: false }, eventDate: '2026-11-28', eventId: 'e1' }
    const r = await draftSegmentALetter(fakeDb(renderTemplate(SEGMENT_A_FIRST, segmentAFields(IAN), UNSUB).body).db, input())
    expect(r.state).toBe('held')
    expect((r as { why: string[] }).why.some((w) => w.includes('consent'))).toBe(true)
  })

  it('a move the database refuses leaves it held, in the database words', async () => {
    const r = await draftSegmentALetter(fakeDb(renderTemplate(SEGMENT_A_FIRST, segmentAFields(IAN), UNSUB).body, { refuseQueue: 'the play has sent its 20 for today.' }).db, input())
    expect(r).toEqual({ state: 'held', touchId: 't1', why: ['the play has sent its 20 for today.'] })
  })
})
