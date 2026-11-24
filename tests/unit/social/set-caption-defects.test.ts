import { PLAYBOOK } from '@/lib/social/playbook'
import { describe, expect, it } from 'vitest'
import { ctaFor } from '@/lib/events/cta'
import { approvedSetNamed, type ApprovedSet } from '@/lib/social/approved-sets'
import { listCaptions, planApprovedSet, rowLine, type CampaignNight, type PiecePlan } from '@/lib/social/campaign'

/*
 * THE FOUR CAPTION DEFECTS THE PM READ ON PRODUCTION (the PM's intake read of 23 November 2026, 22:15, on Kyivska 23f34b07
 * and live music 8d252108), each red on main:
 *   (a) Kyivska, a theatre show, carried '🎶': the emoji came from its words (live music), not its own category;
 *   (b) a one-night set said its title twice and its date twice;
 *   (c) a list on one day said 'From Choir 3006 In Concert on Friday to Michelle Nicolle & David McEvoy on Friday.';
 *   (d) rows under '📅 Friday 27 November' each said 'Fri 27 Nov' again.
 */

const ORIGIN = 'https://www.eventlinqs.com.au'
const ticketed = ctaFor({ tiers: [{ price: 55, is_active: true }] })
const night = (over: Partial<CampaignNight>): CampaignNight => ({
  eventId: 'x', slug: 'x', title: 'x', startDate: '2026-12-05T07:30:00.000Z', endDate: '2026-12-05T09:30:00.000Z', timezone: 'Australia/Melbourne',
  citySlug: 'melbourne', cityName: 'Melbourne', venueName: 'The Wheeler Centre', placeName: 'The Wheeler Centre', host: 'The Wheeler Centre',
  categorySlug: null, summary: null, approvedPhotoUrl: null, photoCredit: null, cta: ticketed, priceLine: 'From $55', ...over,
})

// Kyivska as production holds it: its title, its words naming live music, filed under theatre.
const KYIVSKA = night({
  eventId: 'a6778756-b6f0-4997-8f1a-8d6c2aaa0bbe', slug: 'kyivska-perepichka', title: 'Kyivska Perepichka: Ukrainian Theatre in Melbourne', categorySlug: 'theatre',
  summary: 'An interactive solo theatre show by Irma Vitovska-Vantsa, in Ukrainian with English subtitles. Wine, live music and perepichka.',
})
// The live music Friday, its five nights at their own times and venues.
const MUSIC: CampaignNight[] = [
  night({ eventId: '922537f7-cda5-4a9f-b33d-591c4b3fe983', slug: 'choir', title: 'Choir 3006 In Concert', startDate: '2026-11-27T07:00:00.000Z', endDate: '2026-11-27T08:30:00.000Z', venueName: 'Melbourne Recital Centre', placeName: 'Melbourne Recital Centre', categorySlug: 'music' }),
  night({ eventId: 'd8c93296-4adf-4c7a-97d1-0db8f2191782', slug: 'ross-7', title: 'Joel Ross (NYC)', startDate: '2026-11-27T08:00:00.000Z', endDate: '2026-11-27T09:30:00.000Z', venueName: 'The JazzLab', placeName: 'The JazzLab', categorySlug: 'music' }),
  night({ eventId: 'ed17c309-64e7-4107-a949-fbeae77872fa', slug: 'ross-930', title: 'Joel Ross (NYC)', startDate: '2026-11-27T10:30:00.000Z', endDate: '2026-11-27T12:00:00.000Z', venueName: 'The JazzLab', placeName: 'The JazzLab', categorySlug: 'music' }),
  night({ eventId: 'd5fa4ea4-6f8b-4c88-93ef-e3ecfc651adc', slug: 'jones', title: 'Jack Jones: Hits & Stories', startDate: '2026-11-27T08:30:00.000Z', endDate: '2026-11-27T10:00:00.000Z', venueName: "Bird's Basement", placeName: "Bird's Basement", categorySlug: 'music' }),
  night({ eventId: 'e0fd99c3-4607-48ab-987a-b2a3d4ccc5c3', slug: 'nicolle', title: 'Michelle Nicolle & David McEvoy', startDate: '2026-11-27T09:30:00.000Z', endDate: '2026-11-27T11:00:00.000Z', venueName: 'Melbourne Recital Centre', placeName: 'Melbourne Recital Centre', categorySlug: 'music' }),
]

function planned(name: string, nights: readonly CampaignNight[]): PiecePlan {
  const p = planApprovedSet(approvedSetNamed(name) as ApprovedSet, nights, ORIGIN)
  if ('refused' in p) throw new Error(p.refused)
  return p.plan
}

describe("the PM's four caption returns of 22:15, as the engine now writes them", () => {
  const kyivska = planned('kyivska-perepichka', [KYIVSKA])
  const music = planned('live-music', MUSIC)

  it('(a) a theatre night takes the theatre mask, from its own category, never the music note its words suggest', () => {
    const hook = kyivska.versions.instagram.caption.split('\n')[0]
    expect(hook.startsWith('\u{1F3AD} ')).toBe(true)
    expect(kyivska.versions.instagram.caption).not.toContain('\u{1F3B6}')
  })

  it('(b) a one-night set says its title once and its date once, from its own record', () => {
    for (const caption of [kyivska.versions.instagram.caption, kyivska.versions.facebook.caption]) {
      expect(caption.split('Kyivska Perepichka: Ukrainian Theatre in Melbourne').length - 1).toBe(1)
      expect(caption.match(/\b(5 December|5 Dec)\b/g)?.length).toBe(1)
      expect(caption).toContain('\u{1F4C5} Saturday 5 December, 6:30pm to 8:30pm\n')
    }
    expect(kyivska.versions.instagram.caption.split('\n').slice(0, 3)).toEqual([
      '\u{1F3AD} Kyivska Perepichka: Ukrainian Theatre in Melbourne.',
      '\u{1F4C5} Saturday 5 December, 6:30pm to 8:30pm',
      '\u{1F4CD} The Wheeler Centre, Melbourne',
    ])
  })

  it("(c) a list on one day never runs 'From ... on Friday to ... on Friday'", () => {
    expect(music.versions.instagram.caption).not.toMatch(/^From .* on (\w+) to .* on \1\.$/m)
    expect(music.versions.instagram.caption).not.toContain('From Choir 3006 In Concert')
  })

  it("(d) rows under a one-day date line say their times alone, never the day again", () => {
    const lines = music.versions.instagram.caption.split('\n')
    expect(lines).toContain('\u{1F4C5} Friday 27 November')
    expect(lines.filter((l) => l.startsWith('Fri 27 Nov'))).toEqual([])
    expect(lines).toContain('6 pm: Choir 3006 In Concert, Melbourne Recital Centre')
    expect(lines).toContain('7 pm and 9.30 pm: Joel Ross (NYC), The JazzLab')
  })

  it('a list over several days keeps its days on each row, and says no from-to line either (the PM\'s RETURN of 04:05 on 24 November 2026)', () => {
    const two = [MUSIC[0], { ...MUSIC[3], startDate: '2026-11-28T08:30:00.000Z', endDate: '2026-11-28T10:00:00.000Z' }]
    const words = listCaptions({ hook: '\u{1F3B6} Two shows.', nights: two, rows: two.map((n) => rowLine(n, two)), pictured: null, place: null, link: `${ORIGIN}/city/melbourne`, share: 'Tag who you are going with.', tags: '#MelbourneEvents #EventLinqs', crop: '4:5' })
    expect(words.caption).not.toMatch(/^From .* to .*$/m)
    expect(words.caption).toContain('Fri 27 Nov, 6 pm: Choir 3006 In Concert, Melbourne Recital Centre')
    expect(words.caption).toContain("Sat 28 Nov, 7.30 pm: Jack Jones: Hits & Stories, Bird's Basement")
  })
})

describe("its playbook rule (Lawal's 16:04: every return is a fix, a test that fails first, and a rule)", () => {
  it('is written down with its reason and its source', () => {
    for (const id of ['caption-emoji-from-category', 'caption-one-show-says-each-fact-once', 'caption-no-from-to-on-one-day', 'caption-rows-time-alone-on-one-day']) {
      const rule = PLAYBOOK.find((r) => r.id === id)
      expect(rule, id).toBeDefined()
      expect(rule?.source, id).toContain("the PM's intake read of 23 November 2026, 22:15")
    }
  })
})

/*
 * NO 'FROM ... TO ...' LINE IN ANY SET CAPTION (the PM's RETURN of 04:05 on 24 November 2026, comedy piece ed0c1dca:
 * "From Holy Sh!t Improv on Friday to Sunday Laughternoons on Sunday." restated the hook and the schedule beneath it).
 * The comedy weekend runs over three days, so on its base the line was written.
 */
describe('no set caption carries a from-to line', () => {
  const comedy = (id: string, title: string, start: string, minutes: number): CampaignNight =>
    night({ eventId: id, slug: id, title, startDate: start, endDate: new Date(Date.parse(start) + minutes * 60_000).toISOString(), venueName: 'Comedy Republic', placeName: 'Comedy Republic', categorySlug: 'comedy' })
  const COMEDY: CampaignNight[] = [
    comedy('ecd0776e-e5c9-4a9e-9641-185c2cf750b3', 'Holy Sh!t Improv', '2026-11-27T06:00:00.000Z', 60),
    comedy('b772a3ad-88a9-4a8f-bff5-aa3348b7a503', 'Holy Sh!t Improv', '2026-11-27T07:30:00.000Z', 60),
    comedy('152f235f-6a42-44bf-aeef-d03530f13af4', 'Holy Sh!t Improv', '2026-11-28T07:30:00.000Z', 60),
    comedy('11ac88ce-b5fd-4aa6-b2c6-78aa6bea3f89', 'Comedy Republic Main Stage', '2026-11-27T09:00:00.000Z', 90),
    comedy('dccd097f-be36-4ad0-bc53-09018758c117', 'Comedy Republic Main Stage', '2026-11-28T09:00:00.000Z', 90),
    comedy('7e2d2595-783f-4b5d-9485-6f829c954417', 'Sunday Laughternoons', '2026-11-29T05:00:00.000Z', 60),
  ]

  it('the comedy weekend, the live music Friday and Kyivska: the hook and the schedule carry it, never a from-to line', () => {
    for (const [name, nights] of [['comedy-weekend', COMEDY], ['live-music', MUSIC], ['kyivska-perepichka', [KYIVSKA]]] as const) {
      const p = planned(name, nights)
      for (const caption of [p.caption, p.versions.instagram.caption, p.versions.facebook.caption]) {
        expect(caption, name).not.toMatch(/^From .* on \w+ to .* on \w+\.$/m)
      }
    }
    expect(planned('comedy-weekend', COMEDY).versions.instagram.caption.split('\n').slice(0, 2)).toEqual([
      '\u{1F602} Three shows at Comedy Republic, Friday 27 to Sunday 29 November.',
      'Fri 27 Nov, 5 pm and 6.30 pm and Sat 28 Nov, 6.30 pm: Holy Sh!t Improv',
    ])
  })

  it('is a playbook rule that supersedes the one-day rule for the same line', () => {
    const rule = PLAYBOOK.find((r) => r.id === 'caption-no-from-to-line')
    expect(rule?.source).toBe("the PM's RETURN of 04:05 on 24 November 2026 (comedy piece ed0c1dca)")
    expect(rule?.rule).toContain('caption-no-from-to-on-one-day')
  })
})
