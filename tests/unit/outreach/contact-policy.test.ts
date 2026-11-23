import { readdirSync, readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeOutreachDb as fakeDb, TOUCH_KEY, type Row, type Tables } from '../../helpers/outreach-db-fake'

/** The fake, with the one rpc the sender calls first (outreach_close_stuck_sends: nothing stuck). */
const fakeOutreachDb = (t: Tables) => fakeDb(t, { outreach_close_stuck_sends: () => 0 })

/*
 * THE PERMANENT CRM CORRECTION (Lawal, 23 November 2026, 01:51, through the PM's 01:52, items 1 to 4): "do not replace it
 * with another rigid rule"; "different message types must not become a loophole for repeatedly contacting the same
 * organiser".
 *
 * The case: at 01:30 on 23 November law 49's free promotion offer (lifecycle_acq, ACQ) was refused by the database for all
 * twelve organisers of Monday's cohort, "That step is already drafted or sent for this contact.", because each had a
 * permission letter (PERM-IMAGE) sent at step 1 on 18 November (Geelong Gallery on 20 November), and the index of
 * 28 October allowed one step 1 letter per contact whatever its purpose. The cure is not a looser index alone: a message
 * is a duplicate by its purpose, its context (the event or campaign it is about) and its step, and every workflow reads
 * ONE contact policy before drafting and again at send.
 *
 * These drive the real drafter (src/lib/outreach/drafts.ts) and the real sender (src/lib/outreach/sender.ts) against an
 * in-memory fake that holds the unique key as the migration writes it (tests/helpers/outreach-db-fake.ts).
 */

vi.mock('@/lib/outreach/facts', () => ({ factsForContact: vi.fn(async () => ({})) }))

const { draftFromTemplate } = await import('@/lib/outreach/drafts')
const { runOutreachSender, clearRecordedOutreachMail, recordedOutreachMail } = await import('@/lib/outreach/sender')

const ORIGIN = 'https://www.eventlinqs.com.au'
// Monday 23 November 2026, 06:00 in Melbourne: the minute the twelve would have gone.
const MON_6 = new Date('2026-11-22T19:00:00Z')
const DAY = 86_400_000
/** The policy's one gap, CONTACT_GAP_DAYS in src/lib/outreach/contact-policy.ts (contact-policy-core.test.ts holds the two equal). */
const GAP_DAYS = 30

// No stock pleasantry: the send time word check refuses one (the communication standard, Lawal 20:45 of 22 November 2026).
const BODY = `Hi Gallery team,\n\nYour night is on EventLinqs: ${ORIGIN}/events/gallery-tots\n\nKind regards,\nLawal Adams\n\n${ORIGIN}/unsubscribe/outreach?t=x`

function world(extra: Partial<Tables> = {}): Tables {
  return {
    organisers: [
      { id: 'o1', name: 'Geelong Gallery', organisation_id: null },
      { id: 'o2', name: 'Other Hall', organisation_id: null },
    ],
    organiser_contacts: [
      { id: 'c1', organiser_id: 'o1', address: 'gallery@eventlinqs.com', channel: 'email', basis: 'conspicuous_publication', unsubscribe_token: 't1', person_name: null },
      { id: 'c2', organiser_id: 'o1', address: 'gallery.events@eventlinqs.com', channel: 'email', basis: 'conspicuous_publication', unsubscribe_token: 't2', person_name: null },
      { id: 'c3', organiser_id: 'o2', address: 'hall@eventlinqs.com', channel: 'email', basis: 'conspicuous_publication', unsubscribe_token: 't3', person_name: null },
    ],
    outreach_templates: [
      { id: 'tpl-perm', key: 'lifecycle_perm', version: 1, channel: 'email', purpose: 'cadence', step: 1, subject: 'Your [event] listing', body: BODY },
      { id: 'tpl-acq', key: 'lifecycle_acq', version: 1, channel: 'email', purpose: 'cadence', step: 1, subject: 'Days to [event]', body: BODY },
      { id: 'tpl-perm-day4', key: 'segment_a_day4', version: 1, channel: 'email', purpose: 'cadence', step: 2, subject: 'Re: [thread subject]', body: BODY },
      { id: 'tpl-featured', key: 'featured', version: 1, channel: 'email', purpose: 'relationship', step: null, subject: 'Featured', body: BODY },
      { id: 'tpl-who', key: 'reply_who_are_you', version: 1, channel: 'email', purpose: 'reply', step: null, subject: 'Re: [thread subject]', body: BODY },
      { id: 'tpl-stop', key: 'reply_stop', version: 1, channel: 'email', purpose: 'reply', step: null, subject: 'Re: [thread subject]', body: BODY },
    ],
    outreach_touches: [],
    outreach_replies: [],
    outreach_unsubscribes: [],
    outreach_delivery_events: [],
    outreach_sender: [{ id: true, mode: 'test', from_address: 'hello@eventlinqs.com', test_domain: 'eventlinqs.com', send_days: null, send_from_minute: null, send_until_minute: null }],
    organiser_venues: [],
    events: [{ slug: 'gallery-tots', start_date: '2026-12-10T23:00:00Z', end_date: null, status: 'published', timezone: 'Australia/Melbourne' }],
    ...extra,
  }
}

/** A letter already sent: the PERM permission letter of 18 November, step 1, unanswered. */
const sentPerm = (contactId: string, sentAt: string, id = `sent-${contactId}`): Row => ({
  id, contact_id: contactId, purpose: 'cadence', step: 1, template_id: 'tpl-perm', comms_category: 'PERM', comms_subtype: 'PERM-IMAGE',
  context_key: null, state: 'sent', sent_at: sentAt, scheduled_for: sentAt, subject: 'Your night', body: BODY, internet_message_id: `<${id}@eventlinqs.com>`,
})

const queuedLetter = (id: string, contactId: string, templateId: string, category: string, at: Date): Row => ({
  id, contact_id: contactId, purpose: 'cadence', step: 1, template_id: templateId, comms_category: category, context_key: 'event:E1',
  state: 'queued', provider: 'graph', scheduled_for: at.toISOString(), subject: 'Your night', body: BODY, in_reply_to: null, sent_at: null,
})

const draft = (db: Parameters<typeof draftFromTemplate>[0], o: { contact: string; template: string; purpose?: 'cadence' | 'relationship' | 'reply'; step?: 1 | 2 | 3; context?: string | null; at?: Date }) =>
  draftFromTemplate(db, {
    contactId: o.contact,
    templateKey: o.template,
    templateId: o.template,
    purpose: o.purpose ?? 'cadence',
    step: o.step ?? 1,
    contextKey: o.context ?? null,
    scheduledFor: o.at ?? MON_6,
    origin: ORIGIN,
    draftedBy: 'u1',
  } as Parameters<typeof draftFromTemplate>[1])

const live = (t: Tables) => (t.outreach_touches ?? []).filter((r) => r.state !== 'void')
const sends = { sender: (db: Parameters<typeof runOutreachSender>[0], at = MON_6, only?: string[]) => runOutreachSender(db, { now: at, origin: ORIGIN, graph: null, ...(only ? { only } : {}) }) }

beforeEach(() => clearRecordedOutreachMail())

describe('1. the same purpose and event twice is refused; another event is another letter', () => {
  it('a second PERM letter about the same event to the same contact is refused in plain words; one about another event is drafted', async () => {
    const { db, tables } = fakeOutreachDb(world())
    const first = await draft(db, { contact: 'c1', template: 'tpl-perm', context: 'event:E1' })
    expect(first.state).toBe('done')
    const again = await draft(db, { contact: 'c1', template: 'tpl-perm', context: 'event:E1' })
    expect(again).toEqual({ state: 'refused', reason: expect.stringMatching(/already drafted or sent/) })
    const other = await draft(db, { contact: 'c1', template: 'tpl-perm', context: 'event:E2' })
    expect(other.state).toBe('done')
    expect(live(tables).map((r) => r.context_key).sort()).toEqual(['event:E1', 'event:E2'])
  })
})

describe('2. a second category inside the gap is held, with its reason and its next eligible date', () => {
  it('ACQ to an organiser whose PERM letter went five days ago and is unanswered is not drafted: held until the gap passes', async () => {
    const { db, tables } = fakeOutreachDb(world({ outreach_touches: [sentPerm('c1', '2026-11-17T20:00:00Z')] }))
    const r = await draft(db, { contact: 'c1', template: 'tpl-acq', context: 'event:E1' })
    expect(r).toMatchObject({ state: 'held by policy', rule: 'gap', nextEligibleAt: new Date(Date.parse('2026-11-17T20:00:00Z') + GAP_DAYS * DAY).toISOString() })
    expect(r.state === 'held by policy' ? r.reason : '').toMatch(/18 Nov 2026.*18 Dec 2026/s)
    expect(live(tables)).toHaveLength(1)
  })

  it('the same organiser on its other address is held too: the gap is the organiser\'s, not the address\'s', async () => {
    const { db } = fakeOutreachDb(world({ outreach_touches: [sentPerm('c1', '2026-11-17T20:00:00Z')] }))
    expect((await draft(db, { contact: 'c2', template: 'tpl-acq', context: 'event:E1' })).state).toBe('held by policy')
  })

  it('at send: a queued ACQ letter inside the gap is never sent; it is set aside with the reason and the date', async () => {
    const { db, tables } = fakeOutreachDb(world({ outreach_touches: [sentPerm('c1', '2026-11-17T20:00:00Z'), queuedLetter('q-acq', 'c1', 'tpl-acq', 'ACQ', MON_6)] }))
    const report = await sends.sender(db)
    expect(report.sent).toEqual([])
    expect(recordedOutreachMail()).toHaveLength(0)
    const q = tables.outreach_touches.find((r) => r.id === 'q-acq')!
    expect(q.state).toBe('void')
    expect(String(q.void_reason)).toMatch(/contact policy.*18 Dec 2026/s)
  })
})

describe('3. after the gap it is allowed', () => {
  it('a day short of the gap it is held, with the gap\'s end as its next eligible date; from the gap\'s end it is drafted', async () => {
    const sentAt = '2026-10-23T19:00:00Z'
    const ends = new Date(Date.parse(sentAt) + GAP_DAYS * DAY)
    const short = fakeOutreachDb(world({ outreach_touches: [sentPerm('c1', sentAt)] }))
    expect(await draft(short.db, { contact: 'c1', template: 'tpl-acq', context: 'event:E1', at: new Date(ends.getTime() - DAY) })).toMatchObject({ state: 'held by policy', nextEligibleAt: ends.toISOString() })
    const after = fakeOutreachDb(world({ outreach_touches: [sentPerm('c1', sentAt)] }))
    expect((await draft(after.db, { contact: 'c1', template: 'tpl-acq', context: 'event:E1', at: ends })).state).toBe('done')
  })
})

describe('4. a reply stops cold sequences, and moves the organiser into its own handling', () => {
  const replied = () => world({ outreach_touches: [sentPerm('c1', '2026-11-17T20:00:00Z')], outreach_replies: [{ id: 'r1', contact_id: 'c2', outcome: 'question', received_at: '2026-11-19T01:00:00Z' }] })

  it('no cold letter and no cold follow up to any address of an organiser who replied; the answer to their reply is drafted', async () => {
    const { db } = fakeOutreachDb(replied())
    const cold = await draft(db, { contact: 'c1', template: 'tpl-acq', context: 'event:E1' })
    expect(cold).toMatchObject({ state: 'held by policy', rule: 'replied', nextEligibleAt: null })
    expect(await draft(db, { contact: 'c1', template: 'tpl-perm-day4', step: 2 })).toMatchObject({ state: 'held by policy', rule: 'replied' })
    expect((await draft(db, { contact: 'c2', template: 'tpl-who', purpose: 'reply' })).state).toBe('done')
  })

  it('at send: a queued cold follow up to an organiser who has since replied, on another address, is never sent', async () => {
    const t = replied()
    t.outreach_touches.push({ ...queuedLetter('q-cold', 'c1', 'tpl-perm-day4', 'PERM', MON_6), step: 2, context_key: null })
    const { db, tables } = fakeOutreachDb(t)
    const report = await sends.sender(db)
    expect(report.sent).toEqual([])
    expect(recordedOutreachMail()).toHaveLength(0)
    expect(tables.outreach_touches.find((r) => r.id === 'q-cold')!.state).toBe('void')
  })
})

describe('5. suppression, opt out and bounce stop every category', () => {
  const kinds = [
    { template: 'tpl-perm', purpose: 'cadence' as const },
    { template: 'tpl-acq', purpose: 'cadence' as const },
    { template: 'tpl-featured', purpose: 'relationship' as const },
    { template: 'tpl-who', purpose: 'reply' as const },
  ]

  it('an unsubscribed address of the organiser holds PERM, ACQ, LIST and a reply to every one of its addresses; only the one stop confirmation goes to the one who asked', async () => {
    const { db, tables } = fakeOutreachDb(world({ outreach_unsubscribes: [{ id: 'u1', email: 'gallery.events@eventlinqs.com', created_at: '2026-11-20T00:00:00Z' }] }))
    for (const k of kinds) {
      for (const contact of ['c1', 'c2']) {
        expect(await draft(db, { contact, template: k.template, purpose: k.purpose, context: `event:${k.template}` })).toMatchObject({ state: 'held by policy', rule: 'suppressed', nextEligibleAt: null })
      }
    }
    expect((await draft(db, { contact: 'c2', template: 'tpl-stop', purpose: 'reply' })).state).toBe('done')
    expect(live(tables)).toHaveLength(1)
    // Another organiser is untouched by it.
    expect((await draft(db, { contact: 'c3', template: 'tpl-perm', context: 'event:E9' })).state).toBe('done')
  })

  it('a stop by reply, and a hard bounce, hold every category the same way', async () => {
    const stopped = fakeOutreachDb(world({ outreach_replies: [{ id: 'r9', contact_id: 'c1', outcome: 'stop', received_at: '2026-11-20T00:00:00Z' }] }))
    for (const k of kinds) expect(await draft(stopped.db, { contact: 'c2', template: k.template, purpose: k.purpose })).toMatchObject({ state: 'held by policy', rule: 'opted out' })
    const bounced = fakeOutreachDb(world({ outreach_touches: [sentPerm('c1', '2026-11-01T20:00:00Z', 'b1')], outreach_delivery_events: [{ id: 'd1', touch_id: 'b1', kind: 'bounce_hard', occurred_at: '2026-11-01T20:05:00Z' }] }))
    for (const k of kinds) expect(await draft(bounced.db, { contact: 'c1', template: k.template, purpose: k.purpose, context: 'event:E7' })).toMatchObject({ state: 'held by policy', rule: 'bounced' })
  })

  it('at send: a queued letter of any category to a suppressed organiser is never sent', async () => {
    const { db, tables } = fakeOutreachDb(world({
      outreach_unsubscribes: [{ id: 'u1', email: 'gallery@eventlinqs.com', created_at: '2026-11-20T00:00:00Z' }],
      outreach_touches: [queuedLetter('q-perm', 'c2', 'tpl-perm', 'PERM', MON_6)],
    }))
    const report = await sends.sender(db)
    expect(report.sent).toEqual([])
    expect(tables.outreach_touches.find((r) => r.id === 'q-perm')!.state).toBe('void')
  })
})

describe('6. two concurrent drafts give one row', () => {
  it('two runs drafting the same letter at once leave one row, carrying its event as its context; the other is told it is already drafted, and nothing throws', async () => {
    const { db, tables } = fakeOutreachDb(world())
    const both = await Promise.all([
      draft(db, { contact: 'c1', template: 'tpl-perm', context: 'event:E1' }),
      draft(db, { contact: 'c1', template: 'tpl-perm', context: 'event:E1' }),
    ])
    expect(both.map((r) => r.state).sort()).toEqual(['done', 'refused'])
    expect(both.find((r) => r.state === 'refused')).toEqual({ state: 'refused', reason: expect.stringMatching(/already drafted or sent/) })
    expect(live(tables)).toHaveLength(1)
    expect(live(tables)[0]).toMatchObject({ contact_id: 'c1', comms_category: 'PERM', context_key: 'event:E1', step: 1 })
  })

  it("the key in the database is the fake's key: the newest definition of outreach_touches_one_per_step is (contact, category, context, step), not void", () => {
    const dir = 'supabase/migrations'
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    const defining = files.filter((f) => /create unique index[^;]*outreach_touches_one_per/i.test(readFileSync(`${dir}/${f}`, 'utf8')))
    const sql = readFileSync(`${dir}/${defining[defining.length - 1]}`, 'utf8').replace(/\s+/g, ' ')
    expect(sql).toMatch(/on public\.outreach_touches \(contact_id, coalesce\(comms_category, ''\), coalesce\(context_key, ''\), step\) where state <> 'void';/)
    expect(TOUCH_KEY).toEqual(['contact_id', 'comms_category', 'context_key', 'step'])
    expect(sql).toMatch(/rename to outreach_touches_one_per_step;/)
  })
})

describe('7. a retried send gives one message', () => {
  it('two sender runs at once and a third after it send one message, and the record names one message id', async () => {
    const { db, tables } = fakeOutreachDb(world({ outreach_touches: [queuedLetter('q1', 'c3', 'tpl-perm', 'PERM', MON_6)] }))
    const [a, b] = await Promise.all([sends.sender(db), sends.sender(db)])
    const c = await sends.sender(db)
    expect(recordedOutreachMail()).toHaveLength(1)
    expect([...a.sent, ...b.sent, ...c.sent]).toEqual(['q1'])
    expect([...a.refused, ...b.refused].map((x) => x.reason)).toEqual(['taken by another run'])
    const row = tables.outreach_touches.find((r) => r.id === 'q1')!
    expect(row.state).toBe('sent')
    expect(row.internet_message_id).toBe(recordedOutreachMail()[0].messageId)
  })
})

describe('the twelve of Monday 23 November: held, each with its reason and its next eligible date', () => {
  it('written on 18 November (Geelong Gallery on 20 November) and unanswered: at 06:00 on the 23rd the offer is held, eligible from 18 and 20 December', async () => {
    const { db } = fakeOutreachDb(world({ outreach_touches: [sentPerm('c3', '2026-11-17T21:00:00Z'), sentPerm('c1', '2026-11-19T21:00:00Z')] }))
    const hall = await draft(db, { contact: 'c3', template: 'tpl-acq', context: 'event:E3' })
    const gallery = await draft(db, { contact: 'c1', template: 'tpl-acq', context: 'event:E1' })
    expect(hall).toMatchObject({ state: 'held by policy', rule: 'gap' })
    expect(gallery).toMatchObject({ state: 'held by policy', rule: 'gap' })
    expect(hall.state === 'held by policy' ? hall.reason : '').toMatch(/18 Dec 2026/)
    expect(gallery.state === 'held by policy' ? gallery.reason : '').toMatch(/20 Nov 2026.*20 Dec 2026/s)
  })
})
