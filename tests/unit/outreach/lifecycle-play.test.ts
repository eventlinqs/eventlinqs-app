import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { renderTemplate } from '@/lib/outreach/rules'
import { LIFECYCLE_ACQ, LIFECYCLE_PERM, lifecycleFields, type LifecycleFacts } from '@/lib/outreach/lifecycle-letters'

/*
 * A LAW 49 PLAY'S LETTER (the shape of segment-a-play.test.ts): drafted in law 44's window only when the event's clock
 * says it is due, queued ONLY when no CRM rule and no gateway check holds it, the database judging the move again;
 * anything else stays held with its reasons. The reader and the drafter are stood in here; the reader's clock is tested
 * in lifecycle-letters.test.ts.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const UNSUB = `${ORIGIN}/unsubscribe/outreach?t=00000000-0000-0000-0000-000000000000`
const PHOTO = `${ORIGIN}/photos/00000000-0000-0000-0000-000000000000/00000000000000000000000000000000`
const MON_7 = new Date('2026-11-22T20:00:00Z') // Monday 23 November, 07:00 in Melbourne
const MON_10 = new Date('2026-11-22T23:00:00Z') // 10:00: outside law 44's window
const TOTS: LifecycleFacts = {
  organiserName: 'Geelong Gallery',
  personName: null,
  websiteUrl: 'https://www.geelonggallery.org.au',
  night: { title: 'Gallery Tots', slug: 'gallery-tots-geelong-gallery-2026-12-11', startDate: '2026-12-10T23:00:00Z', timezone: 'Australia/Melbourne', citySlug: 'geelong', bookingUrl: 'https://events.humanitix.com/gallery-tots' },
  photoLink: PHOTO,
  origin: ORIGIN,
}
const CONSENT = { basis: 'conspicuous_publication', publishedOnUrl: 'https://www.geelonggallery.org.au/contact', noMarketingStatementChecked: true }

const read = vi.hoisted(() => ({ answer: null as unknown, calls: 0 }))
const drafted = vi.hoisted(() => ({ answer: null as unknown, request: null as unknown }))
vi.mock('@/lib/outreach/lifecycle-read', () => ({
  readLifecycleFacts: vi.fn(async () => {
    read.calls++
    return read.answer
  }),
}))
vi.mock('@/lib/outreach/drafts', () => ({
  draftFromTemplate: vi.fn(async (_db: unknown, request: unknown) => {
    drafted.request = request
    return drafted.answer
  }),
}))

const { draftLifecycleLetter } = await import('@/lib/outreach/lifecycle-play')

function fakeDb(rendered: { subject: string | null; body: string }) {
  const updates: { payload: Record<string, unknown>; filters: [string, unknown][] }[] = []
  const db = {
    from: (table: string) => ({
      select: () => {
        const b: Record<string, unknown> = {}
        b.eq = () => b
        b.single = async () => (table === 'outreach_touches' ? { data: rendered, error: null } : { data: { address: 'info@geelonggallery.org.au' }, error: null })
        return b
      },
      update: (payload: Record<string, unknown>) => {
        const u = { payload, filters: [] as [string, unknown][] }
        updates.push(u)
        const b: Record<string, unknown> = {}
        b.eq = (c: string, v: unknown) => (u.filters.push([c, v]), b)
        b.select = () => b
        b.maybeSingle = async () => ({ data: { id: 't1' }, error: null })
        b.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })
        return b
      },
    }),
  }
  return { db: db as unknown as SupabaseClient<Database>, updates }
}

const input = (key: 'lifecycle_perm' | 'lifecycle_acq', at = MON_7) => ({ play: { id: 'p1', name: 'Law 49 PERM' }, key, contactId: 'c1', templateId: 'tpl1', scheduledFor: at, now: at, origin: ORIGIN, actingUser: 'u1' })

describe("a law 49 letter is queued only when its clock says due and it passes whole", () => {
  beforeEach(() => {
    read.calls = 0
    read.answer = { state: 'read', recipientId: 'c9', organiserId: 'o1', eventId: 'e1', eventDate: '2026-12-11', facts: TOTS, consent: CONSENT }
    drafted.answer = { state: 'done', value: { id: 't1', state: 'held', heldBecause: [] } }
  })

  it("outside law 44's window nothing is read or drafted", async () => {
    const { db, updates } = fakeDb({ subject: null, body: '' })
    const r = await draftLifecycleLetter(db, input('lifecycle_perm', MON_10))
    expect(r.state).toBe('not drafted')
    expect(read.calls).toBe(0)
    expect(updates).toEqual([])
  })

  it('not due on the clock: no letter, with why', async () => {
    read.answer = { state: 'not due', why: 'no night of theirs is due its letter today' }
    const { db } = fakeDb({ subject: null, body: '' })
    expect(await draftLifecycleLetter(db, input('lifecycle_acq'))).toEqual({ state: 'not drafted', why: 'no night of theirs is due its letter today' })
  })

  it('PERM passing whole is queued for the sender, to the thread contact the reader chose, from the play\'s own version', async () => {
    const r = renderTemplate(LIFECYCLE_PERM, lifecycleFields(TOTS, MON_7), UNSUB)
    const { db, updates } = fakeDb({ subject: r.subject, body: r.body })
    expect(await draftLifecycleLetter(db, input('lifecycle_perm'))).toEqual({ state: 'queued', touchId: 't1' })
    const req = drafted.request as { contactId: string; templateId: string; step: number; playId: string; extraFields: Record<string, string | null> }
    expect(req.contactId).toBe('c9')
    expect(req.templateId).toBe('tpl1')
    expect(req.step).toBe(1)
    expect(req.playId).toBe('p1')
    expect(req.extraFields.days).toBe('18')
    expect(updates).toHaveLength(1)
    expect(updates[0].payload).toMatchObject({ state: 'queued', provider: 'graph' })
    expect(updates[0].filters).toContainEqual(['state', 'held'])
  })

  it('ACQ passing whole is queued; its offer led subject is judged as an acquisition first letter', async () => {
    const r = renderTemplate(LIFECYCLE_ACQ, lifecycleFields(TOTS, MON_7), UNSUB)
    const { db } = fakeDb({ subject: r.subject, body: r.body })
    expect(await draftLifecycleLetter(db, input('lifecycle_acq'))).toEqual({ state: 'queued', touchId: 't1' })
  })

  it('a word the gateway refuses keeps it held with the reason recorded, never queued', async () => {
    const r = renderTemplate(LIFECYCLE_PERM, lifecycleFields(TOTS, MON_7), UNSUB)
    const { db, updates } = fakeDb({ subject: r.subject, body: r.body.replace('show it properly', 'feature it properly') })
    const out = await draftLifecycleLetter(db, input('lifecycle_perm'))
    expect(out.state).toBe('held')
    expect(out.state === 'held' ? out.why.join(' ') : '').toContain('unproved claim')
    expect(updates[0].payload).toHaveProperty('held_because')
    expect(updates.some((u) => u.payload.state === 'queued')).toBe(false)
  })

  it("a CRM rule's hold stays held, never queued", async () => {
    drafted.answer = { state: 'done', value: { id: 't1', state: 'held', heldBecause: ['a field could not be filled from verified facts: [photo source]'] } }
    const { db, updates } = fakeDb({ subject: null, body: '' })
    expect(await draftLifecycleLetter(db, input('lifecycle_perm'))).toEqual({ state: 'held', touchId: 't1', why: ['a field could not be filled from verified facts: [photo source]'] })
    expect(updates).toEqual([])
  })
})

describe('the planner and the sender carry law 49 plays', () => {
  it("a play whose first letter is a lifecycle key takes the clock's cohort, with no day count follow ups, and is not ended by an earlier letter of another kind", async () => {
    const { readFileSync } = await import('node:fs')
    const whole = readFileSync('src/lib/outreach/planner.ts', 'utf8').replace(/\r\n/g, '\n')
    const src = whole.slice(whole.indexOf('export async function planPlays'), whole.indexOf('/* ---', whole.indexOf('export async function planPlays')))
    expect(src).toContain('for (const t of firstKeys.data ?? []) if (isLifecycleKey(t.key as string)) lifecyclePlays.set(t.id as string, t.key as LifecycleKey)')
    expect(src).toContain("const firsts = lifecycle ? { data: [] } : await db.from('outreach_touches')")
    expect(src).toContain('const l = await draftLifecycleLetter(db, {')
    expect(src).toContain('for (const c of lifecycle ? [] : (candidates.data ?? [])) {')
    // The clock's loop never consults the written set: PERM and ACQ are two letters (law 24, law 33).
    const loop = src.slice(src.indexOf('if (lifecycle) {'), src.indexOf('for (const c of lifecycle ? []'))
    expect(loop).not.toContain('written.has(')
  })

  it('the sender reads the clock again before a law 49 letter goes: never inside T-7', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/outreach/sender.ts', 'utf8').replace(/\r\n/g, '\n')
    expect(src).toContain("if (!key.startsWith('segment_a_') && !isLifecycleKey(key)) return null")
    expect(src).toContain('return lifecycleStillAsks(ev.data.start_date as string, (ev.data.timezone as string | null) ?? null, now)')
  })
})

describe('the gateway judges a law 49 letter from the mailbox it really goes from', () => {
  it('PERM is judged as hello@ and ACQ as lawal@ (law 33 (a)), so a thread that belongs to the other mailbox is held', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/outreach/lifecycle-play.ts', 'utf8').replace(/\r\n/g, '\n')
    expect(src).toContain("const box = mailboxFor({ category: LIFECYCLE_SUBTYPE[input.key].split('-')[0], purpose: 'cadence' })")
    expect(src).toContain('      from: box.mailbox,\n')
    const { mailboxFor } = await import('@/lib/outreach/addresses')
    const perm = mailboxFor({ category: 'PERM', purpose: 'cadence' })
    const acq = mailboxFor({ category: 'ACQ', purpose: 'cadence' })
    expect('mailbox' in perm && perm.mailbox.startsWith('hello@')).toBe(true)
    expect('mailbox' in acq && acq.mailbox.startsWith('lawal@')).toBe(true)
  })
})
