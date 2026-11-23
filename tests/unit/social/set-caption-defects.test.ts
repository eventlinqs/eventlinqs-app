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

  it('a list over several days keeps its days on each row, and its from-to line where the days differ', () => {
    const two = [MUSIC[0], { ...MUSIC[3], startDate: '2026-11-28T08:30:00.000Z', endDate: '2026-11-28T10:00:00.000Z' }]
    const words = listCaptions({ hook: '\u{1F3B6} Two shows.', nights: two, rows: two.map((n) => rowLine(n, two)), pictured: null, place: null, link: `${ORIGIN}/city/melbourne`, share: 'Tag who you are going with.', tags: '#MelbourneEvents #EventLinqs', crop: '4:5' })
    expect(words.caption).toContain('From Choir 3006 In Concert on Friday to Jack Jones: Hits & Stories on Saturday.')
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
