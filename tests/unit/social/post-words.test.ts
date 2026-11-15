import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine, type CtaInput } from '@/lib/events/cta'
import { coverLine, nightKind, nightWords, postAction, postTitle, selectAcrossDays, HUNT_SUMMARY_LINE, type CampaignNight } from '@/lib/social/campaign'
import { huntSummary } from '@/lib/listings/headline-hunt'

/*
 * A POST'S WORDS (the PM's 15:45 of 15 November 2026, after the first week was drawn from production's rows and scored
 * beside Time Out Melbourne's, Broadsheet's and Concrete Playground's weekly lists): a source's raw title is cleaned, the
 * headline hunt's composed line is never quoted, the pill is one call to our own page, a weekend post holds every day of
 * the weekend, and a cover names each night's venue and time.
 */

let seq = 0
function night(over: Partial<CampaignNight> & { at: string; state?: CtaInput }): CampaignNight {
  seq += 1
  const cta = ctaFor(over.state ?? { tiers: [{ price: 2500 }] })
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `pw-night-${seq}`,
    title: `Pw Night ${seq}`,
    startDate: over.at,
    timezone: 'Australia/Melbourne',
    citySlug: 'melbourne',
    cityName: 'Melbourne',
    venueName: `Room ${seq}`,
    host: `Host ${seq}`,
    categorySlug: `music-${seq}`,
    summary: null,
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $25' }),
    ...over,
  }
}

describe("a post's title (fix 2)", () => {
  it('takes a room glued on with a dash off', () => {
    expect(postTitle('Transients: Davis/Magnusson/Keller- JL Room', 'Jazzlab')).toBe('Transients: Davis/Magnusson/Keller')
    expect(postTitle('Darcy Gilkerson Quintet- JL Room', 'Jazzlab')).toBe('Darcy Gilkerson Quintet')
  })
  it('takes the venue off when the title ends with it', () => {
    expect(postTitle('Saturday Live - Hop Temple', 'Hop Temple')).toBe('Saturday Live')
  })
  it('keeps the main name of a title in parts: the first part, a colon, the second; never a spaced dash', () => {
    const t = postTitle('Timor-Leste - Ita Nia Lian, Ita Nia Istoria - Our Voices, Our Stories', 'Melbourne Recital Centre')
    expect(t).toBe('Timor-Leste: Ita Nia Lian, Ita Nia Istoria')
    expect(t).not.toMatch(/\s[-–—]\s/)
  })
  it('leaves a clean title and a hyphenated word alone', () => {
    expect(postTitle('Two Door Cinema Club', 'John Cain Arena')).toBe('Two Door Cinema Club')
    expect(postTitle('Timor-Leste Night', 'Fed Square')).toBe('Timor-Leste Night')
  })
})

describe('the hunt\'s composed line is never quoted on a post (fix 4)', () => {
  it('matches every line the hunt writes', () => {
    for (const [categorySlug, startsAt, seller, free] of [
      [null, '2026-11-16T09:00:00Z', 'Melbourne Recital Centre', false],
      ['music', '2026-11-18T22:15:00Z', null, true],
      ['comedy', '2026-11-20T03:00:00Z', 'Oztix', false],
    ] as const) {
      expect(huntSummary({ categorySlug, startsAt, seller, free })).toMatch(HUNT_SUMMARY_LINE)
    }
  })
  it('leaves a real summary to be quoted', () => {
    expect('A gentle two-hour evening for women, with movement and breathwork.').not.toMatch(HUNT_SUMMARY_LINE)
  })
})

describe('one call on the pill, our page (fix 5)', () => {
  it('names one address, ours, and never says EventLinqs sells what another site sells', () => {
    expect(postAction(night({ at: '2026-11-20T09:00:00Z', state: { externalTicketUrl: 'https://www.axs.com/x', providerName: 'AXS' } }))).toBe('Times and tickets at eventlinqs.com.au')
    expect(postAction(night({ at: '2026-11-20T09:00:00Z', state: { tiers: [{ price: 2500 }] } }))).toBe('Tickets at eventlinqs.com.au')
    expect(postAction(night({ at: '2026-11-20T09:00:00Z', state: { entryMode: 'walk_in', isFree: true } }))).toBe('Times and details at eventlinqs.com.au')
    expect(nightWords(night({ at: '2026-11-20T09:00:00Z', state: { externalTicketUrl: 'https://www.axs.com/x', providerName: 'AXS' } })).action).not.toMatch(/axs/i)
  })
})

describe('a weekend post holds every day of the weekend (fix 3)', () => {
  it('takes the best night of each day before a fifth Friday', () => {
    const fridays = Array.from({ length: 6 }, (_, i) => ({ n: night({ at: `2026-11-20T0${i}:00:00Z` }), day: 4 }))
    const saturday = { n: night({ at: '2026-11-21T09:00:00Z' }), day: 5 }
    const sunday = { n: night({ at: '2026-11-22T05:00:00Z' }), day: 6 }
    const { nights } = selectAcrossDays([...fridays, saturday, sunday], [4, 5, 6], 5)
    expect(nights).toHaveLength(5)
    expect(nights.map((n) => n.eventId)).toEqual(expect.arrayContaining([saturday.n.eventId, sunday.n.eventId]))
  })
})

describe("a cover's line names the venue and the time (fix 1)", () => {
  it('puts them on a line of their own under the title', () => {
    expect(coverLine('FRI', night({ at: '2026-11-20T08:30:00Z', title: 'Two Door Cinema Club', venueName: 'John Cain Arena' }))).toBe('FRI Two Door Cinema Club\nJohn Cain Arena · 7.30pm')
  })
})

describe("a night's kind from its own words, never its category alone (the PM's 16:40 fix 1)", () => {
  const mrc = { venueName: 'Melbourne Recital Centre', host: 'Melbourne Recital Centre', categorySlug: 'music' }
  it("never takes a historian's talk, an art song recital or a stories evening for a gig", () => {
    const talk = night({ at: '2026-11-16T08:30:00Z', title: 'An Evening with Ben Macintyre', ...mrc })
    const recital = night({ at: '2026-11-18T08:30:00Z', title: 'Anne Sofie von Otter & Kristian Bezuidenhout', summary: 'An art song recital with piano.', ...mrc })
    const stories = night({ at: '2026-11-20T08:30:00Z', title: 'Timor-Leste: Ita Nia Lian, Ita Nia Istoria', sourceTitle: 'Timor-Leste - Ita Nia Lian, Ita Nia Istoria - Our Voices, Our Stories', ...mrc })
    expect(nightKind(talk)).toBe('talk')
    expect(nightKind(recital)).toBe('classical')
    expect(nightKind(stories)).toBe('talk')
    expect(nightWords(talk).eyebrow).toBe('At Melbourne Recital Centre')
    expect(nightWords(stories).eyebrow).toBe('At Melbourne Recital Centre')
  })
  it('names a gig only where its words say so', () => {
    expect(nightKind(night({ at: '2026-11-20T09:00:00Z', title: 'Locals Live 2', summary: 'Three local bands on the front bar stage.' }))).toBe('gig')
    expect(nightKind(night({ at: '2026-11-20T09:00:00Z', title: 'Locals Live 2', summary: null }))).toBeNull()
  })
})
