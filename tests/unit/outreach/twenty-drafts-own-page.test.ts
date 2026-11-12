import { beforeEach, describe, expect, it, vi } from 'vitest'

const drafted: Array<Record<string, unknown>> = []
const day = { groups: [] as Array<Record<string, unknown>> }
vi.mock('@/lib/outreach/daily-twenty-read', () => ({ readDailyTwenty: vi.fn(async () => day) }))
vi.mock('@/lib/growth/platform-organiser', () => ({ readPlatformOrganiserIds: vi.fn(async () => new Set<string>()) }))
vi.mock('@/lib/outreach/crm', () => ({ voidTouch: vi.fn(async () => ({ state: 'done' })) }))
vi.mock('@/lib/outreach/drafts', () => ({
  draftFromTemplate: vi.fn(async (_db: unknown, r: Record<string, unknown>) => {
    drafted.push(r)
    return { state: 'done', value: { heldBecause: [] } }
  }),
}))
const nights: Array<Record<string, unknown>> = []
vi.mock('@/lib/outreach/their-nights', () => ({ readTheirNights: vi.fn(async () => nights) }))

import { draftTheTwenty, nextPageEventOf, PAGE_EVENT_FRESH_DAYS } from '@/lib/outreach/twenty-drafts'
import { TWENTY_LETTERS, TWENTY_OWN_PAGE } from '@/lib/outreach/twenty-letters'

/*
 * THEIR OWN NEXT EVENT, READ FROM THEIR OWN PAGE (Lawal, 13 November 2026, 06:50, ruling 1: "THE TRUE LINE may name the
 * organiser's own upcoming event as read from their own published page (the page URL and the date read recorded on the
 * draft, like the basis), when they have no night on EventLinqs. Never invented; never a past event as upcoming").
 */

type PageRow = { title: string; starts_on: string; place: string | null; page_url: string; read_on: string }

/** A small PostgREST stand-in: the page events filtered by the drafter's own eq and gte, oldest start first. */
function fakeDb(pageRows: PageRow[]) {
  const asked: Array<{ table: string; filters: string[] }> = []
  const rows: Record<string, unknown> = {
    admin_users: [{ id: 'founder-1' }],
    organiser_contacts: { organiser_id: 'org-nsc', person_name: null, unsubscribe_token: 'tok-nsc' },
    organisers: { id: 'org-nsc', name: 'Northcote Social Club', organisation_id: null, website_url: 'https://northcotesocialclub.com' },
  }
  return {
    asked,
    from(table: string) {
      let key = ''
      const filters: string[] = []
      const tests: Array<(r: PageRow) => boolean> = []
      asked.push({ table, filters })
      const q: Record<string, unknown> = {}
      const chain = (..._a: unknown[]) => q
      Object.assign(q, {
        select: chain,
        in: chain,
        order: chain,
        is: chain,
        neq: chain,
        gte: (col: string, val: string) => {
          filters.push(`gte ${col} ${val}`)
          tests.push((r) => String((r as Record<string, unknown>)[col]) >= val)
          return q
        },
        eq: (col: string, val: unknown) => {
          if (col === 'key') key = String(val)
          filters.push(`eq ${col}`)
          return q
        },
        limit: (..._a: unknown[]) => (table === 'admin_users' ? Promise.resolve({ data: rows.admin_users, error: null }) : q),
        maybeSingle: async () => {
          if (table === 'organiser_page_events') {
            const hit = pageRows.filter((r) => tests.every((t) => t(r))).sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0]
            return { data: hit ?? null, error: null }
          }
          const letter = TWENTY_LETTERS.find((l) => l.key === key)
          return { data: letter ? { ...letter, version: 1 } : null, error: null }
        },
        single: async () => ({ data: rows[table], error: null }),
        insert: async () => ({ error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
      })
      return q
    },
  }
}

const NOW = new Date('2026-11-13T00:00:00Z') // 11:00 on 13 November in Melbourne
const PAGE = 'https://northcotesocialclub.com/gig-guide'
const read = (over: Partial<PageRow> = {}): PageRow => ({ title: 'Sample Night', starts_on: '2026-12-05', place: 'Northcote Social Club', page_url: PAGE, read_on: '2026-11-13', ...over })

describe("their own next event, read from their own page", () => {
  beforeEach(() => {
    drafted.length = 0
    nights.length = 0
    day.groups = [{ key: 'first_contact', actions: [{ channel: 'email', contactId: 'contact-nsc', organiserId: 'org-nsc', organiserName: 'Northcote Social Club' }] }]
  })

  it('with no night on EventLinqs, the advice letter names it, and the page and date are kept on the draft', async () => {
    const db = fakeDb([read()])
    const out = await draftTheTwenty(db as never, { now: NOW, origin: 'https://www.eventlinqs.com.au' })
    expect(drafted).toHaveLength(1)
    expect(drafted[0]).toMatchObject({ contactId: 'contact-nsc', templateKey: TWENTY_OWN_PAGE.key, lineSource: { url: PAGE, readOn: '2026-11-13' } })
    const fields = drafted[0].extraFields as Record<string, string | null>
    expect(fields.event).toBe('Sample Night')
    expect(fields['event day']).toBe('Saturday 5 December')
    expect(fields['event place']).toBe('Northcote Social Club')
    expect(fields['photo link']).toContain('/photos/contact-nsc/')
    expect(out).toMatchObject({ state: 'drafted', drafted: 1 })
  })

  it('a night listed on EventLinqs comes first: the listed letter, and no page read is asked for', async () => {
    nights.push({ title: 'Listed Night', startDate: '2026-11-20T09:00:00Z', timezone: 'Australia/Melbourne', venueName: 'Northcote Social Club', isFree: true })
    const db = fakeDb([read()])
    await draftTheTwenty(db as never, { now: NOW, origin: 'https://www.eventlinqs.com.au' })
    expect(drafted[0]).toMatchObject({ templateKey: 'twenty_advice', lineSource: null })
    expect(db.asked.some((a) => a.table === 'organiser_page_events')).toBe(false)
  })

  it('nothing recorded, nothing drafted: never invented', async () => {
    const out = await draftTheTwenty(fakeDb([]) as never, { now: NOW, origin: 'https://www.eventlinqs.com.au' })
    expect(drafted).toEqual([])
    expect(out).toMatchObject({ state: 'drafted', drafted: 0 })
  })

  it('never a past event, and never a read older than its window', async () => {
    const db = fakeDb([read({ starts_on: '2026-11-12' }), read({ title: 'Old Read', read_on: '2026-10-01' })])
    expect(await nextPageEventOf(db as never, 'org-nsc', NOW)).toBeNull()
    expect(PAGE_EVENT_FRESH_DAYS).toBe(30)
  })

  it('today counts as ahead (a Melbourne date), and the soonest is named', async () => {
    const db = fakeDb([read({ title: 'Later', starts_on: '2026-12-20' }), read({ title: 'Tonight', starts_on: '2026-11-13' })])
    const e = await nextPageEventOf(db as never, 'org-nsc', NOW)
    expect(e).toMatchObject({ title: 'Tonight', startDate: '2026-11-13', pageUrl: PAGE, readOn: '2026-11-13', timezone: 'Australia/Melbourne' })
  })
})

describe('the own page letter', () => {
  it('is the advice letter word for word, save the one line, which says where it was read and never that it is listed', () => {
    const advice = TWENTY_LETTERS.find((l) => l.key === 'twenty_advice')!
    const own = TWENTY_OWN_PAGE.body.split('\n')
    const listed = advice.body.split('\n')
    expect(own[1]).toBe("I hope you're well. I saw [event] on [event day] at [event place] on your website. You can add your own photos to EventLinqs here, and choose where they're used: [photo link]")
    expect(own[1]).not.toMatch(/listed on EventLinqs/)
    expect(own.filter((_, i) => i !== 1)).toEqual(listed.filter((_, i) => i !== 1))
    expect(TWENTY_OWN_PAGE.subject).toBe(advice.subject)
  })
})
