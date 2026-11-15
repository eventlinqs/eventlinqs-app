import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine, type CtaInput } from '@/lib/events/cta'
import { cardTitle, daySlideGroups, drawsOf, lockedListSlides, picturedLine, planCampaign, rangeOf, shortTitle, splitLine, CARD_TITLE_MAX, ROWS_IN_TYPE, ROWS_PER_DAY_SLIDE, type CampaignNight, type Slide } from '@/lib/social/campaign'
import { STAND_INS, standInOf } from '@/lib/social/stand-ins'
import { tapWords } from '@/lib/broadcast/campaign-slides'
import { daysElement, keepDate, keepTogether, twoLines } from '@/lib/broadcast/day-cards'

/*
 * THE 9.5 LOCKED LOOK IN THE PRODUCT (the PM's 17:10 of 15 November 2026: "the product renders in the 9.5 locked look
 * (port locked-look-4.ts's layout into renderCampaignSlide; titles shortened by rule from the event's own words, never cut
 * mid word); an organiser's own permitted photograph always leads its night"). Out-4 had cut "Anne Sofie von Otter &
 * Kristian..." and "Geelong Dance Movement: A Passage..." with ellipses, and left AMCF's own photograph off its slide.
 * The PM's 17:40 on out-5 (8.9): a stand-in only over nights all of its kind, no empty photo slot, the clock orders a
 * day, card titles by rule, and the cover's line.
 */

const ORIGIN = 'https://www.eventlinqs.com.au'
const OWN = 'https://example.supabase.co/storage/v1/object/public/event-images/organiser-supplied/amcf-2026/amcf.jpg'

let seq = 0
function night(over: Partial<CampaignNight> & { at: string; state?: CtaInput }): CampaignNight {
  seq += 1
  const cta = ctaFor(over.state ?? { tiers: [{ price: 4500 }] })
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `night-${seq}`,
    title: `Night ${seq}`,
    startDate: over.at,
    timezone: 'Australia/Melbourne',
    citySlug: 'melbourne',
    cityName: 'Melbourne',
    venueName: 'Northcote Social Club',
    host: 'Northcote Social Club',
    categorySlug: 'music',
    summary: 'A band launches its album.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $45' }),
    ...over,
  }
}
const rowsOf = (slides: readonly Slide[]) => slides.flatMap((s) => (s.t === 'days' ? s.rows : []))
/** Every card a post draws: its day slides', and its cover's when the cover is in type. */
const cardsOf = (slides: readonly Slide[]) => slides.flatMap((s) => (s.t === 'days' ? s.rows : s.t === 'week_cover' ? (s.lead ?? []) : []))
const daysOf = (slides: readonly Slide[]) => slides.filter((s): s is Extract<Slide, { t: 'days' }> => s.t === 'days')

describe('a title shortened by rule, never cut mid word (the PM\'s 17:10)', () => {
  it('keeps a title that fits whole, the two performers of a duo recital included', () => {
    expect(shortTitle('Anne Sofie von Otter & Kristian Bezuidenhout', CARD_TITLE_MAX)).toBe('Anne Sofie von Otter & Kristian Bezuidenhout')
  })
  it('keeps the main name before its own colon when the whole does not fit', () => {
    expect(shortTitle('Geelong Dance Movement: A Passage Through Time, An Evening of New Australian Dance', CARD_TITLE_MAX)).toBe('Geelong Dance Movement: A Passage Through Time')
    expect(shortTitle('Geelong Dance Movement: A Passage Through Time and Space With Guest Artists From Everywhere', 30)).toBe('Geelong Dance Movement')
  })
  it('cuts at "with" or a parenthesis, never at a plain "and"', () => {
    expect(shortTitle('The Long Goodbye Tour with Very Special Guests From Abroad and Friends', 30)).toBe('The Long Goodbye Tour')
    expect(shortTitle('African Music and Cultural Festival 2026 (three days, free entry at Fed Square)', 40)).toBe('African Music and Cultural Festival 2026')
    expect(shortTitle('African Music and Cultural Festival Extended Programme Weekend', 20)).toBe('African Music and Cultural Festival Extended Programme Weekend')
  })
  it('never an ellipsis and never a part word: the result is the title itself or a run of its first whole words', () => {
    for (const t of ['A Very Long Title With No Joins At All In Its Own Words Whatsoever', 'Rhythm & Blues Night: The Big Return Of The Rhythm Section To Town']) {
      for (const max of [12, 20, 30, 48]) {
        const s = shortTitle(t, max)
        expect(s).not.toMatch(/\.\.\.|…/)
        expect(t.startsWith(s)).toBe(true)
        expect(s === t || /[\s:,(|&+]/.test(t.charAt(s.length))).toBe(true)
      }
    }
  })
})

describe("a card's title (the PM's 17:40 fix 4)", () => {
  it('the performer before a colon wins over a tour name', () => {
    expect(cardTitle('Kate Ceberano: Australian Made Tour 2026', CARD_TITLE_MAX)).toBe('Kate Ceberano')
    expect(cardTitle('MAFIA The Game: The Show', CARD_TITLE_MAX)).toBe('MAFIA The Game: The Show')
  })
  it("after 'presents', the show's own name", () => {
    expect(cardTitle('GSODA Junior Players presents Curtain Up', CARD_TITLE_MAX)).toBe('Curtain Up')
  })
  it("a plural's possessive takes its apostrophe", () => {
    expect(cardTitle('Mens Shed Open Day', CARD_TITLE_MAX)).toBe("Men's Shed Open Day")
    expect(cardTitle('Womens and Childrens Fun Run', CARD_TITLE_MAX)).toBe("Women's and Children's Fun Run")
    expect(cardTitle('Menswear Market', CARD_TITLE_MAX)).toBe('Menswear Market')
  })
})

describe('a list post in the locked look', () => {
  const week = [
    night({ at: '2026-11-16T08:30:00Z', title: 'Comedy Republic Bar Show', categorySlug: 'comedy', venueName: 'Comedy Republic', host: 'Comedy Republic' }), // Mon 7.30pm
    night({ at: '2026-11-18T09:00:00Z', title: 'LANY', summary: null, venueName: 'John Cain Arena', host: 'John Cain Arena' }), // Wed 8pm
    night({ at: '2026-11-18T08:30:00Z', title: 'An Evening with a Historian', summary: 'An author in conversation.', venueName: 'Melbourne Recital Centre', host: 'Melbourne Recital Centre' }), // Wed 7.30pm
    night({ at: '2026-11-20T08:00:00Z', endDate: '2026-11-22T11:00:00Z', title: 'African Music and Cultural Festival', categorySlug: 'festival', venueName: 'Fed Square', host: 'AMCF', state: { entryMode: 'walk_in', isFree: true }, approvedPhotoUrl: OWN, photoCredit: 'AMCF, past festival' }), // Fri to Sun
    night({ at: '2026-11-21T09:00:00Z', title: 'Two Door Cinema Club', summary: null, venueName: 'John Cain Arena', host: 'John Cain Arena 2' }), // Sat 8pm
  ]
  const slides = lockedListSlides(week, ['5 things on', 'in Melbourne', 'this week'], ORIGIN)

  it('is the cover, the day slides, the own photograph slide, then the ask', () => {
    expect(slides[0].t).toBe('week_cover')
    expect(slides.at(-1)?.t).toBe('ask')
    expect(slides.filter((s) => s.t === 'feature')).toHaveLength(1)
    expect(slides.slice(1, -2).every((s) => s.t === 'days')).toBe(true)
  })

  it("an organiser's own permitted photograph leads its night: the cover shows it whole, and its own slide", () => {
    expect(slides[0]).toMatchObject({ t: 'week_cover', photoEventId: week[3].eventId, photo: OWN, credit: expect.stringContaining('AMCF') })
    expect(slides.find((s) => s.t === 'feature')).toMatchObject({ eventId: week[3].eventId, photo: OWN, chip: 'FREE ENTRY', title: 'African Music and Cultural Festival' })
  })

  it('every night is one gold card, at most four a slide (five in type); the clock orders the cards (fix 3)', () => {
    const ids = rowsOf(slides).map((r) => r.eventId)
    expect([...ids].sort()).toEqual(week.map((n) => n.eventId).sort())
    for (const d of daysOf(slides)) {
      expect(d.rows.length).toBeLessThanOrEqual(d.photo ? ROWS_PER_DAY_SLIDE : ROWS_IN_TYPE)
      const starts = d.rows.map((r) => Date.parse(r.startDate))
      expect(starts).toEqual([...starts].sort((a, b) => a - b))
    }
    expect(rowsOf(slides).find((r) => r.eventId === week[1].eventId)).toMatchObject({ when: '8:00 pm', title: 'LANY', place: 'John Cain Arena', free: false })
  })

  it("Ballarat's Thursday: 10:30 am stands above 7:00 pm whatever their draw", () => {
    const morning = night({ at: '2026-11-18T23:30:00Z', title: 'Morning Market', categorySlug: 'markets', state: { entryMode: 'walk_in', isFree: true }, citySlug: 'ballarat', cityName: 'Ballarat' })
    const evening = night({ at: '2026-11-19T08:00:00Z', title: 'Big Show', venueName: 'Her Majesty’s Theatre', citySlug: 'ballarat', cityName: 'Ballarat' })
    const thu = daysOf(lockedListSlides([evening, morning], ['2 things on', 'in Ballarat', 'this week'], ORIGIN))[0]
    expect(thu.rows.map((r) => r.when)).toEqual(['10:30 am', '7:00 pm'])
  })

  it('a festival over three days reads its first time over its first day and its last, and FREE', () => {
    expect(rowsOf(slides).find((r) => r.eventId === week[3].eventId)).toMatchObject({ when: '7:00 pm', sub: 'Fri 20 to Sun 22', free: true })
  })

  it("a show's other days are named, never counted (fix 3)", () => {
    const fri = night({ at: '2026-11-20T09:00:00Z', title: 'The Play', venueName: 'Geelong Arts Centre' })
    const sat = night({ at: '2026-11-21T09:00:00Z', title: 'The Play', venueName: 'Geelong Arts Centre' })
    const s = lockedListSlides([fri], ['1 thing on', 'in Geelong', 'this weekend'], ORIGIN, () => [fri, sat])
    expect(rowsOf(s)[0].sub).toBe('Fri 20 & Sat 21')
    expect(JSON.stringify(s)).not.toMatch(/more day/i)
  })

  it('the cover names its range, its biggest draws and its line (fix 5)', () => {
    expect(rangeOf(week)).toBe('16 to 22 November')
    expect(drawsOf(week)).toBe('Led by LANY and Two Door Cinema Club')
    expect(splitLine(week)).toBe('1 is free, 4 need tickets. Tap through for each night.')
    // The cover carries AMCF's own photograph, so AMCF is named first (the PM's 18:45 fix 5).
    expect(slides[0]).toMatchObject({ range: '16 to 22 November', draws: 'Led by African Music and Cultural Festival and LANY', line: '1 is free, 4 need tickets. Tap through for each night.' })
  })

  it('the ask names three to start with: the night the cover is led by, then by law 18', () => {
    const ask = slides.at(-1) as Extract<Slide, { t: 'ask' }>
    expect(ask.count).toBe(5)
    // The PM's 19:45 fix 1: the night the cover is led by (AMCF, its own photograph) first, then law 18's two arena shows.
    expect(ask.three.map((r) => r.title)).toEqual(['African Music and Cultural Festival', 'LANY', 'Two Door Cinema Club'])
    expect(ask.three.map((r) => r.when)).toEqual(['Fri 20 to Sun 22', 'Wed 18', 'Sat 21'])
    const festivalOnly = lockedListSlides([week[3]], ['1 thing on', 'in Melbourne', 'this weekend'], ORIGIN).at(-1) as Extract<Slide, { t: 'ask' }>
    expect(festivalOnly.three[0].when).toBe('Fri 20 to Sun 22')
  })

  it('a cover with no photograph lists its three lead nights as cards, so it is never bare (fix 2)', () => {
    const talks = [week[2], night({ at: '2026-11-19T08:30:00Z', title: 'A Second Talk', summary: 'An author in conversation.', venueName: 'Melbourne Recital Centre' })]
    const cover = lockedListSlides(talks, ['2 things on', 'in Melbourne', 'this week'], ORIGIN)[0] as Extract<Slide, { t: 'week_cover' }>
    expect(cover.photo).toBeNull()
    expect(cover.lead?.map((r) => r.eventId)).toEqual(talks.map((n) => n.eventId))
  })
})

describe("a stand-in only over nights all of its kind (the PM's 17:40 fix 1, rule one)", () => {
  it("Geelong's Friday: a band night beside GSODA Junior Players' Curtain Up and a garden session is in type", () => {
    const band = night({ at: '2026-11-20T09:00:00Z', title: 'The Band Night', citySlug: 'geelong', cityName: 'Geelong', venueName: 'The Barwon Club' })
    const curtain = night({ at: '2026-11-20T08:00:00Z', title: 'GSODA Junior Players presents Curtain Up', categorySlug: 'theatre', summary: 'Young performers on stage.', venueName: 'Geelong Arts Centre', citySlug: 'geelong', cityName: 'Geelong' })
    const garden = night({ at: '2026-11-20T00:00:00Z', title: 'Garden Session', categorySlug: 'community', summary: 'A morning in the garden.', venueName: 'Geelong Botanic Gardens', citySlug: 'geelong', cityName: 'Geelong', state: { entryMode: 'walk_in', isFree: true } })
    const s = lockedListSlides([band, curtain, garden], ['3 things on', 'in Geelong', 'this weekend'], ORIGIN)
    expect(daysOf(s).every((d) => d.photo === null)).toBe(true)
    expect(s[0]).toMatchObject({ t: 'week_cover', photo: null })
    expect(cardsOf(s).find((r) => r.eventId === curtain.eventId)?.title).toBe('Curtain Up')
  })

  it("Geelong's reel cover led by Geelong Dance Movement carries no gig crowd", () => {
    const dance = night({ at: '2026-11-19T08:30:00Z', title: 'Geelong Dance Movement: A Passage Through Time', categorySlug: 'theatre', summary: 'A dance company on stage.', venueName: 'Geelong Arts Centre', citySlug: 'geelong', cityName: 'Geelong' })
    const band = night({ at: '2026-11-20T09:00:00Z', title: 'The Band Night', citySlug: 'geelong', cityName: 'Geelong', venueName: 'The Barwon Club', state: { tiers: [{ price: 1500 }] } })
    const s = lockedListSlides([dance, band], ['2 things on', 'in Geelong', 'this week'], ORIGIN)
    expect(s[0]).toMatchObject({ t: 'week_cover', draws: expect.stringMatching(/^Led by Geelong Dance Movement/), photo: null })
  })

  it('a day of comedy alone takes a comedy stage, each stand-in once in a piece; a talk alone stays in type', () => {
    const c1 = night({ at: '2026-11-16T08:30:00Z', title: 'Bar Show', categorySlug: 'comedy', venueName: 'Comedy Republic' })
    const c2 = night({ at: '2026-11-17T08:30:00Z', title: 'Main Stage', categorySlug: 'comedy', venueName: 'Comedy Republic' })
    const s = lockedListSlides([c1, c2], ['2 things on', 'in Melbourne', 'this week'], ORIGIN)
    const used = s.map((sl) => ('photo' in sl ? standInOf(sl.photo) : null)).filter(Boolean)
    expect(used.every((x) => x!.kind === 'comedy')).toBe(true)
    expect(new Set(used.map((x) => x!.id)).size).toBe(used.length)
    for (const d of daysOf(s)) if (d.photo) expect(d.credit).toBe(`Photo: ${standInOf(d.photo)!.photographer} / Pexels`)
    const talkOnly = lockedListSlides([week0Talk()], ['1 thing on', 'in Melbourne', 'this week'], ORIGIN)
    expect(daysOf(talkOnly).every((d) => d.photo === null)).toBe(true)
    expect(STAND_INS.some((x) => x.id === '32072177')).toBe(false) // withdrawn: another city's signs
  })

  it('a music night at an arena is a concert by its venue, so a gig crowd fits it', () => {
    const lany = night({ at: '2026-11-18T09:00:00Z', title: 'LANY', summary: null, venueName: 'John Cain Arena' })
    const s = lockedListSlides([lany], ['1 thing on', 'in Melbourne', 'this week'], ORIGIN)
    expect(standInOf((s[0] as Extract<Slide, { t: 'week_cover' }>).photo)?.kind).toBe('gig')
  })
})
function week0Talk(): CampaignNight {
  return night({ at: '2026-11-18T08:30:00Z', title: 'An Evening with a Historian', summary: 'An author in conversation.', venueName: 'Melbourne Recital Centre' })
}

describe('the slides around the cards', () => {
  it('the caption says what a stand-in shows, from Pexels, and that it is not the night', () => {
    const c1 = night({ at: '2026-11-16T08:30:00Z', title: 'Bar Show', categorySlug: 'comedy', venueName: 'Comedy Republic' })
    const s = lockedListSlides([c1, night({ at: '2026-11-17T08:30:00Z', title: 'Main Stage', categorySlug: 'comedy', venueName: 'Comedy Republic' })], ['2 things on', 'in Melbourne', 'this week'], ORIGIN)
    expect(picturedLine(s)).toMatch(/^Pictured on slides? [\d, and]+: .+, (a photograph|photographs) from Pexels, not (this night|these nights)\.$/)
    expect(picturedLine([{ t: 'ask', composition: 'close', count: 1, three: [] }])).toBeNull()
  })

  it('a story names the slide a tap opens, never a count', () => {
    const s = lockedListSlides([week0Talk(), night({ at: '2026-11-20T09:00:00Z', title: 'LANY', summary: null, venueName: 'John Cain Arena' })], ['2 things on', 'in Melbourne', 'this week'], ORIGIN)
    expect(tapWords(s[1])).toMatch(/^Tap for /)
    expect(tapWords(s.at(-1)!)).toBe('Tap for where to start')
    expect(tapWords(null)).toBeNull()
  })

  it("a feature's name breaks between words into two even lines", () => {
    expect(twoLines('African Music and Cultural Festival')).toEqual(['African Music', 'and Cultural Festival'])
    expect(twoLines('African Music and Cultural Festival 2026')).toEqual(['African Music', 'and Cultural Festival 2026'])
    expect(twoLines('LANY')).toEqual(['LANY'])
  })

  it('days pack into slides of at most four, balanced, never splitting a day of four or fewer', () => {
    const at = (iso: string) => night({ at: iso })
    const five = [at('2026-11-16T09:00:00Z'), at('2026-11-17T09:00:00Z'), at('2026-11-17T10:00:00Z'), at('2026-11-19T09:00:00Z'), at('2026-11-20T09:00:00Z')]
    expect(daySlideGroups(five).map((g) => g.flat().length)).toEqual([3, 2])
  })
})

describe('the planner draws every list post in the locked look', () => {
  it('the week ahead, the weekend and the discovery reel start on the cover and end on the ask', () => {
    const at = (iso: string, title: string, extra: Partial<CampaignNight> = {}) => night({ at: iso, title, venueName: `${title} Hall`, host: `${title} Hall`, ...extra })
    const nights = [
      at('2026-11-16T09:00:00Z', 'Alpha Band'),
      at('2026-11-17T09:00:00Z', 'Beta Band'),
      at('2026-11-19T09:00:00Z', 'Gamma Band'),
      at('2026-11-20T09:00:00Z', 'Delta Band'),
      at('2026-11-21T09:00:00Z', 'Epsilon Band'),
      at('2026-11-22T05:00:00Z', 'Zeta Band'),
      at('2026-11-21T03:00:00Z', 'Eta Band'),
    ]
    const { pieces } = planCampaign({ nights, cities: [{ slug: 'melbourne', name: 'Melbourne' }], weekStart: '2026-11-16', origin: ORIGIN })
    const lists = pieces.filter((p) => ['week_ahead', 'weekend_carousel', 'discovery_reel'].includes(p.kind))
    expect(lists.length).toBeGreaterThan(0)
    for (const p of lists) {
      expect(p.slides[0].t, p.kind).toBe('week_cover')
      expect(p.slides.at(-1)?.t, p.kind).toBe('ask')
      expect(JSON.stringify(p.slides)).not.toMatch(/\.\.\.|…/)
    }
  })
})

describe('a stand-in is never the brand piece photograph', () => {
  it('brandImage passes over the stand-ins to the newest photograph licensed for the brand itself', async () => {
    const { brandImage } = await import('@/lib/social/store')
    const rows = [
      { id: 'a', asset_url: `${ORIGIN}/social/stand-ins/1763067.jpg`, attribution_text: 'Photo: Sebastian Ervi / Pexels', focal_x: null, focal_y: null, source_width: 1800, source_height: 1202 },
      { id: 'b', asset_url: 'https://example.com/brand.jpg', attribution_text: 'Licensed for EventLinqs', focal_x: null, focal_y: null, source_width: 1600, source_height: 1200 },
    ]
    const db = { rpc: async () => ({ data: rows, error: null }) }
    expect((await brandImage(db as never, new Date()))?.url).toBe('https://example.com/brand.jpg')
    const onlyStandIns = { rpc: async () => ({ data: rows.slice(0, 1), error: null }) }
    expect(await brandImage(onlyStandIns as never, new Date())).toBeNull()
  })
})

describe('the venue spotlight never carries tier 4 (law 18)', () => {
  it("a library with the most nights, all of them sessions, is never the venue of the week", () => {
    const lib = (iso: string, title: string) => night({ at: iso, title, venueName: 'Geelong Library and Heritage Centre', host: 'Geelong Library and Heritage Centre', categorySlug: 'community', citySlug: 'geelong', cityName: 'Geelong', state: { entryMode: 'walk_in', isFree: true } })
    const sessions = [lib('2026-11-16T23:00:00Z', 'Toddler time'), lib('2026-11-17T23:00:00Z', 'Baby time'), lib('2026-11-18T23:00:00Z', 'English conversation group')]
    const club = (iso: string, title: string) => night({ at: iso, title, venueName: 'The Barwon Club', host: 'The Barwon Club', citySlug: 'geelong', cityName: 'Geelong' })
    const { pieces } = planCampaign({ nights: [...sessions, club('2026-11-20T09:00:00Z', 'Band A'), club('2026-11-21T09:00:00Z', 'Band B')], cities: [{ slug: 'geelong', name: 'Geelong' }], weekStart: '2026-11-16', origin: ORIGIN })
    const spot = pieces.find((p) => p.kind === 'venue_spotlight')
    expect(spot?.partnerName ?? spot?.versions.instagram.hook ?? '').not.toMatch(/Library/)
    for (const p of pieces) for (const id of sessions.map((n) => n.eventId)) expect(p.eventIds, p.kind).not.toContain(id)
  })
})

describe("the PM's 18:45 fixes", () => {
  const at = (iso: string, title: string, extra: Partial<CampaignNight> & { state?: CtaInput } = {}) => night({ at: iso, title, citySlug: 'geelong', cityName: 'Geelong', venueName: `${title} Hall`, host: `${title} Hall`, summary: null, categorySlug: 'theatre', ...extra })

  it('one night, one date label: the cover, its day slide and the ask read a run the same (fix 1)', () => {
    const fri = at('2026-11-20T08:30:00Z', 'Curtain Up')
    const sat = at('2026-11-21T08:30:00Z', 'Curtain Up')
    const fest = at('2026-11-20T22:00:00Z', 'Leisurefest', { endDate: '2026-11-22T07:00:00Z' })
    const other = at('2026-11-21T09:00:00Z', 'Another Show')
    const s = lockedListSlides([fri, fest, other], ['3 things on', 'in Geelong', 'this weekend'], ORIGIN, (n) => (n.title === 'Curtain Up' ? [fri, sat] : [n]))
    const labelsOf = (id: string) => [
      ...((s[0] as Extract<Slide, { t: 'week_cover' }>).lead ?? []).filter((r) => r.eventId === id).map((r) => r.sub),
      ...rowsOf(s).filter((r) => r.eventId === id).map((r) => r.sub),
      ...(s.at(-1) as Extract<Slide, { t: 'ask' }>).three.filter((r) => r.eventId === id).map((r) => r.when),
    ]
    expect(new Set(labelsOf(fri.eventId))).toEqual(new Set(['Fri 20 & Sat 21']))
    expect(new Set(labelsOf(fest.eventId))).toEqual(new Set(['Sat 21 to Sun 22']))
  })

  it("a weekend eyebrow counts every session of a run (Bendigo's read 21 November while it ran 20 to 22)", () => {
    const sat = at('2026-11-21T08:00:00Z', 'Witness for the Prosecution')
    const runs = [at('2026-11-20T08:00:00Z', 'Witness for the Prosecution'), sat, at('2026-11-22T02:30:00Z', 'Witness for the Prosecution')]
    const s = lockedListSlides([sat], ['1 thing on', 'in Bendigo', 'this weekend'], ORIGIN, () => runs)
    expect((s[0] as Extract<Slide, { t: 'week_cover' }>).range).toBe('20 to 22 November')
  })

  it("a run sorts by its first session on the slide's days: Leisurefest's Friday 9:00 am above the Friday 7:30 pm (fix 2)", () => {
    const show = at('2026-11-20T08:30:00Z', 'Curtain Up')
    const leisureSat = at('2026-11-20T22:00:00Z', 'Leisurefest')
    const leisureFri = at('2026-11-19T22:00:00Z', 'Leisurefest')
    // A third night with its own photograph puts the cover in picture, so the day slide is not a repeat of the cover.
    const sunday = at('2026-11-22T02:00:00Z', 'Sunday Picnic', { approvedPhotoUrl: OWN, photoCredit: 'Its organiser' })
    const s = lockedListSlides([show, leisureSat, sunday], ['3 things on', 'in Geelong', 'this weekend'], ORIGIN, (n) => (n.title === 'Leisurefest' ? [leisureFri, leisureSat] : [n]))
    const day = daysOf(s).find((d) => d.rows.some((r) => r.eventId === leisureSat.eventId))!
    expect(day.rows.map((r) => r.eventId).slice(0, 2)).toEqual([leisureSat.eventId, show.eventId])
  })

  it("no repeat slide: a day slide whose every card is on the cover drops, the post is cover then ask (fix 3, Bendigo's weekend)", () => {
    const three = [at('2026-11-20T08:00:00Z', 'One'), at('2026-11-21T08:00:00Z', 'Two'), at('2026-11-22T02:30:00Z', 'Three')]
    const s = lockedListSlides(three, ['3 things on', 'in Bendigo', 'this weekend'], ORIGIN)
    expect(s.map((x) => x.t)).toEqual(['week_cover', 'ask'])
  })

  it('no stretched card: a day slide in type sets no card to grow (fix 4)', () => {
    const rows = [{ eventId: 'a', startDate: '2026-11-21T08:00:00Z', when: '7:15 pm', sub: 'Sat 21', title: "Australia v England Men's T20I", place: 'Melbourne Cricket Ground', free: false }]
    const el = daysElement('feed', { day: 'Saturday', date: '21 Nov', rows, credit: null }, null, null)
    const grown: string[] = []
    const walk = (x: unknown) => {
      if (!x || typeof x !== 'object') return
      const e = x as { props?: { style?: Record<string, unknown>; children?: unknown } }
      const st = e.props?.style ?? {}
      if (typeof st.border === 'string' && st.border.includes('#E8B738') && Number(st.flexGrow ?? 0) > 0) grown.push('card')
      const k = e.props?.children
      for (const c of Array.isArray(k) ? k : [k]) walk(c)
    }
    walk(el)
    expect(grown).toEqual([])
  })

  it("a name breaks before v, vs, &, and, at or with, never after, and never inside a run of capitalised words (the PM's 19:45 fix 2)", () => {
    expect(keepTogether('Melbourne United vs New Zealand Breakers')).toBe('Melbourne\u00A0United vs\u00A0New\u00A0Zealand\u00A0Breakers')
    expect(keepTogether("Australia v England Men's T20I")).toBe("Australia v\u00A0England\u00A0Men's\u00A0T20I")
    expect(keepTogether('Torquay Dance Academy: SHOWTIME')).toBe('Torquay\u00A0Dance\u00A0Academy:\u00A0SHOWTIME')
    expect(keepTogether('Geelong Caravanning and Adventure Leisurefest')).toBe('Geelong\u00A0Caravanning and\u00A0Adventure\u00A0Leisurefest')
    expect(keepTogether('An Evening with Ben Macintyre')).toBe('An\u00A0Evening with\u00A0Ben\u00A0Macintyre')
    expect(keepTogether('Live Music: Garden Session with Zac Anthony')).toBe('Live\u00A0Music: Garden\u00A0Session with\u00A0Zac\u00A0Anthony')
    expect(keepTogether('the night of a lifetime')).toBe('the night of a\u00A0lifetime')
    // A run past 30 letters may still break, so no name is wider than its card.
    expect(keepTogether('Grand Southern Regional Championship Finals Weekend').includes(' ')).toBe(true)
  })

  it('a date label breaks only before TO or &', () => {
    expect(keepDate('FRI 20 TO SUN 22')).toBe('FRI\u00A020 TO\u00A0SUN\u00A022')
    expect(keepDate('FRI 20 & SAT 21')).toBe('FRI\u00A020 &\u00A0SAT\u00A021')
    expect(keepDate('SAT 21')).toBe('SAT\u00A021')
  })

  it('the photographed night is the first name in Led by (fix 5)', () => {
    const fight = at('2026-11-21T09:00:00Z', 'Humanoid Fighting Championship', { venueName: 'Margaret Court Arena', categorySlug: 'sport' })
    const amcf = at('2026-11-20T08:00:00Z', 'African Music and Cultural Festival', { endDate: '2026-11-22T11:00:00Z', categorySlug: 'festival', approvedPhotoUrl: OWN, photoCredit: 'AMCF, past festival', state: { entryMode: 'walk_in', isFree: true } })
    const cover = lockedListSlides([fight, amcf], ['2 things on', 'in Melbourne', 'this weekend'], ORIGIN)[0] as Extract<Slide, { t: 'week_cover' }>
    expect(cover.photoEventId).toBe(amcf.eventId)
    expect(cover.draws).toMatch(/^Led by African Music and Cultural Festival\b/)
  })
})

describe("the PM's 19:45 fixes", () => {
  it("the ask's first line is the night the cover is led by, in every list post (fix 1: Melbourne's weekend skipped AMCF)", () => {
    const fight = night({ at: '2026-11-21T09:00:00Z', title: 'Humanoid Fighting Championship', venueName: 'Margaret Court Arena', host: 'Margaret Court Arena', categorySlug: 'sport' })
    const talkA = night({ at: '2026-11-20T08:30:00Z', title: 'Timor-Leste: Ita Nia Lian', summary: 'A stories evening.', venueName: 'Melbourne Recital Centre', host: 'Melbourne Recital Centre' })
    const talkB = night({ at: '2026-11-22T00:30:00Z', title: 'An Evening with Alastair Campbell', summary: 'An author in conversation.', venueName: 'Melbourne Recital Centre', host: 'Melbourne Recital Centre 2' })
    const amcf = night({ at: '2026-11-20T00:00:00Z', endDate: '2026-11-22T09:00:00Z', title: 'African Music and Cultural Festival 2026', categorySlug: 'festival', venueName: 'Federation Square', host: 'AMCF', state: { entryMode: 'walk_in', isFree: true }, approvedPhotoUrl: OWN, photoCredit: 'AMCF, past festival' })
    const s = lockedListSlides([fight, talkA, talkB, amcf], ['4 things on', 'in Melbourne', 'this weekend'], ORIGIN)
    const cover = s[0] as Extract<Slide, { t: 'week_cover' }>
    const ask = s.at(-1) as Extract<Slide, { t: 'ask' }>
    expect(cover.draws).toMatch(/^Led by African Music and Cultural Festival 2026/)
    expect(ask.three[0].eventId).toBe(amcf.eventId)
    expect(ask.three.map((r) => r.eventId)).toContain(fight.eventId)

    const at = (iso: string, title: string, extra: Partial<CampaignNight> = {}) => night({ at: iso, title, venueName: `${title} Hall`, host: `${title} Hall`, ...extra })
    const { pieces } = planCampaign({
      nights: [at('2026-11-16T09:00:00Z', 'Alpha Band'), at('2026-11-17T09:00:00Z', 'Beta Band'), at('2026-11-20T09:00:00Z', 'Gamma Band'), at('2026-11-21T09:00:00Z', 'Delta Band', { approvedPhotoUrl: OWN, photoCredit: 'Its organiser' }), at('2026-11-22T05:00:00Z', 'Epsilon Band')],
      cities: [{ slug: 'melbourne', name: 'Melbourne' }],
      weekStart: '2026-11-16',
      origin: ORIGIN,
    })
    for (const p of pieces.filter((x) => x.slides[0]?.t === 'week_cover')) {
      const c = p.slides[0] as Extract<Slide, { t: 'week_cover' }>
      const a = p.slides.at(-1) as Extract<Slide, { t: 'ask' }>
      const first = c.draws?.replace(/^Led by /, '').split(' and ')[0]
      if (first) expect(a.three[0].title, p.kind).toBe(first)
    }
  })
})
