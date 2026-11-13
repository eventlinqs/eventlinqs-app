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

import { draftTheTwenty } from '@/lib/outreach/twenty-drafts'
import { TWENTY_LETTERS } from '@/lib/outreach/twenty-letters'

/*
 * EVERY HELD DRAFT CARRIES THE LETTER'S CURRENT WORDS, IN TODAY'S TWENTY OR NOT (12 November 2026: Aunty Jacks was
 * drafted at 03:00 on version 1, the twenty's ranking left it out at 05:00 when the other five moved to version 2 with the
 * photo link, and its draft stayed in Lawal's queue without it).
 */
function fakeDb(waiting: Array<{ id: string; contact_id: string; key: string; version: number }>) {
  const rows: Record<string, unknown> = {
    admin_users: [{ id: 'founder-1' }],
    organiser_contacts: { organiser_id: 'org-aj', person_name: null, unsubscribe_token: 'tok-aj' },
    organisers: { id: 'org-aj', name: 'Aunty Jacks', organisation_id: null, website_url: null },
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
          return { data: letter ? { ...letter, version: 2 } : null, error: null }
        },
        single: async () => ({ data: rows[table], error: null }),
        insert: async () => ({ error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          resolve({
            data: table === 'outreach_touches'
              ? waiting.map((w) => ({ id: w.id, contact_id: w.contact_id, state: 'held', outreach_templates: { key: w.key, version: w.version } }))
              : [],
            error: null,
          }),
      })
      return q
    },
  }
}

const NOW = new Date('2026-11-12T05:00:00Z')

describe("a stale draft whose organiser is not in today's twenty", () => {
  beforeEach(() => {
    voided.length = 0
    drafted.length = 0
    nights.length = 0
  })

  it('is set aside and drafted again in the current words, with the photo link', async () => {
    nights.push({ title: "AJ's Trivia Night", startDate: '2026-11-18T08:00:00Z', timezone: 'Australia/Melbourne', venueName: 'Aunty Jacks', isFree: true })
    const db = fakeDb([{ id: 'old-aj', contact_id: 'contact-aj', key: 'twenty_advice', version: 1 }])
    const out = await draftTheTwenty(db as never, { now: NOW, origin: 'https://www.eventlinqs.com.au/' })
    expect(voided).toEqual(['old-aj'])
    expect(drafted).toHaveLength(1)
    expect(drafted[0]).toMatchObject({ contactId: 'contact-aj', templateKey: 'twenty_advice', step: 1 })
    expect(JSON.stringify(drafted[0].extraFields)).toContain('https://www.eventlinqs.com.au/photos/contact-aj/')
    expect(out).toMatchObject({ state: 'drafted', redrafted: 1, drafted: 1 })
  })

  it('is set aside, not redrafted, when no night of theirs is ahead to name', async () => {
    const db = fakeDb([{ id: 'old-aj', contact_id: 'contact-aj', key: 'twenty_advice', version: 1 }])
    const out = await draftTheTwenty(db as never, { now: NOW, origin: 'https://www.eventlinqs.com.au' })
    expect(voided).toEqual(['old-aj'])
    expect(drafted).toEqual([])
    expect(out).toMatchObject({ state: 'drafted', redrafted: 0, setAside: 1 })
  })

  it('a draft already on the current version is left alone', async () => {
    nights.push({ title: "AJ's Trivia Night", startDate: '2026-11-18T08:00:00Z', timezone: 'Australia/Melbourne', venueName: 'Aunty Jacks', isFree: true })
    const db = fakeDb([{ id: 'new-aj', contact_id: 'contact-aj', key: 'twenty_advice', version: 2 }])
    await draftTheTwenty(db as never, { now: NOW, origin: 'https://www.eventlinqs.com.au' })
    expect(voided).toEqual([])
    expect(drafted).toEqual([])
  })
})
