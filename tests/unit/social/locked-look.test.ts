import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine, type CtaInput } from '@/lib/events/cta'
import { cardTitle, daySlideGroups, drawsOf, lockedListSlides, lockRefusal, nightKind, picturedLine, planCampaign, rangeOf, seatedNight, shortTitle, socialTierOf, splitLine, sportOf, venueSlideOf, CARD_TITLE_MAX, ROWS_IN_TYPE, ROWS_PER_DAY_SLIDE, type CampaignNight, type Slide } from '@/lib/social/campaign'
import { STAND_INS, standInChooser, standInOf } from '@/lib/social/stand-ins'
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
    // Since the PM's 22:41 a talk carries a talk stand-in, and since out-12 a theatre night a theatre stage, so the nights
    // here are of no kind a stand-in shows: a book market and a run club (no match).
    const kindless = [
      night({ at: '2026-11-18T23:00:00Z', title: 'The Melbourne Book Market', categorySlug: 'community', summary: 'Weekend market of new and secondhand titles.', venueName: 'Queen Victoria Market', state: { entryMode: 'walk_in', isFree: true } }),
      night({ at: '2026-11-19T21:00:00Z', title: 'Run the Tan: Run Club', categorySlug: 'sports', summary: 'A coach-supported walk, jog or run around the Tan.', venueName: 'Tan Track', state: { entryMode: 'walk_in', isFree: true } }),
    ]
    const cover = lockedListSlides(kindless, ['2 things on', 'in Melbourne', 'this week'], ORIGIN)[0] as Extract<Slide, { t: 'week_cover' }>
    expect(cover.photo).toBeNull()
    expect(cover.lead?.map((r) => r.eventId).sort()).toEqual(kindless.map((n) => n.eventId).sort())
  })
})

describe("a stand-in only over nights all of its kind (the PM's 17:40 fix 1, rule one)", () => {
  // Lawal's lock of 15 November 2026, 20:52 ("Never a text-only post"; every benchmark post leads with a photograph)
  // outranks the PM's 17:40 cover in type: the cover is now led by the night whose kind has a stand-in, and that stand-in
  // stands over it alone, which the cover names (rule one kept). Since the PM's 22:41 fix 1 a day of mixed kinds carries
  // the photograph of its first night by draw with a stand-in.
  it("Geelong's Friday: the first night by draw with a stand-in leads, each photograph of its own night's kind (out-12)", () => {
    const band = night({ at: '2026-11-20T09:00:00Z', title: 'The Band Night', citySlug: 'geelong', cityName: 'Geelong', venueName: 'The Barwon Club' })
    const curtain = night({ at: '2026-11-20T08:00:00Z', title: 'GSODA Junior Players presents Curtain Up', categorySlug: 'theatre', summary: 'Young performers on stage.', venueName: 'Geelong Arts Centre', citySlug: 'geelong', cityName: 'Geelong' })
    const garden = night({ at: '2026-11-20T00:00:00Z', title: 'Garden Session', categorySlug: 'community', summary: 'A morning in the garden.', venueName: 'Geelong Botanic Gardens', citySlug: 'geelong', cityName: 'Geelong', state: { entryMode: 'walk_in', isFree: true } })
    const s = lockedListSlides([band, curtain, garden], ['3 things on', 'in Geelong', 'this weekend'], ORIGIN)
    // Curtain Up, at the Arts Centre, is the first by draw, and since out-12 a theatre night carries a theatre stage.
    expect(s[0]).toMatchObject({ t: 'week_cover', draws: 'Led by Curtain Up' })
    const coverPhoto = (s[0] as Extract<Slide, { t: 'week_cover' }>).photo
    expect(standInOf(coverPhoto)?.kind).toBe('theatre')
    // The PM's 22:41 fix 1 and fix 2: the day leads with the kind of its first night by draw, never the cover's photograph.
    for (const d of daysOf(s)) {
      expect(standInOf(d.photo)?.kind).toBe('theatre')
      expect(d.photo).not.toBe(coverPhoto)
    }
    expect((s.at(-1) as Extract<Slide, { t: 'ask' }>).three[0].eventId).toBe(curtain.eventId)
    expect(cardsOf(s).find((r) => r.eventId === curtain.eventId)?.title).toBe('Curtain Up')
  })

  it("Geelong's reel: a gig crowd never stands over Geelong Dance Movement; it leads under dancers on a stage (out-12)", () => {
    const dance = night({ at: '2026-11-19T08:30:00Z', title: 'Geelong Dance Movement: A Passage Through Time', categorySlug: 'theatre', summary: 'A dance company on stage.', venueName: 'Geelong Arts Centre', citySlug: 'geelong', cityName: 'Geelong' })
    const band = night({ at: '2026-11-20T09:00:00Z', title: 'The Band Night', citySlug: 'geelong', cityName: 'Geelong', venueName: 'The Barwon Club', state: { tiers: [{ price: 1500 }] } })
    const s = lockedListSlides([dance, band], ['2 things on', 'in Geelong', 'this week'], ORIGIN)
    const cover = s[0] as Extract<Slide, { t: 'week_cover' }>
    expect(cover.draws).toBe('Led by Geelong Dance Movement')
    expect(standInOf(cover.photo)?.kind).toBe('dance')
    expect(cover.draws).not.toMatch(/Band Night/)
  })

  it('a day of comedy alone takes a comedy stage, each stand-in once in a piece; a talk alone takes a talk (the PM\'s 22:41)', () => {
    const c1 = night({ at: '2026-11-16T08:30:00Z', title: 'Bar Show', categorySlug: 'comedy', venueName: 'Comedy Republic' })
    const c2 = night({ at: '2026-11-17T08:30:00Z', title: 'Main Stage', categorySlug: 'comedy', venueName: 'Comedy Republic' })
    const s = lockedListSlides([c1, c2], ['2 things on', 'in Melbourne', 'this week'], ORIGIN)
    const used = s.map((sl) => ('photo' in sl ? standInOf(sl.photo) : null)).filter(Boolean)
    expect(used.every((x) => x!.kind === 'comedy')).toBe(true)
    expect(new Set(used.map((x) => x!.id)).size).toBe(used.length)
    for (const d of daysOf(s)) if (d.photo) expect(d.credit).toBe(`Photo: ${standInOf(d.photo)!.photographer} / Pexels`)
    const talkOnly = lockedListSlides([week0Talk()], ['1 thing on', 'in Melbourne', 'this week'], ORIGIN)
    for (const sl of talkOnly) if (sl.t === 'days' || sl.t === 'week_cover') expect(standInOf(sl.photo)?.kind).toBe('talk')
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
    // Nights of no kind a stand-in shows (since out-12 a theatre night carries a theatre stage), so the cover is in type.
    const plain = { categorySlug: 'community' }
    const three = [at('2026-11-20T08:00:00Z', 'One', plain), at('2026-11-21T08:00:00Z', 'Two', plain), at('2026-11-22T02:30:00Z', 'Three', plain)]
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
    // Wider than its card with no break its rules allow, it keeps its main name before its colon (out-12), never 'SHOWTIME'
    // alone and never a break inside 'Dance Academy'.
    expect(keepTogether('Torquay Dance Academy: SHOWTIME')).toBe('Torquay\u00A0Dance\u00A0Academy')
    expect(keepTogether('Torquay Dance Academy: SHOWTIME', 30)).toBe('Torquay\u00A0Dance\u00A0Academy:\u00A0SHOWTIME')
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

describe("the PM's 20:40 fixes", () => {
  it("one ranking feeds Led by and the ask: Geelong's Leisurefest (45 letters) is named, not dropped, and opens the ask (fix 1)", async () => {
    const { ledOf } = await import('@/lib/social/campaign')
    const fest = night({ at: '2026-11-19T22:00:00Z', endDate: '2026-11-22T07:00:00Z', title: 'Geelong Caravanning and Adventure Leisurefest', venueName: 'Geelong Racecourse', host: 'Geelong Racecourse', categorySlug: 'festival', citySlug: 'geelong', cityName: 'Geelong' })
    const dance = night({ at: '2026-11-19T08:30:00Z', title: 'Geelong Dance Movement: A Passage Through Time', venueName: 'Geelong Arts Centre', host: 'Geelong Arts Centre', categorySlug: 'theatre', summary: 'A dance company on stage.', citySlug: 'geelong', cityName: 'Geelong' })
    const s = lockedListSlides([dance, fest], ['2 things on', 'in Geelong', 'this week'], ORIGIN)
    const cover = s[0] as Extract<Slide, { t: 'week_cover' }>
    const ask = s.at(-1) as Extract<Slide, { t: 'ask' }>
    const { led } = ledOf([dance, fest])
    expect(cover.draws).toBe(`Led by ${led.map((n) => cardTitle(n.title, 44)).join(' and ')}`)
    expect(ask.three.slice(0, led.length).map((r) => r.eventId)).toEqual(led.map((n) => n.eventId))
    expect(led[0].eventId).toBe(fest.eventId)
  })

  it("over a stand-in, every Led by night is of the photograph's kind: Dermot Kennedy alone, never Eternity beside him (fix 5)", () => {
    const dermot = night({ at: '2026-11-21T09:00:00Z', title: 'Dermot Kennedy', summary: null, venueName: 'Rod Laver Arena', host: 'Rod Laver Arena' })
    const eternity = night({ at: '2026-11-19T07:00:00Z', title: 'Eternity', summary: null, venueName: 'Melbourne Recital Centre', host: 'Melbourne Recital Centre' })
    const s = lockedListSlides([dermot, eternity], ['2 music', 'nights in Melbourne', 'this week'], ORIGIN)
    const cover = s[0] as Extract<Slide, { t: 'week_cover' }>
    expect(standInOf(cover.photo)?.kind).toBe('gig')
    // Since the PM's 03:45 fix 1, Eternity, with no classical word of its own, is a seated gig at the Recital Centre (no
    // longer a recital by its room): under a stage it is named beside Dermot Kennedy, under a crowd never (out-14's block).
    expect(cover.draws).toBe(standInOf(cover.photo)?.shot ? 'Led by Dermot Kennedy' : 'Led by Dermot Kennedy and Eternity')
    expect((s.at(-1) as Extract<Slide, { t: 'ask' }>).three[0].eventId).toBe(dermot.eventId)
  })

  it("an operator is never the place: Locals Live 2 at 'Bendigo Venues and Events' reads the time alone; a venue's spaces are single (fixes 2 and 3)", async () => {
    const { placeLine, isOperatorName } = await import('@/lib/social/campaign')
    expect(isOperatorName('Bendigo Venues and Events')).toBe(true)
    expect(isOperatorName('Federation Square')).toBe(false)
    expect(isOperatorName('The Capital')).toBe(false)
    const locals = night({ at: '2026-11-20T08:00:00Z', title: 'Locals Live 2', venueName: 'Bendigo Venues and Events', placeName: 'Bendigo Venues and Events', citySlug: 'bendigo', cityName: 'Bendigo' })
    expect(placeLine(locals)).toBe('')
    const cards = cardsOf(lockedListSlides([locals], ['1 thing on', 'in Bendigo', 'this week'], ORIGIN))
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every((r) => r.place === '')).toBe(true)
    expect(placeLine({ venueName: 'Tan Track  (Pillars of Wisdom)', placeName: 'Tan Track  (Pillars of Wisdom)', cityName: 'Melbourne' })).toBe('Tan Track (Pillars of Wisdom)')
  })

  it('nights only when every one starts at 5 pm or later; otherwise things (fix 4)', async () => {
    const { nightsWord } = await import('@/lib/social/campaign')
    const eve = night({ at: '2026-11-20T08:00:00Z' }) // 7 pm in Melbourne
    const morning = night({ at: '2026-11-21T00:00:00Z' }) // 11 am in Melbourne
    expect(nightsWord([eve])).toBe('nights')
    expect(nightsWord([eve, morning])).toBe('things')
    expect(nightsWord([eve], true)).toBe('night')
  })

  it("a joined run is measured in ems at the card's own width, so no name is wider than its column (fix 2)", () => {
    expect(keepTogether('Torquay Dance Academy: SHOWTIME', 8).includes(' ')).toBe(true)
    expect(keepTogether('Melbourne United vs New Zealand Breakers')).toBe('Melbourne\u00A0United vs\u00A0New\u00A0Zealand\u00A0Breakers')
  })
})

describe("the PM's 22:41 fixes (out-11, 9.3)", () => {
  it('fix 1: every day slide carries a photograph of its lead kind, and a piece with a bare one is refused', () => {
    const gig = night({ at: '2026-11-17T09:00:00Z', title: 'The Teskey Brothers', venueName: 'Forum Melbourne', host: 'Forum Melbourne' })
    const talk = night({ at: '2026-11-17T08:30:00Z', title: 'An Evening with Ben Macintyre', categorySlug: 'talks', summary: 'The author in conversation.', venueName: 'Melbourne Recital Centre', host: 'Melbourne Recital Centre' })
    const market = night({ at: '2026-11-18T00:00:00Z', title: 'Garden Market', categorySlug: 'community', summary: 'Stalls in the garden.', venueName: 'Ceres', host: 'Ceres', state: { tiers: [{ price: 0 }] } })
    const s = lockedListSlides([gig, talk, market], ['3 things on', 'in Melbourne', 'this week'], ORIGIN)
    const days = daysOf(s)
    expect(days.length).toBeGreaterThan(0)
    // The Tuesday holds a gig and a talk: since the PM's 02:25 fix 1 a standing crowd never stands over as many seated
    // nights, so the talk gives the band its kind (it was the gig, first by draw, at 22:41).
    const tue = days.find((d) => d.rows.some((r) => r.eventId === gig.eventId))!
    expect(standInOf(tue.photo)?.kind).toBe('talk')
    expect(tue.credit).toMatch(/Pexels/)
    const bare: Slide = { ...tue, photo: null, credit: null }
    expect(lockRefusal([s[0], bare, s.at(-1)!])).toMatch(/slide carries no photograph/)
  })

  it('fix 2: no stand-in photograph twice in the week, across every piece', () => {
    const at = (iso: string, title: string, extra: Partial<CampaignNight> = {}) => night({ at: iso, title, venueName: `${title} Hall`, host: `${title} Hall`, ...extra })
    const nights = [
      at('2026-11-16T09:00:00Z', 'Alpha Band'), at('2026-11-17T09:00:00Z', 'Beta Band'), at('2026-11-18T09:00:00Z', 'Gamma Band'),
      at('2026-11-19T09:00:00Z', 'Delta Band'), at('2026-11-20T09:00:00Z', 'Epsilon Band'), at('2026-11-21T09:00:00Z', 'Zeta Band'),
      at('2026-11-21T05:00:00Z', 'Eta Band'), at('2026-11-22T05:00:00Z', 'Theta Band'),
      at('2026-11-18T08:30:00Z', 'Laugh Lab', { categorySlug: 'comedy', summary: 'Stand up comedy.' }),
      at('2026-11-20T08:30:00Z', 'Bar Show', { categorySlug: 'comedy', summary: 'Stand up comedy.' }),
    ]
    const { pieces } = planCampaign({ nights, cities: [{ slug: 'melbourne', name: 'Melbourne' }], weekStart: '2026-11-16', origin: ORIGIN })
    const used = pieces.flatMap((p) => p.slides.map((sl) => ('photo' in sl ? sl.photo : null))).filter((u): u is string => Boolean(standInOf(u)))
    expect(used.length).toBeGreaterThan(0)
    expect(new Set(used).size).toBe(used.length)
  })

  it("fix 3: a studio tour is not a gig, so a concert crowd never stands over 'MESS Studio Tours'; a named tour still is", () => {
    const base = { summary: null, venueName: 'MESS', host: 'MESS', categorySlug: 'music' }
    expect(nightKind({ ...base, title: 'MESS Studio Tours' })).not.toBe('gig')
    expect(nightKind({ ...base, title: 'Kate Ceberano: Australian Made Tour 2026', venueName: "Her Majesty's Theatre Ballarat", host: "Her Majesty's Theatre Ballarat" })).toBe('gig')
    const robyn = night({ at: '2026-11-21T09:00:00Z', title: 'Robyn', venueName: 'Margaret Court Arena', host: 'Margaret Court Arena' })
    const mess = night({ at: '2026-11-22T00:00:00Z', title: 'MESS Studio Tours', venueName: 'MESS', host: 'MESS', summary: 'A guided walk through the studios.' })
    const s = lockedListSlides([robyn, mess], ['2 things on', 'in Melbourne', 'coming up'], ORIGIN)
    const cover = s[0] as Extract<Slide, { t: 'week_cover' }>
    expect(cover.draws).toBe('Led by Robyn')
    expect((s.at(-1) as Extract<Slide, { t: 'ask' }>).three[0].eventId).toBe(robyn.eventId)
  })

  it('fix 4: the ask reads the Led by nights first, then the rest by day and clock', () => {
    const lead = night({ at: '2026-11-19T09:00:00Z', title: 'The Roy Orbison Story', venueName: 'The Capital', host: 'The Capital', summary: 'A tribute band on tour.' })
    const tue = night({ at: '2026-11-16T23:30:00Z', title: 'Pevan and Sarah in Concert', venueName: 'Ulumbarra Theatre', host: 'Ulumbarra Theatre', summary: 'A concert.' })
    const sat = night({ at: '2026-11-21T03:00:00Z', title: 'Showtime', venueName: 'Ulumbarra Theatre', host: 'Ulumbarra Theatre', summary: 'A dance school concert.' })
    const s = lockedListSlides([sat, tue, lead], ['3 things on', 'in Bendigo', 'this week'], ORIGIN)
    const ask = s.at(-1) as Extract<Slide, { t: 'ask' }>
    const cover = s[0] as Extract<Slide, { t: 'week_cover' }>
    const led = (cover.draws ?? '').replace(/^Led by /, '')
    // A title may hold ' and ' itself ('Pevan and Sarah in Concert'), so the line is read from its start, never split.
    expect(led.startsWith(ask.three[0].title)).toBe(true)
    const rest = ask.three.filter((r) => !led.includes(r.title))
    const starts = rest.map((r) => Date.parse(r.startDate))
    expect(starts).toEqual([...starts].sort((x, y) => x - y))
  })
})

describe("out-12: five more kinds, read from the nights out-12 left bare (diag-12b.txt)", () => {
  const k = (title: string, categorySlug: string, venueName: string, summary: string | null = null) => nightKind({ title, categorySlug, venueName, host: venueName, summary })
  it('a music night at a concert hall or an estate is a concert; the room alone never makes a recital (the PM\'s 03:45 fix 1)', () => {
    expect(k('The Kim Wilde: Closer Tour', 'music', 'Costa Hall', '80s pop star Kim Wilde brings her Closer Tour.')).toBe('gig')
    expect(k('Boyz II Men', 'music', 'Mt Duneed Estate', 'Boyz II Men play A Day On The Green at Mt Duneed Estate.')).toBe('gig')
    // Out-12 read this night as a recital by its room; the PM's 03:45 ruled the room alone makes a seated gig, and its own
    // words ('An art song recital with piano') make the recital (the 03:45 block below).
    expect(k('Anne Sofie von Otter & Kristian Bezuidenhout', 'music', 'Melbourne Recital Centre')).toBe('gig')
    // A concert by its own title is music before a talk word in its summary (out-12's third draw: Bendigo's cover).
    expect(k('Pevan & Sarah in Concert 2026', 'music', 'Ulumbarra Theatre', "Children's music duo Pevan & Sarah bring their high-energy concert of singalongs that teach reading, maths and feelings.")).toBe('gig')
    expect(k('A Christmas Concert', 'music', 'St Paul', 'The choir sings carols.')).toBe('christmas')
    expect(k('Locals Live 2', 'music', 'Hargreaves Mall', 'A free all ages afternoon of Bendigo musicians in Hargreaves Mall for Aus Music Month.')).toBe('gig')
  })
  it('a match names its two sides; a run club in the sports category is no match', () => {
    expect(k('Australia v England Mens T20I', 'sports', 'Melbourne Cricket Ground')).toBe('sport')
    expect(k('Melbourne United vs New Zealand Breakers', 'sports', 'John Cain Arena')).toBe('sport')
    expect(k('Geelong v Collingwood', 'sports', 'GMHBA Stadium', 'A live band plays at half time.')).toBe('sport')
    // A fight by its own words, though production files 'Humanoid Fighting Championship' as music (out-12's fourth draw).
    expect(k('Humanoid Fighting Championship', 'music', 'Margaret Court Arena', 'An event on a Saturday evening, tickets through AXS.')).toBe('sport')
  })
  it('the week draws a photographer once while another of the kind is free (out-12: one shoot twice on Geelong\'s reel)', () => {
    const pick = standInChooser('the week')
    const first = pick('dance')!
    const second = pick('dance')!
    expect(second.photographer).not.toBe(first.photographer)
    expect(k('Run the Tan: Run Club', 'sports', 'Tan Track (Pillars of Wisdom)', 'A coach-supported walk, jog or run around the Tan for all levels.')).toBeNull()
  })
  it('dance shows, theatre, Christmas nights and a food market, each from its own words', () => {
    expect(k('Showtime: The Entertainers Performing Arts Studio', 'arts-community', 'Ulumbarra Theatre', 'A dance performance at Ulumbarra Theatre, Bendigo.')).toBe('dance')
    expect(k('Torquay Dance Academy: SHOWTIME: A World of Imagination', 'arts-community', 'The Play House', 'A performance at The Play House, Geelong Arts Centre.')).toBe('dance')
    expect(k('Out of this World: Motion Dance: Senior Show', 'arts-community', 'The Play House', 'A performance at The Play House, Geelong Arts Centre.')).toBe('dance')
    expect(k('Witness for the Prosecution', 'arts-community', '1 Sailors Gully Road, Eaglehawk', "Agatha Christie's courtroom drama staged in the Old Eaglehawk Court House.")).toBe('theatre')
    expect(k('GSODA Junior Players presents Curtain Up', 'family', 'The Story House', 'A family show at The Story House, Geelong Arts Centre.')).toBe('theatre')
    expect(k('Christmas Tree Lighting', 'community', 'Federation Square', 'An event on a Friday evening, free entry.')).toBe('christmas')
    expect(k("Christmas Opening Night: Denis Walter's Carols by the Bay", 'community', 'City of Greater Geelong', 'Carols, big screens, roving entertainment and Santa.')).toBe('christmas')
    expect(k('Geelong City Market', 'food-drink', 'Little Malop Street Central', 'A produce, food and drink market with local artisans.')).toBe('market')
    expect(k('The Melbourne Book Market', 'community', 'Queen Victoria Market', 'Weekend market of new and secondhand titles.')).toBeNull()
    expect(k('MESS Studio Tours', 'community', 'Federation Square', 'An event on a Saturday morning, free entry.')).toBeNull()
  })
  it('a venue slide never draws a stand-in whose venue band the guard faulted (screen 3), and every kind keeps one it may', () => {
    const marked = STAND_INS.filter((x) => x.venue === false)
    expect(marked.length).toBeGreaterThan(0)
    for (const kind of new Set(STAND_INS.map((x) => x.kind))) {
      expect(STAND_INS.some((x) => x.kind === kind && x.venue !== false), kind).toBe(true)
      const pick = standInChooser(`drill ${kind}`)
      for (let s = pick(kind, 'venue'); s; s = pick(kind, 'venue')) expect(s.venue, s.id).not.toBe(false)
    }
  })
  // Screen 2 (16 November 2026) took 19 out as day bands, leaving talk and market at two: the floor is two, never a repeat.
  it('every kind has at least two licensed stand-ins, each with its one line of what it shows', () => {
    for (const kind of ['gig', 'comedy', 'jazz', 'classical', 'talk', 'festival', 'dance', 'theatre', 'christmas', 'market', 'sport']) {
      const set = STAND_INS.filter((x) => x.kind === kind)
      expect(set.length, kind).toBeGreaterThanOrEqual(2)
      for (const x of set) expect(x.subject.length).toBeGreaterThan(4)
    }
  })
  it("when a kind's photographs are all used this week, the next night by draw's kind leads the slide, never a repeat", () => {
    const t20 = night({ at: '2026-11-21T08:00:00Z', title: 'Australia v England Mens T20I', categorySlug: 'sports', venueName: 'Melbourne Cricket Ground', host: 'MCG' })
    const gig = night({ at: '2026-11-21T09:00:00Z', title: 'The Teskey Brothers', venueName: 'Forum Melbourne', host: 'Forum Melbourne' })
    const used = new Set<string>()
    const noSport = (kind: string | null) => {
      if (kind === 'sport' || !kind) return null
      const s = STAND_INS.find((x) => x.kind === kind && !used.has(x.id)) ?? null
      if (s) used.add(s.id)
      return s
    }
    const s = lockedListSlides([t20, gig], ['2 things on', 'in Melbourne', 'this weekend'], ORIGIN, undefined, noSport)
    const cover = s[0] as Extract<Slide, { t: 'week_cover' }>
    expect(standInOf(cover.photo)?.kind).toBe('gig')
    expect(cover.draws).toBe('Led by The Teskey Brothers')
    for (const d of daysOf(s)) expect(standInOf(d.photo)?.kind).toBe('gig')
    expect(lockRefusal(s)).toBeNull()
  })
})

describe("the PM's 02:25 fixes (out-12 held 01, 03, 10 and 12: one class, the photograph reads another kind of night)", () => {
  const mel = (iso: string, title: string, extra: Partial<CampaignNight> & { state?: CtaInput } = {}) => night({ at: iso, title, ...extra })
  it('fix 1: a day band is the kind most of its nights share; a rock crowd never stands over a talk and a recital', () => {
    const mrc = { venueName: 'Melbourne Recital Centre', host: 'Melbourne Recital Centre' }
    const talk = mel('2026-11-16T08:30:00Z', 'An Evening with Ben Macintyre', { summary: 'The author in conversation.', ...mrc })
    const recital = mel('2026-11-18T08:30:00Z', 'Anne Sofie von Otter & Kristian Bezuidenhout', { summary: 'An art song recital with piano.', ...mrc })
    const lany = mel('2026-11-18T09:00:00Z', 'LANY', { summary: null, venueName: 'John Cain Arena', host: 'John Cain Arena' })
    const s = lockedListSlides([talk, recital, lany], ['3 things on', 'in Melbourne', 'this week'], ORIGIN)
    const slide = daysOf(s).find((d) => d.rows.some((r) => r.eventId === lany.eventId))!
    expect(['talk', 'classical']).toContain(standInOf(slide.photo)?.kind)
    // Two bands and a talk on one Friday: the bands are most, so the gig crowd stands.
    const g1 = mel('2026-11-20T09:00:00Z', 'The Band Night', { venueName: 'The Barwon Club', host: 'The Barwon Club' })
    const g2 = mel('2026-11-20T10:00:00Z', 'Another Band Night', { venueName: 'The Corner Hotel', host: 'The Corner Hotel' })
    const t2 = mel('2026-11-20T08:00:00Z', 'An Evening with a Historian', { summary: 'An author in conversation.', ...mrc })
    const s2 = lockedListSlides([g1, g2, t2], ['3 things on', 'in Melbourne', 'this weekend'], ORIGIN)
    expect(standInOf(daysOf(s2)[0].photo)?.kind).toBe('gig')
  })

  it('fix 2: a match draws its own sport, else a stadium crowd with no sport named, never another sport', () => {
    expect(sportOf({ title: 'Melbourne United vs New Zealand Breakers', summary: null })).toBe('basketball')
    expect(sportOf({ title: 'Melbourne Victory v Thể Công-Viettel', summary: null })).toBe('football')
    expect(sportOf({ title: "Australia v England Men's T20I", summary: null })).toBe('cricket')
    expect(sportOf({ title: 'Humanoid Fighting Championship', summary: null })).toBe('combat')
    const united = mel('2026-11-21T08:30:00Z', 'Melbourne United vs New Zealand Breakers', { categorySlug: 'sports', summary: null, venueName: 'John Cain Arena', host: 'John Cain Arena' })
    for (const sl of lockedListSlides([united], ['1 thing on', 'in Melbourne', 'this weekend'], ORIGIN)) {
      const st = 'photo' in sl ? standInOf(sl.photo) : null
      if (st) expect(st.sport ?? null).toBeNull()
    }
    const victory = mel('2026-11-25T08:45:00Z', 'Melbourne Victory v Thể Công-Viettel', { categorySlug: 'sports', summary: null, venueName: 'GMHBA Stadium', host: 'GMHBA Stadium', citySlug: 'geelong', cityName: 'Geelong' })
    const v = lockedListSlides([victory], ['1 thing on', 'in Geelong', 'coming up'], ORIGIN)
    expect(standInOf((v[0] as Extract<Slide, { t: 'week_cover' }>).photo)?.sport).toBe('football')
  })

  it("fix 3: a daytime children's show is a family show, never a gig; an evening junior show keeps its kind", () => {
    const b = { citySlug: 'bendigo', cityName: 'Bendigo' }
    const pevan = mel('2026-11-16T23:30:00Z', 'Pevan & Sarah in Concert 2026', { summary: "Children's music duo Pevan & Sarah bring their high-energy concert of singalongs that teach reading, maths and feelings.", venueName: 'Ulumbarra Theatre', host: 'Ulumbarra Theatre', ...b })
    expect(nightKind(pevan)).toBe('family')
    const roy = mel('2026-11-19T08:30:00Z', 'The Roy Orbison Story', { summary: 'A tribute band on tour.', venueName: 'The Capital', host: 'The Capital', ...b })
    const cover = lockedListSlides([pevan, roy], ['2 things on', 'in Bendigo', 'this week'], ORIGIN)[0] as Extract<Slide, { t: 'week_cover' }>
    expect(cover.draws).toBe('Led by The Roy Orbison Story')
    expect(standInOf(cover.photo)?.kind).toBe('gig')
    const curtain = mel('2026-11-20T08:30:00Z', 'GSODA Junior Players presents Curtain Up', { categorySlug: 'family', summary: 'A family show at The Story House.', venueName: 'Geelong Arts Centre', host: 'Geelong Arts Centre' })
    expect(nightKind(curtain)).toBe('theatre')
  })

  it('fix 4: the ask never takes a tier 4 session while a night of tiers 1 to 3 is on the post', () => {
    const b = { citySlug: 'ballarat', cityName: 'Ballarat' }
    const hm = { venueName: "Her Majesty's Theatre Ballarat", host: "Her Majesty's Theatre Ballarat" }
    const kate = mel('2026-11-19T08:00:00Z', 'Kate Ceberano: Australian Made Tour 2026', { ...hm, ...b })
    const diesel = mel('2026-11-21T08:30:00Z', 'Diesel by Request', { ...hm, ...b })
    const carly = mel('2026-11-18T23:30:00Z', 'Show-and-Tell with Carly', { summary: 'A show-and-tell session for children at Eureka Centre Ballarat, Ballarat.', venueName: 'Eureka Centre Ballarat', host: 'Eureka Centre Ballarat', state: { entryMode: 'walk_in', isFree: true }, ...b })
    const garden = mel('2026-11-22T00:00:00Z', 'Free Sunday Garden Tour', { summary: 'A volunteer-guided walk of about an hour through the botanical gardens.', venueName: 'Ballarat Botanical Gardens', host: 'Ballarat Botanical Gardens', state: { entryMode: 'walk_in', isFree: true }, ...b })
    expect(socialTierOf(carly)).toBe(4)
    const ask = lockedListSlides([carly, kate, diesel, garden], ['4 things on', 'in Ballarat', 'this week'], ORIGIN).at(-1) as Extract<Slide, { t: 'ask' }>
    expect(ask.three.map((r) => r.eventId)).not.toContain(carly.eventId)
    expect(ask.three.map((r) => r.eventId)).toContain(garden.eventId)
  })
})

describe("the PM's 03:45 fixes (out-13 held 02, 04, 09 and 12: a crowd over seated nights, a recital made by its room)", () => {
  const n2 = (iso: string, title: string, extra: Partial<CampaignNight> & { state?: CtaInput } = {}) => night({ at: iso, title, summary: null, ...extra })
  const mrc = { venueName: 'Melbourne Recital Centre', host: 'Melbourne Recital Centre' }
  const shotOf = (photo: string | null | undefined) => standInOf(photo ?? null)?.shot ?? 'stage'

  it('fix 1: the room alone never makes a recital, nor its name inside the summary; its own words do', () => {
    expect(nightKind({ title: 'SONARIO ft. Sean Riley', categorySlug: 'music', ...mrc, summary: 'Tickets through Melbourne Recital Centre.' })).toBe('gig')
    expect(nightKind({ title: 'A Night of Song', categorySlug: 'music', venueName: 'Recital Hall', host: 'Recital Hall', summary: 'At the Recital Hall, a string quartet plays.' })).toBe('classical')
    expect(nightKind({ title: 'Searows', categorySlug: 'music', ...mrc, summary: 'An event on a Tuesday evening, tickets through Melbourne Recital Centre.' })).toBe('gig')
    expect(nightKind({ title: 'Anne Sofie von Otter & Kristian Bezuidenhout', categorySlug: 'music', ...mrc, summary: 'An art song recital with piano.' })).toBe('classical')
    expect(seatedNight({ title: 'Searows', categorySlug: 'music', ...mrc, summary: null })).toBe(true)
  })

  it('04: an arena pop show beside two recital hall nights takes a stage with no crowd, never violins', () => {
    const robyn = n2('2026-11-24T08:00:00Z', 'Robyn', { venueName: 'Rod Laver Arena', host: 'Rod Laver Arena' })
    const searows = n2('2026-11-24T08:30:00Z', 'Searows', mrc)
    const sonario = n2('2026-11-26T08:00:00Z', 'SONARIO ft. Sean Riley', mrc)
    const s = lockedListSlides([robyn, searows, sonario], ['3 things worth', 'planning for', 'in Melbourne'], ORIGIN)
    const day = daysOf(s).find((d) => d.rows.some((r) => r.eventId === robyn.eventId))!
    expect(standInOf(day.photo)?.kind).not.toBe('classical')
    expect(shotOf(day.photo)).toBe('stage')
  })

  it('02: a fight night and a talk at the Recital Centre take a stage or room, never a standing crowd', () => {
    const fight = n2('2026-11-21T08:30:00Z', 'Humanoid Fighting Championship', { categorySlug: 'sports', venueName: 'Margaret Court Arena', host: 'Margaret Court Arena' })
    const talk = n2('2026-11-22T00:00:00Z', 'An Evening with Alastair Campbell', { summary: 'The author in conversation.', ...mrc })
    const s = lockedListSlides([fight, talk], ['2 things on', 'in Melbourne', 'this weekend'], ORIGIN)
    for (const d of daysOf(s)) expect(shotOf(d.photo)).toBe('stage')
  })

  it('09: a 1:00 pm psychic show at Costa Hall beside a concert takes a stage, never a crowd', () => {
    const edward = n2('2026-11-28T02:00:00Z', 'Psychic Medium John Edward', { categorySlug: 'arts-community', venueName: 'Costa Hall', host: 'Costa Hall', citySlug: 'geelong', cityName: 'Geelong' })
    const boyz = n2('2026-11-28T05:00:00Z', 'Boyz II Men', { venueName: 'Mt Duneed Estate', host: 'Mt Duneed Estate', citySlug: 'geelong', cityName: 'Geelong' })
    expect(seatedNight(edward)).toBe(true)
    const s = lockedListSlides([edward, boyz], ['2 things worth', 'planning for', 'in Geelong'], ORIGIN)
    const day = daysOf(s).find((d) => d.rows.some((r) => r.eventId === edward.eventId))!
    expect(shotOf(day.photo)).toBe('stage')
  })

  it('12: two shows at a heritage theatre take stages, never pyrotechnics, and no post draws two pyrotechnic shots', () => {
    const hm = { venueName: "Her Majesty's Theatre Ballarat", host: "Her Majesty's Theatre Ballarat", citySlug: 'ballarat', cityName: 'Ballarat' }
    const kate = n2('2026-11-19T08:00:00Z', 'Kate Ceberano: Australian Made Tour 2026', hm)
    const diesel = n2('2026-11-21T08:30:00Z', 'Diesel by Request', hm)
    const s = lockedListSlides([kate, diesel], ['2 things on', 'in Ballarat', 'this week'], ORIGIN)
    const shots = s.filter((x) => x.t === 'week_cover' || x.t === 'days').map((x) => shotOf('photo' in x ? x.photo : null))
    expect(shots.every((x) => x === 'stage')).toBe(true)
    // Standing gigs at a club take crowds, but never two pyrotechnic shots in one post.
    const club = (iso: string, t: string) => n2(iso, t, { venueName: 'The Corner Hotel', host: 'The Corner Hotel' })
    const loud = lockedListSlides([club('2026-11-16T09:00:00Z', 'Band One'), club('2026-11-17T09:00:00Z', 'Band Two'), club('2026-11-18T09:00:00Z', 'Band Three'), club('2026-11-19T09:00:00Z', 'Band Four'), club('2026-11-20T09:00:00Z', 'Band Five'), club('2026-11-21T09:00:00Z', 'Band Six')], ['6 things on', 'in Melbourne', 'this week'], ORIGIN)
    const pyro = loud.filter((x) => 'photo' in x && shotOf(x.photo) === 'pyro').length
    expect(pyro).toBeLessThanOrEqual(1)
  })
})

describe("out-14, the rest of the 03:45 class: the venue slide and the chooser itself", () => {
  const mrc = { venueName: 'Melbourne Recital Centre', host: 'Melbourne Recital Centre' }
  it("a venue's week over a seated room takes a stage or room, never a crowd, whatever the week's draw", () => {
    for (let i = 0; i < 8; i += 1) {
      const nights = [night({ at: '2026-11-24T08:30:00Z', title: 'Searows', summary: null, ...mrc }), night({ at: '2026-11-26T08:00:00Z', title: 'SONARIO ft. Sean Riley', summary: null, ...mrc })]
      const v = venueSlideOf('Melbourne Recital Centre', nights, ORIGIN, standInChooser(`venue ${i}`))
      expect(standInOf(v.photo)?.kind).toBe('gig')
      expect(standInOf(v.photo)?.shot).toBeUndefined()
    }
  })

  it('the chooser: stage only never hands a crowd; a pyrotechnic shot never twice; a crowd family passed over while a stage is free', () => {
    for (let i = 0; i < 8; i += 1) {
      const pick = standInChooser(`chooser ${i}`)
      for (let j = 0; j < 4; j += 1) expect(pick('gig', undefined, null, { stageOnly: true })?.shot).toBeUndefined()
    }
    const pick = standInChooser('pyro once')
    const shots = Array.from({ length: 12 }, () => pick('gig', undefined, null, { avoid: new Set(['pyro']) })?.shot)
    expect(shots).not.toContain('pyro')
    const fresh = standInChooser('avoid crowd')
    expect(fresh('gig', undefined, null, { avoid: new Set(['crowd', 'pyro']) })?.shot).toBeUndefined()
  })

  it("a crowd cover names only nights that stand: Eternity, a seated gig at the Recital Centre, is never named under it", () => {
    const dermot = night({ at: '2026-11-21T09:00:00Z', title: 'Dermot Kennedy', summary: null, venueName: 'Rod Laver Arena', host: 'Rod Laver Arena' })
    const eternity = night({ at: '2026-11-19T07:00:00Z', title: 'Eternity', summary: null, ...mrc })
    expect(nightKind(eternity)).toBe('gig')
    expect(seatedNight(eternity)).toBe(true)
    for (let i = 0; i < 8; i += 1) {
      const s = lockedListSlides([dermot, eternity], ['2 music', 'nights in Melbourne', `this week ${i}`], ORIGIN)
      const cover = s[0] as Extract<Slide, { t: 'week_cover' }>
      if (standInOf(cover.photo)?.shot) expect(cover.draws).toBe('Led by Dermot Kennedy')
    }
  })

  it('every crowd and pyrotechnic shot is marked by looking (13230484: a concert crowd across the front)', () => {
    expect(STAND_INS.find((x) => x.id === '13230484')?.shot).toBe('crowd')
    expect(STAND_INS.filter((x) => x.shot === 'pyro').map((x) => x.id).sort()).toEqual(['30215324', '36257830'])
    expect(STAND_INS.filter((x) => x.kind === 'gig' && !x.shot).length).toBeGreaterThanOrEqual(7)
  })
})
