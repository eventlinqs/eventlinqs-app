import { beforeEach, describe, expect, it, vi } from 'vitest'

const drafted: Array<Record<string, unknown>> = []
vi.mock('@/lib/outreach/drafts', () => ({
  draftFromTemplate: vi.fn(async (_db: unknown, r: Record<string, unknown>) => {
    drafted.push(r)
    return { state: 'done', value: { id: 'new', state: 'held', heldBecause: [] } }
  }),
}))
vi.mock('@/lib/growth/platform-organiser', () => ({ readPlatformOrganiserIds: vi.fn(async () => new Set<string>()) }))
const nights: Array<Record<string, unknown>> = []
vi.mock('@/lib/outreach/their-nights', () => ({ readTheirNights: vi.fn(async () => nights) }))
let viewers = 0
vi.mock('@/lib/growth/organiser-report', () => ({ readNightViewers: vi.fn(async () => viewers) }))

import { draftDay4FollowUps } from '@/lib/outreach/follow-ups'
import { nightLine, seenWords, TWENTY_DAY4 } from '@/lib/outreach/follow-up-letters'

/*
 * THE TWENTY'S DAY 4 LETTER (the PM's 19:12 of 12 November 2026): the night's own page, its real view count only above
 * zero, their photo link, in the first letter's thread, signed as Lawal replies; drafted held from the fourth Melbourne day
 * after the first letter was sent, once.
 */
describe('the words', () => {
  it('says how many opened the page only when the ledger holds a number above zero', () => {
    expect(seenWords(0)).toBe('')
    expect(seenWords(-2)).toBe('')
    expect(seenWords(1)).toBe(', and one person has opened its page so far')
    expect(seenWords(14)).toBe(', and 14 people have opened its page so far')
  })

  it("names the night by its own title, day and page", () => {
    expect(
      nightLine({ title: "AJ's Trivia Night", startDate: '2026-11-18T08:00:00Z', timezone: 'Australia/Melbourne', slug: 'aj-s-trivia-night-aunty-jacks-2026-11-18', viewers: 0, origin: 'https://www.eventlinqs.com.au/' }),
    ).toBe("AJ's Trivia Night on Wednesday 18 November is listed on EventLinqs: https://www.eventlinqs.com.au/events/aj-s-trivia-night-aunty-jacks-2026-11-18")
  })

  it('keeps the thread, the warm line, the reply signature without the ABN, the opt out, and no banned punctuation', () => {
    expect(TWENTY_DAY4.subject).toBe('Re: [thread subject]')
    const lines = TWENTY_DAY4.body.split('\n')
    expect(lines[0]).toBe('Hi [greeting],')
    expect(lines[1].startsWith("I hope you're well.")).toBe(true)
    expect(lines.slice(lines.indexOf('Kind regards,') + 1, lines.indexOf('Kind regards,') + 3)).toEqual(['Lawal Adams', 'Founder, EventLinqs'])
    expect(TWENTY_DAY4.body).not.toContain('ABN')
    expect(lines.at(-1)).toBe('[unsubscribe]')
    expect(TWENTY_DAY4.body + TWENTY_DAY4.subject).not.toMatch(/[\u2013\u2014!]/)
    expect(TWENTY_DAY4.body).not.toMatch(/no pressure|if the timing|won't write again/i)
  })
})

function fakeDb(firsts: Array<{ id: string; contact_id: string; subject: string; sent_at: string }>, seconds: string[] = []) {
  const rows: Record<string, unknown> = {
    organiser_contacts: { organiser_id: 'org-aj', person_name: null, unsubscribe_token: 'tok-aj' },
    organisers: { id: 'org-aj', name: 'Aunty Jacks', organisation_id: null, website_url: null },
  }
  return {
    from(table: string) {
      let selected = ''
      const q: Record<string, unknown> = {}
      const chain = (..._a: unknown[]) => q
      Object.assign(q, {
        select: (s: string) => {
          selected = s
          return q
        },
        eq: chain,
        neq: chain,
        in: chain,
        order: chain,
        is: chain,
        limit: (..._a: unknown[]) => (table === 'admin_users' ? Promise.resolve({ data: [{ id: 'founder-1' }], error: null }) : q),
        maybeSingle: async () => ({ data: { ...TWENTY_DAY4, version: 1 }, error: null }),
        single: async () => ({ data: rows[table], error: null }),
        insert: async () => ({ error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          resolve({
            data:
              table !== 'outreach_touches'
                ? []
                : selected.includes('outreach_templates')
                  ? firsts.map((f) => ({ ...f, outreach_templates: { key: 'twenty_advice' } }))
                  : seconds.map((c) => ({ contact_id: c })),
            error: null,
          }),
      })
      return q
    },
  }
}

describe('the day 4 drafter', () => {
  beforeEach(() => {
    drafted.length = 0
    nights.length = 0
    viewers = 0
    nights.push({ eventId: 'ev-1', slug: 'aj-s-trivia-night-aunty-jacks-2026-11-25', title: "AJ's Trivia Night", startDate: '2026-11-25T08:00:00Z', timezone: 'Australia/Melbourne', venueName: 'Aunty Jacks', isFree: true })
  })
  const first = { id: 't1', contact_id: 'contact-aj', subject: "AJ's Trivia Night, could I ask your advice?", sent_at: '2026-11-13T01:00:00Z' }

  it('drafts nothing before the fourth Melbourne day', async () => {
    const out = await draftDay4FollowUps(fakeDb([first]) as never, { now: new Date('2026-11-16T01:00:00Z'), origin: 'https://www.eventlinqs.com.au' })
    expect(drafted).toEqual([])
    expect(out).toMatchObject({ state: 'drafted', notYetDue: 1, drafted: 0 })
  })

  it('on day 4 drafts step 2 held, in the thread, with the page, the count above zero and the photo link', async () => {
    viewers = 3
    const out = await draftDay4FollowUps(fakeDb([first]) as never, { now: new Date('2026-11-17T01:00:00Z'), origin: 'https://www.eventlinqs.com.au' })
    expect(out).toMatchObject({ state: 'drafted', drafted: 1 })
    expect(drafted[0]).toMatchObject({ contactId: 'contact-aj', templateKey: 'twenty_day4', purpose: 'cadence', step: 2 })
    const f = drafted[0].extraFields as Record<string, string>
    expect(f['thread subject']).toBe("AJ's Trivia Night, could I ask your advice?")
    expect(f['night line']).toContain(', and 3 people have opened its page so far: https://www.eventlinqs.com.au/events/aj-s-trivia-night-aunty-jacks-2026-11-25')
    expect(f['photo link']).toContain('https://www.eventlinqs.com.au/photos/contact-aj/')
    expect(f.greeting).toBe('Aunty Jacks team')
  })

  it('never drafts a second day 4 letter, and names an organiser with no night ahead', async () => {
    await draftDay4FollowUps(fakeDb([first], ['contact-aj']) as never, { now: new Date('2026-11-20T01:00:00Z'), origin: 'https://www.eventlinqs.com.au' })
    expect(drafted).toEqual([])
    nights.length = 0
    const out = await draftDay4FollowUps(fakeDb([first]) as never, { now: new Date('2026-11-20T01:00:00Z'), origin: 'https://www.eventlinqs.com.au' })
    expect(drafted).toEqual([])
    expect(out).toMatchObject({ skipped: [{ contactId: 'contact-aj', why: 'no public night of theirs ahead to name' }] })
  })
})
