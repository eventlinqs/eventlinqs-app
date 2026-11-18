import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EMPTY,
  combine,
  nextAction,
  noticeFigures,
  notificationFigures,
  outcomeFigures,
  sectionsInOrder,
  sentRecordFigures,
  socialFigures,
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

  it('the next action comes from the figures, and acquisition always shows its first letters against the 20', () => {
    expect(nextAction('ACQ', { ...EMPTY, total: 29, pending: 29 }, 0)).toBe('0 of 20 first letters sent today. 29 waiting for approval')
    expect(nextAction('RET', { ...EMPTY, total: 395, pending: 395 }, null)).toBe('395 waiting to be sent')
    expect(nextAction('SOC', { ...EMPTY, total: 3, pending: 0, scheduled: 2 }, null)).toBe('2 scheduled to go')
    expect(nextAction('TKT', EMPTY, null)).toBe('Nothing recorded yet')
    expect(nextAction('LIST', { ...EMPTY, total: 4, pending: 0, scheduled: 0 }, null)).toBe('Nothing waiting')
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
