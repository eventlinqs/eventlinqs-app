import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EMPTY,
  combine,
  nextAction,
  nextGoAt,
  noticeFigures,
  notificationFigures,
  outcomeFigures,
  reportFigures,
  reportGroups,
  reportNotes,
  sectionsInOrder,
  sentRecordFigures,
  socialFigures,
  socialNotes,
  touchFigures,
} from '@/lib/comms/centre-math'

// The Growth and Communications Centre (Law 24; the directive's section 7): ten figures per section, counted from rows,
// a figure no record can hold left null and never shown as a zero.
const t = (id: string, state: string, drafted_at = '2026-11-18T00:00:00Z', sent_at: string | null = null) => ({ id, state, drafted_at, sent_at })

describe('the Centre counts what the rows say', () => {
  it('CRM messages: held pending, past held approved, queued scheduled, a bounce failed, a reply its outcome, void withdrawn', () => {
    const rows = [t('a', 'held'), t('b', 'queued'), t('c', 'sending'), t('d', 'sent', undefined, '2026-11-18T01:00:00Z'), t('e', 'sent', undefined, '2026-11-18T02:00:00Z'), t('f', 'failed'), t('g', 'void')]
    const f = touchFigures(rows, new Set(['e']), new Map([['d', 2]]))
    expect(f).toEqual({ total: 7, pending: 1, approved: 5, scheduled: 2, sent: 2, delivered: null, failed: 2, outcomes: 2, withdrawn: 1, lastUpdated: '2026-11-18T02:00:00Z' })
  })

  it('social pieces: approved by an approval, published by a schedule, confirmed only with the platform\'s own post address, held as failed', () => {
    const pieces = [{ id: 'p1', planned_at: '2026-11-17T00:00:00Z' }, { id: 'p2', planned_at: null }, { id: 'p3', planned_at: null }]
    const schedules = [
      { piece_id: 'p1', state: 'published', published_ref: 'https://www.instagram.com/p/x', published_at: '2026-11-18T03:00:00Z', created_at: null },
      { piece_id: 'p1', state: 'published', published_ref: 'https://www.facebook.com/x', published_at: '2026-11-18T03:01:00Z', created_at: null },
      { piece_id: 'p2', state: 'held', published_ref: null, published_at: null, created_at: '2026-11-18T00:30:00Z' },
    ]
    const f = socialFigures(pieces, new Set(['p1', 'p2']), schedules)
    expect(f).toMatchObject({ total: 3, pending: 1, approved: 2, scheduled: 0, sent: 1, delivered: 1, failed: 1, outcomes: null, withdrawn: null, lastUpdated: '2026-11-18T03:01:00Z' })
  })

  // THE PM's 06:59 ITEM 3 OF 25 NOVEMBER 2026: "141 waiting for approval, 12 failed" counted 136 pieces set aside (66
  // rejected, 70 expired when their nights started) as waiting, and seven holds on purpose as failures.
  it('a piece set aside is not waiting, and only a hold that names a fault is a failure', () => {
    const pieces = [{ id: 'p1', planned_at: null }, { id: 'p2', planned_at: null }, { id: 'p3', planned_at: null }, { id: 'p4', planned_at: null }]
    const held = (piece_id: string, held_reason: string | null) => ({ piece_id, state: 'held', published_ref: null, published_at: null, created_at: null, held_reason })
    const schedules = [
      held('p1', 'new row for relation "social_piece_schedules" violates check constraint "social_piece_schedules_published_ref_check"'),
      held('p2', 'Withdrawn before publishing (Lawal, 19:04 of 22 November 2026: do not publish anything about AMCF tonight).'),
      held('p3', 'Superseded: the PM chose this night\'s photograph by looking; the next revision carries it.'),
      held('p4', null),
    ]
    const aside = new Set(['p2', 'p3'])
    const f = socialFigures(pieces, new Set(), schedules, aside)
    expect(f).toMatchObject({ total: 4, pending: 2, failed: 2 })
    expect(socialNotes(pieces, new Set(), schedules, aside)).toEqual([
      '2 set aside before approval (expired when their nights started, or rejected): nothing waits on them',
      '2 held on purpose before posting (withdrawn, superseded, or held by a rule), each with its reason on its schedule: not failures',
    ])
  })
  // THE PM's 09:07 ITEM 1: the music piece's Instagram row read 'published' at 09:07 holding only Blotato's submission;
  // its address was read back by 09:25. A submission is handed over, never confirmed.
  it('a post is confirmed only by the network\'s own address, never by a Blotato submission', () => {
    const pieces = [{ id: 'p1', planned_at: null }]
    const pub = (published_ref: string) => ({ piece_id: 'p1', state: 'published', published_ref, published_at: '2026-11-24T22:00:29Z', created_at: null })
    expect(socialFigures(pieces, new Set(['p1']), [pub('blotato:d3b1bbb3-a3a6-40ad-9b99-c4b215c02e58')])).toMatchObject({ sent: 1, delivered: 0 })
    expect(socialFigures(pieces, new Set(['p1']), [pub('https://www.instagram.com/p/DgI-vbKlmXZ/')])).toMatchObject({ sent: 1, delivered: 1 })
    expect(socialNotes(pieces, new Set(['p1']), [pub('blotato:d3b1bbb3')], new Set())).toEqual(['1 posts handed to Blotato whose public address is not read back yet: not confirmed until it is'])
  })
  it('the next post is the earliest schedule still waiting, from an hour ago on', () => {
    const now = new Date('2026-11-24T21:00:00Z')
    const s = (state: string, go_at: string) => ({ piece_id: 'p', state, published_ref: null, published_at: null, created_at: null, go_at })
    expect(nextGoAt([s('scheduled', '2026-11-25T22:00:00Z'), s('scheduled', '2026-11-24T22:00:00Z'), s('published', '2026-11-24T21:30:00Z'), s('scheduled', '2026-11-24T10:00:00Z')], now)).toBe('2026-11-24T22:00:00Z')
    expect(nextGoAt([], now)).toBeNull()
  })

  // THE PM's 06:59 ITEM 4: "569 of 569 night reports not sent" read as waiting; none could ever go.
  it('a night report that can never go is not sendable, with its reason; only a partner\'s in its window with something counted is pending', () => {
    // Wednesday 25 November 2026, 11:00 in Melbourne.
    const now = new Date('2026-11-25T00:00:00Z')
    const day = 86_400_000
    const ended = (days: number) => new Date(now.getTime() - days * day).toISOString()
    const counted = { viewers: 5, pressesOut: { people: 1, bySite: [] }, onEventLinqs: null }
    const reports = [
      { event_id: 'e-sent', night_ended_at: ended(3), sent_at: ended(1), lettered: false, figures: counted },
      { event_id: 'e-lettered', night_ended_at: ended(3), sent_at: null, lettered: true, figures: counted },
      { event_id: 'e-nobody', night_ended_at: ended(3), sent_at: null, lettered: false, figures: counted },
      { event_id: 'e-cold', night_ended_at: ended(3), sent_at: null, lettered: false, figures: counted },
      { event_id: 'e-late', night_ended_at: ended(9), sent_at: null, lettered: false, figures: counted },
      { event_id: 'e-due', night_ended_at: ended(3), sent_at: null, lettered: false, figures: counted },
      // Ended at 08:36 this morning: its note goes from tomorrow, Thursday 26 (T+1), in its own zone.
      { event_id: 'e-soon', night_ended_at: ended(0.1), sent_at: null, lettered: false, figures: counted },
      { event_id: 'e-nothing', night_ended_at: ended(2), sent_at: null, lettered: false, figures: { viewers: 0, pressesOut: { people: 0, bySite: [] }, onEventLinqs: null } },
    ]
    const partnerOf = new Map<string, string | null>([['e-nobody', null], ['e-cold', null], ['e-late', 'o-partner'], ['e-due', 'o-partner'], ['e-soon', 'o-partner'], ['e-nothing', 'o-partner']])
    const g = reportGroups(reports, { partnerOf, hasOrganiser: new Set(['e-cold', 'e-late', 'e-due', 'e-soon', 'e-nothing']), zoneOf: new Map() }, now)
    expect(g).toEqual({ total: 8, sent: 2, dueNow: 1, notYetDue: 1, firstDue: '2026-11-25T13:00:00.000Z', noOrganiser: 1, notPartner: 1, pastWindow: 1, nothingCounted: 1 })
    expect(reportFigures(g, null)).toMatchObject({ total: 8, pending: 2, sent: 2 })
    expect(reportNotes(g).map((n) => n.split(':')[0])).toEqual(['1 night reports not sendable', '1 night reports not sendable', '1 night reports not sendable', '1 night reports not sent'])
  })

  it('a record with no approval step says so, and pending means not yet sent', () => {
    const f = sentRecordFigures([{ at: '2026-11-01T00:00:00Z', sent_at: null }, { at: '2026-11-02T00:00:00Z', sent_at: '2026-11-03T00:00:00Z' }])
    expect(f).toMatchObject({ total: 2, pending: 1, sent: 1, approved: null, delivered: null, failed: null })
  })

  it('the founder\'s notices: pending and held for the digest wait; sent and failed counted', () => {
    const f = noticeFigures([{ delivery_state: 'sent', occurred_at: null, sent_at: null }, { delivery_state: 'held_for_digest', occurred_at: null, sent_at: null }, { delivery_state: 'failed', occurred_at: null, sent_at: null }])
    expect(f).toMatchObject({ total: 3, pending: 1, sent: 1, failed: 1 })
  })

  it('notifications: scheduled until sent, an opened one is an outcome', () => {
    const f = notificationFigures([
      { scheduled_for: '2026-11-19T00:00:00Z', sent_at: null, opened_at: null, created_at: null },
      { scheduled_for: null, sent_at: '2026-11-18T00:00:00Z', opened_at: '2026-11-18T01:00:00Z', created_at: null },
    ])
    expect(f).toMatchObject({ total: 2, scheduled: 1, sent: 1, outcomes: 1 })
  })

  it('combining keeps a figure no source holds null, and adds the rest', () => {
    const f = combine(touchFigures([t('a', 'held')], new Set(), new Map()), outcomeFigures([{ at: '2026-11-18T05:00:00Z' }]))
    expect(f).toMatchObject({ total: 1, pending: 1, delivered: null, outcomes: 1, lastUpdated: '2026-11-18T05:00:00Z' })
    expect(combine(EMPTY, EMPTY)).toEqual(EMPTY)
  })

  it('the next action comes from the figures, then the real next step and its time, and acquisition always shows its first letters against the 20', () => {
    expect(nextAction('ACQ', { ...EMPTY, total: 29, pending: 29 }, 0)).toBe('0 of 20 first letters sent today. 29 held until their own checks clear')
    expect(nextAction('ACQ', { ...EMPTY, total: 29, pending: 0 }, 0, 'none is queued; the next sending window opens 26 Nov 2026, 6:00 am')).toBe(
      '0 of 20 first letters sent today. Nothing waiting. None is queued; the next sending window opens 26 Nov 2026, 6:00 am',
    )
    expect(nextAction('RET', { ...EMPTY, total: 395, pending: 395 }, null)).toBe('395 waiting to be sent')
    expect(nextAction('SOC', { ...EMPTY, total: 3, pending: 0, scheduled: 2 }, null, 'the next post goes 26 Nov 2026, 9:00 am')).toBe('2 scheduled to go. The next post goes 26 Nov 2026, 9:00 am')
    expect(nextAction('SOC', { ...EMPTY, total: 3, pending: 1 }, null)).toBe("1 drawn and waiting for the PM's verify")
    expect(nextAction('TKT', EMPTY, null)).toBe('Nothing recorded yet')
    expect(nextAction('LIST', { ...EMPTY, total: 4, pending: 0, scheduled: 0 }, null)).toBe('Nothing waiting')
  })
  it('no tile says a founder approval is waited on: replies and approved letters go by themselves (Lawal, 07:02 of 25 November 2026)', () => {
    for (const c of ['ACQ', 'PERM', 'LIST', 'SOC', 'RET', 'TKT', 'SYS'] as const) {
      expect(nextAction(c, { ...EMPTY, total: 5, pending: 5 }, null)).not.toMatch(/for approval|your approval|Lawal/)
    }
  })

  it('seven sections, always, in the directive\'s order, with his names', () => {
    const s = sectionsInOrder({}, null)
    expect(s.map((x) => x.category)).toEqual(['ACQ', 'PERM', 'LIST', 'SOC', 'RET', 'TKT', 'SYS'])
    expect(s.map((x) => x.name)).toEqual([
      'Organiser Acquisition', 'Event Image and Asset Permissions', 'Event Listing Communications', 'Social Media Marketing',
      'Organiser Retention', 'Native Ticketing Conversion', 'System and Operational Notifications',
    ])
  })

  it('the page shows every figure the directive names, and links from the admin navigation', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/admin/(authed)/comms/page.tsx'), 'utf8')
    for (const label of ['Total records', 'Pending', 'Approved', 'Scheduled', 'Sent or published', 'Delivered or confirmed', 'Failed', 'Replies or outcomes', 'Last updated', 'Next action']) {
      expect(page, label).toContain(label)
    }
    const nav = readFileSync(join(process.cwd(), 'src/components/admin/admin-nav.ts'), 'utf8')
    expect(nav).toContain("{ label: 'Communications centre', href: '/admin/comms', capability: 'admin.network.manage' }")
  })
})
