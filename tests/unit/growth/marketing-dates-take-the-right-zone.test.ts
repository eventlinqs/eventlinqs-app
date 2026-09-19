import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * EVERY DATE A PERSON READS ON THE MARKETING, MATCHING AND PRICING SURFACES IS
 * THE AUSTRALIAN ONE, AND AN EVENT'S IS THE EVENT'S OWN.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT, measured on this tree on 19 September 2026.
 *
 * src/lib/consent/sentences.ts was fixed the day before for rendering the
 * consent ledger from UTC getters. The guard written with it reads three
 * getters and the locale formatters, and it could not see the COMMONEST way to
 * render a UTC date at all: slicing the first ten characters off an ISO string.
 * Four live renderings in lane B's own slice did exactly that, and the guard
 * printed OK over all four.
 *
 *   src/app/admin/(authed)/matches/page.tsx       the matcher run's own date,
 *                                                 under "How the score is
 *                                                 worked out"
 *   src/app/admin/(authed)/matches/match-run-form the event picker's label
 *   src/app/admin/(authed)/pricing/targets/route  the event date beside every
 *                                                 result in the fee-override
 *                                                 target picker
 *   src/lib/consent/decide.ts, twice              the consent door's own
 *                                                 evidence sentences, stored as
 *                                                 the detail of every
 *                                                 marketing_send_skip row
 *
 * ---------------------------------------------------------------------------
 * TWO DIFFERENT RULES, AND THE TESTS BELOW HOLD THEM APART ON PURPOSE.
 *
 * A CONSENT EVENT HAS NO EVENT BEHIND IT, so it takes PLATFORM_TIME_ZONE. The
 * failing window is the one LB-LEDGERDATE measured: every instant after 10:00
 * local rendered a day early, which is fourteen hours of every day and all of
 * the evening.
 *
 * AN EVENT'S DATE TAKES THE EVENT'S OWN ZONE (src/lib/dates/event-time.ts). The
 * stored instant is the local start minus that zone's offset, so the UTC date is
 * a day early for every event starting before its own offset: before 10 am in
 * Sydney, before 8 am in Perth. That is every matinee, market, brunch and
 * family show on the platform.
 *
 * WHY PERTH IS IN HERE. 2026-03-15T13:30:00Z is 16 March in Sydney and 15 March
 * in Perth. A "fix" that swapped UTC for the PLATFORM zone would pass every
 * Sydney assertion and still put the wrong night in the picker for a Perth
 * event, so the Perth rows are what make these tests judge the RIGHT fix rather
 * than merely a different one.
 *
 * NONE OF THIS DEPENDS ON THE CLOCK. Every instant is chosen and every
 * expectation is computed independently below, so the suite decides the same
 * way at 7 am and at 11 pm. The original defect was found at 07:20 by luck.
 */

import { decideSend } from '@/lib/consent/decide'
import { FACILITATED_MARKETING_PURPOSE, PLATFORM_TENANT_SLUG } from '@/lib/consent/purposes'

/** The four instants, and what each one is for. */
const AEST_EVENING = '2026-09-18T21:20:02Z' // Sydney 19 September 2026, UTC the 18th
const AEDT_EVENING = '2026-03-15T13:30:00Z' // Sydney 16 March 2026, Perth the 15th.
// 13:30Z is chosen rather than any AEDT instant: eastern daylight time is UTC+11, so a
// plausible wrong fix that adds a FIXED ten hours lands on 15 March here and is caught.
const YEAR_ROLLOVER = '2026-12-31T13:05:00Z' // Sydney 1 January 2027, UTC 31 December
const BOTH_AGREE = '2026-09-19T01:00:00Z' // 19 September either way: the control

/**
 * The expectation, computed here rather than taken from the code under test. If
 * this file and src/lib/dates/event-time.ts ever disagree about what "short"
 * means, the test says so instead of agreeing with whatever shipped.
 */
function expected(iso: string, zone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-AU', { ...options, timeZone: zone }).format(new Date(iso))
}
const platformDate = (iso: string) =>
  expected(iso, 'Australia/Sydney', { day: 'numeric', month: 'short', year: 'numeric' })
const eventDate = (iso: string, zone: string) =>
  expected(iso, zone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

const grant = (occurredAt: string) => ({
  id: `grant-${occurredAt}`,
  tenantSlug: PLATFORM_TENANT_SLUG,
  purpose: FACILITATED_MARKETING_PURPOSE,
  channelScope: 'both' as const,
  decision: 'granted' as const,
  occurredAt,
  wordingVersion: 'facilitated-v1',
})

const question = (now: Date) => ({
  tenantSlug: PLATFORM_TENANT_SLUG,
  purpose: FACILITATED_MARKETING_PURPOSE,
  channel: 'email' as const,
  now,
  maxAgeMonths: 24,
})

const ASKED_AT = new Date('2026-09-19T02:00:00Z')

describe('the consent door names the Australian date of the event it decided on', () => {
  for (const iso of [AEST_EVENING, AEDT_EVENING, YEAR_ROLLOVER, BOTH_AGREE]) {
    it(`a grant recorded at ${iso} is quoted as ${platformDate(iso)}`, () => {
      const verdict = decideSend(question(ASKED_AT), [grant(iso)], [])
      expect(verdict.permitted).toBe(true)
      expect(verdict.reason).toContain(`granted on ${platformDate(iso)}`)
    })

    if (iso !== BOTH_AGREE) {
      it(`a grant recorded at ${iso} never quotes the UTC calendar date`, () => {
        const verdict = decideSend(question(ASKED_AT), [grant(iso)], [])
        // The whole defect in one assertion: the first ten characters of an ISO
        // string are the UTC date, and no surface may print them as the date.
        expect(verdict.reason).not.toContain(iso.slice(0, 10))
      })
    }
  }

  it('the control instant is the same day either way, so a fix that shifts every date by one fails here', () => {
    const verdict = decideSend(question(ASKED_AT), [grant(BOTH_AGREE)], [])
    expect(verdict.reason).toContain('19 Sept 2026')
  })

  it('a suppression sentence names the Australian date it was recorded on', () => {
    const verdict = decideSend(
      question(ASKED_AT),
      [grant('2026-09-01T00:00:00Z')],
      [
        {
          id: 'sup-1',
          tenantSlug: PLATFORM_TENANT_SLUG,
          channel: 'both',
          scope: 'all_marketing',
          occurredAt: AEST_EVENING,
        },
      ],
    )
    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toContain(`recorded on ${platformDate(AEST_EVENING)}`)
    expect(verdict.reason).not.toContain(AEST_EVENING.slice(0, 10))
  })
})

/* --------------------------------------------------------------------------
 * The fee-override target picker. A route handler, driven through its own GET
 * with a stubbed service-role client, because the string under test is composed
 * on the server and handed to the picker as `sub`.
 * ------------------------------------------------------------------------ */

const datasets: Record<string, unknown[]> = {}

function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'limit', 'or', 'ilike', 'eq']) b[m] = () => b
  ;(b as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve({ data: datasets[table] ?? [], error: null })
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}))
vi.mock('@/lib/admin/auth', () => ({
  getAdminSession: async () => ({ userId: 'admin-1', roles: ['founder'] }),
}))
vi.mock('@/lib/admin/rbac', () => ({ can: () => true }))

import { GET } from '@/app/admin/(authed)/pricing/targets/route'

beforeEach(() => {
  for (const k of Object.keys(datasets)) delete datasets[k]
})

async function pickerResults(rows: unknown[]): Promise<{ label: string; sub: string }[]> {
  datasets.events = rows
  const response = await GET(new Request('https://el.test/admin/pricing/targets?kind=event&q=night'))
  const json = (await response.json()) as { results: { label: string; sub: string }[] }
  return json.results
}

const eventRow = (id: string, title: string, startDate: string | null, timezone: string) => ({
  id,
  title,
  slug: id,
  start_date: startDate,
  timezone,
  organisations: { name: 'Lane B Presents' },
})

describe('the fee-override picker dates every event in that event own zone', () => {
  it('a Sydney evening show keeps its Sydney date, not the UTC one', async () => {
    const [result] = await pickerResults([
      eventRow('lane-b-warehouse-night', 'Lane B warehouse night', AEST_EVENING, 'Australia/Sydney'),
    ])
    expect(result.sub).toContain(eventDate(AEST_EVENING, 'Australia/Sydney'))
    expect(result.sub).not.toContain(AEST_EVENING.slice(0, 10))
  })

  it('the same instant is a DIFFERENT day in Perth, and the picker says so', async () => {
    const results = await pickerResults([
      eventRow('lane-b-sundown-syd', 'Lane B sundown', AEDT_EVENING, 'Australia/Sydney'),
      eventRow('lane-b-sundown-per', 'Lane B sundown', AEDT_EVENING, 'Australia/Perth'),
    ])
    // Two events, one title, one instant, two nights. The date is the ONLY thing
    // separating them in the picker, which is why it has to be the event's own
    // and not the platform's.
    expect(results[0].sub).toContain(eventDate(AEDT_EVENING, 'Australia/Sydney'))
    expect(results[1].sub).toContain(eventDate(AEDT_EVENING, 'Australia/Perth'))
    expect(results[0].sub).not.toBe(results[1].sub)
  })

  it('a year rollover moves the year, not only the day', async () => {
    const [result] = await pickerResults([
      eventRow('lane-b-new-year', 'Lane B new year', YEAR_ROLLOVER, 'Australia/Sydney'),
    ])
    expect(result.sub).toContain('2027')
    expect(result.sub).not.toContain('2026')
  })

  it('the control instant reads the same day either way', async () => {
    const [result] = await pickerResults([
      eventRow('lane-b-control', 'Lane B control', BOTH_AGREE, 'Australia/Sydney'),
    ])
    expect(result.sub).toContain(eventDate(BOTH_AGREE, 'Australia/Sydney'))
    expect(result.sub).toContain('19 Sept 2026')
  })

  it('an event with no start date returns its organiser alone, with no stray separator', async () => {
    const [result] = await pickerResults([
      eventRow('lane-b-unscheduled', 'Lane B unscheduled', null, 'Australia/Sydney'),
    ])
    expect(result.sub).toBe('Lane B Presents')
  })
})
