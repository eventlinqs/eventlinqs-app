import { beforeEach, describe, expect, it, vi } from 'vitest'

const voided: string[] = []
const drafted: Array<Record<string, unknown>> = []
vi.mock('@/lib/outreach/daily-twenty-read', () => ({ readDailyTwenty: vi.fn(async () => ({ groups: [] })) }))
vi.mock('@/lib/growth/platform-organiser', () => ({ readPlatformOrganiserIds: vi.fn(async () => new Set<string>()) }))
vi.mock('@/lib/outreach/crm', () => ({
  voidTouch: vi.fn(async (_db: unknown, i: { touchId: string }) => {
    voided.push(i.touchId)
    return { state: 'done' }
  }),
}))
vi.mock('@/lib/outreach/drafts', () => ({
  draftFromTemplate: vi.fn(async (_db: unknown, r: Record<string, unknown>) => {
    drafted.push(r)
    return { state: 'done', value: { heldBecause: [] } }
  }),
}))
const nights: Array<Record<string, unknown>> = []
vi.mock('@/lib/outreach/their-nights', () => ({ readTheirNights: vi.fn(async () => nights) }))

import { draftTheTwenty, isSendableNight, sendableFrom } from '@/lib/outreach/twenty-drafts'
import { TWENTY_LETTERS } from '@/lib/outreach/twenty-letters'

/*
 * A FIRST LETTER NAMES A NIGHT IT CAN STILL REACH (15 November 2026): production's 16:00 outreach run redrafted eight
 * set-aside contacts and seven of the new letters named a night that day or the next (Comedy Republic's Sunday
 * Laughternoons, Melbourne Comedy Club's Working It Out), stale before Lawal could approve them and the sender send them.
 */
const NOW = new Date('2026-11-15T05:00:00Z') // Sunday 15 November, 4pm in Melbourne

function fakeDb(waiting: Array<{ id: string; contact_id: string; key: string; version: number; body: string }>, events: Array<{ slug: string; start_date: string }>) {
  const rows: Record<string, unknown> = {
    admin_users: [{ id: 'founder-1' }],
    organiser_contacts: { organiser_id: 'org-cr', person_name: null, unsubscribe_token: 'tok-cr' },
    organisers: { id: 'org-cr', name: 'Comedy Republic', organisation_id: null, website_url: null },
  }
  return {
    from(table: string) {
      let key = ''
      const q: Record<string, unknown> = {}
      const chain = (..._a: unknown[]) => q
      Object.assign(q, {
        select: chain,
        in: chain,
        order: chain,
        is: chain,
        neq: chain,
        gte: chain,
        eq: (col: string, val: unknown) => {
          if (col === 'key') key = String(val)
          return q
        },
        limit: (..._a: unknown[]) => (table === 'admin_users' ? Promise.resolve({ data: rows.admin_users, error: null }) : q),
        maybeSingle: async () => {
          const letter = TWENTY_LETTERS.find((l) => l.key === key)
          return { data: letter ? { ...letter, version: 3 } : null, error: null }
        },
        single: async () => ({ data: rows[table], error: null }),
        insert: async () => ({ error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          resolve({
            data:
              table === 'outreach_touches'
                ? waiting.map((w) => ({ id: w.id, contact_id: w.contact_id, state: 'held', body: w.body, outreach_templates: { key: w.key, version: w.version } }))
                : table === 'events'
                  ? events
                  : [],
            error: null,
          }),
      })
      return q
    },
  }
}

describe('the first day a letter may name', () => {
  it('is the day after tomorrow in Melbourne', () => {
    expect(sendableFrom(NOW)).toBe('2026-11-17')
    expect(sendableFrom(new Date('2026-11-15T14:00:00Z'))).toBe('2026-11-18') // 1am Monday in Melbourne
  })
  it('a night today or tomorrow cannot be named; the day after can', () => {
    expect(isSendableNight('2026-11-15T09:00:00Z', NOW)).toBe(false)
    expect(isSendableNight('2026-11-16T09:00:00Z', NOW)).toBe(false)
    expect(isSendableNight('2026-11-17T09:00:00Z', NOW)).toBe(true)
  })
})

describe('a held letter naming a night it can no longer reach', () => {
  beforeEach(() => {
    voided.length = 0
    drafted.length = 0
    nights.length = 0
  })
  const held = {
    id: 'cr-sunday',
    contact_id: 'contact-cr',
    key: 'twenty_advice',
    version: 3,
    body: 'Hi Comedy Republic team,\nSunday Laughternoons on Sunday 15 November is already listed: https://www.eventlinqs.com.au/events/sunday-laughternoons-comedy-republic-2026-11-15',
  }

  it('is set aside and drafted again with their soonest night from the day after tomorrow', async () => {
    nights.push(
      { title: 'Sunday Laughternoons', startDate: '2026-11-15T05:00:00Z', timezone: 'Australia/Melbourne', venueName: 'Comedy Republic', isFree: true },
      { title: 'Comedy Republic Main Stage', startDate: '2026-11-20T09:00:00Z', timezone: 'Australia/Melbourne', venueName: 'Comedy Republic', isFree: false },
    )
    const db = fakeDb([held], [{ slug: 'sunday-laughternoons-comedy-republic-2026-11-15', start_date: '2026-11-15T05:00:00Z' }])
    const out = await draftTheTwenty(db as never, { now: NOW, origin: 'https://www.eventlinqs.com.au' })
    expect(voided).toEqual(['cr-sunday'])
    expect(drafted).toHaveLength(1)
    expect(JSON.stringify(drafted[0].extraFields)).toContain('Comedy Republic Main Stage')
    expect(JSON.stringify(drafted[0].extraFields)).not.toContain('Sunday Laughternoons')
    expect(out).toMatchObject({ state: 'drafted', redrafted: 1 })
  })

  it('is set aside alone when no night of theirs is far enough ahead', async () => {
    nights.push({ title: 'Sunday Laughternoons', startDate: '2026-11-15T05:00:00Z', timezone: 'Australia/Melbourne', venueName: 'Comedy Republic', isFree: true })
    const db = fakeDb([held], [{ slug: 'sunday-laughternoons-comedy-republic-2026-11-15', start_date: '2026-11-15T05:00:00Z' }])
    await draftTheTwenty(db as never, { now: NOW, origin: 'https://www.eventlinqs.com.au' })
    expect(voided).toEqual(['cr-sunday'])
    expect(drafted).toEqual([])
  })

  it('a held letter naming a night still ahead enough is left alone', async () => {
    const later = { ...held, id: 'cr-friday', body: held.body.replace('sunday-laughternoons-comedy-republic-2026-11-15', 'comedy-republic-main-stage-2026-11-20') }
    const db = fakeDb([later], [{ slug: 'comedy-republic-main-stage-2026-11-20', start_date: '2026-11-20T09:00:00Z' }])
    await draftTheTwenty(db as never, { now: NOW, origin: 'https://www.eventlinqs.com.au' })
    expect(voided).toEqual([])
    expect(drafted).toEqual([])
  })
})
