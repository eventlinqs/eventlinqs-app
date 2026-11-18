import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine, type CtaInput } from '@/lib/events/cta'
import { compositionFor, creativeRefusals, ORGANISER_OFFER_FILE, dayInWeek, hostOf, pieceRefusal, venueOf, planCampaign, selectNights, weekStartOf, type CampaignCity, type CampaignNight, type PiecePlan } from '@/lib/social/campaign'
import { captionMarkFaults } from '@/lib/social/caption-marks'

/*
 * THE WEEKLY CAMPAIGN (the release checklist of 28 October 2026: A1, B2, C1 to C9, J1 to J5, J10, J11, J13; Lawal's
 * 13:53 and the project manager's 14:08). One campaign a week; every piece one audience, one objective, one purpose,
 * one call to action and one measurable outcome, with its Instagram and Facebook versions; a photograph only with an
 * approved rights row, else a typographic slot and a drafted image request; the venue spotlight and the organiser
 * campaign are separate assets.
 */

const ORIGIN = 'https://www.eventlinqs.com.au'
const WEEK = '2026-10-26'
const CITIES: CampaignCity[] = [
  { slug: 'geelong', name: 'Geelong' },
  { slug: 'ballarat', name: 'Ballarat' },
]
const APPROVED = 'https://example.supabase.co/storage/v1/object/public/event-images/organisers/bp-approved.jpg'

let seq = 0
function night(over: Partial<CampaignNight> & { at: string; state?: CtaInput }): CampaignNight {
  seq += 1
  const cta = ctaFor(over.state ?? { entryMode: 'walk_in', isFree: true })
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `bp-night-${seq}`,
    title: `Bp Night ${seq}`,
    startDate: over.at,
    timezone: 'Australia/Melbourne',
    citySlug: 'geelong',
    cityName: 'Geelong',
    venueName: 'The Barwon Club',
    host: 'The Barwon Club',
    categorySlug: 'music',
    summary: 'A night of local bands in the front bar. Doors at seven.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $25' }),
    ...over,
  }
}

const geelongWeek = [
  night({ at: '2026-10-27T09:00:00Z', approvedPhotoUrl: APPROVED, photoCredit: 'Jo Bloggs for The Barwon Club' }), // Tue 8pm
  night({ at: '2026-10-29T09:00:00Z', host: 'Sailors Rest', venueName: "Sailors' Rest", state: { tiers: [{ price: 2500 }] } }), // Thu
  night({ at: '2026-10-30T09:00:00Z', state: { externalTicketUrl: 'https://events.humanitix.com/x', providerName: 'Humanitix' } }), // Fri
  night({ at: '2026-10-31T03:00:00Z', host: 'Geelong City Market', venueName: 'Little Malop Street', categorySlug: 'family' }), // Sat 2pm
  night({ at: '2026-11-01T07:00:00Z', host: 'Costa Hall', venueName: 'Costa Hall', categorySlug: 'festival', state: { tiers: [], isFree: false } }), // Sun 6pm, price unknown
]
const ballaratOne = [night({ at: '2026-10-31T09:00:00Z', citySlug: 'ballarat', cityName: 'Ballarat', host: 'Hop Temple', venueName: 'Hop Temple' })]
const outside = [night({ at: '2026-11-03T09:00:00Z' })] // next week

const plan = () => planCampaign({ nights: [...geelongWeek, ...ballaratOne, ...outside], cities: CITIES, weekStart: WEEK, origin: ORIGIN })
/* A busy week (the PM's 16:40 fix 3: two list posts in one city and one week share at most one night): five headline
   nights Monday to Thursday carry the week post, so the later list posts have nights of their own. */
function busyWeek(at: (o: Partial<CampaignNight> & { at: string; state?: CtaInput }) => CampaignNight) {
  const h = (when: string, venue: string, categorySlug: string) => at({ at: when, venueName: venue, host: venue, categorySlug, state: { tiers: [{ price: 9900 }] } })
  return [
    h('2026-10-26T09:00:00Z', 'Costa Hall', 'theatre'),
    h('2026-10-27T09:00:00Z', 'Rod Laver Arena', 'sport'),
    h('2026-10-27T10:00:00Z', 'Hamer Hall', 'dance'),
    h('2026-10-28T09:00:00Z', 'Palais Theatre', 'family'),
    h('2026-10-29T09:00:00Z', 'Regent Theatre', 'arts'),
  ]
}
const busyPlan = () => planCampaign({ nights: [...geelongWeek, ...busyWeek(night), ...ballaratOne, ...outside], cities: CITIES, weekStart: WEEK, origin: ORIGIN })
const of = (pieces: PiecePlan[], kind: PiecePlan['kind'], city?: string) => pieces.filter((p) => p.kind === kind && (city === undefined || p.city === city))

describe('the week', () => {
  it('starts on the Monday in Melbourne, whatever the server zone', () => {
    expect(weekStartOf(new Date('2026-10-28T03:00:00Z'))).toBe('2026-10-26')
    expect(weekStartOf(new Date('2026-11-01T13:30:00Z'))).toBe('2026-11-02')
  })
  it('places a night on its Melbourne day', () => {
    expect(dayInWeek(geelongWeek[3], WEEK)).toBe(5)
    expect(dayInWeek(outside[0], WEEK)).toBe(-1)
  })
  it('chooses a composition by category and admission', () => {
    expect(compositionFor(geelongWeek[0])).toBe('concert')
    expect(compositionFor(geelongWeek[3])).toBe('family')
    expect(compositionFor({ categorySlug: 'workshops', cta: ctaFor({ entryMode: 'walk_in', isFree: true }) })).toBe('free')
  })
})

describe('one campaign, not loose posts (B2, C4 to C9, J11)', () => {
  const { pieces, imageRequests } = plan()

  // Caption standard version 2 for the brand post too (read on production at 02:42 on 19 November 2026: it was the one
  // caption still drawn with blank lines after #304).
  it('the brand post takes caption standard version 2: no blank line, its ticket link line, hashtags last', () => {
    const [brand] = of(pieces, 'brand_campaign')
    for (const c of [brand.caption, brand.versions.instagram.caption, brand.versions.facebook.caption]) {
      expect(c).not.toMatch(/\n\s*\n/)
      expect(c.trim().split('\n').at(-1)).toBe('#VictoriaEvents #EventLinqs')
    }
    expect(brand.versions.instagram.caption).toContain("\u{1F39F} What's on: link in our bio")
    expect(brand.versions.facebook.caption).toContain(`\u{1F39F} What's on:\n${ORIGIN}/events`)
  })

  it('Monday: the week ahead per city with two or more nights, to /city/<city>', () => {
    const [ahead] = of(pieces, 'week_ahead', 'geelong')
    expect(ahead.link).toBe(`${ORIGIN}/city/geelong`)
    expect(ahead.eventIds).toHaveLength(5)
    // The 9.5 locked look (the PM's 17:10 of 15 November 2026): the week's cover first, Lawal's ask last.
    // Caption standard version 2 (Lawal's 20:44 of 18 November 2026): the count is drawn from the rows, never 'things'.
    expect(ahead.slides[0]).toMatchObject({ t: 'week_cover', composition: 'contents_cover', lines: ['5 events on', 'in Geelong', 'this week'] })
    expect(ahead.slides.at(-1)).toMatchObject({ t: 'ask', composition: 'close', count: 5 })
    expect(ahead.versions.instagram.hook).toMatch(/^\p{Extended_Pictographic}\uFE0F? Five events in Geelong this week\.$/u)
    expect(JSON.stringify(ahead)).not.toMatch(/\bthings\b/)
    expect(of(pieces, 'week_ahead', 'ballarat')).toHaveLength(0)
    expect(ahead.eventIds).not.toContain(outside[0].eventId)
  })

  it('Thursday: the weekend carousel, Friday to Sunday, to the page that lists every night it shows (J15)', () => {
    const [w] = of(busyPlan().pieces, 'weekend_carousel', 'geelong')
    /* It shows a paid night, which the free week page does not list, so it goes to the city page. */
    expect(w.link).toBe(`${ORIGIN}/city/geelong`)
    expect(w.eventIds).toEqual([geelongWeek[2], geelongWeek[3], geelongWeek[4]].map((n) => n.eventId))
  })

  it('Wednesday: one Discovery Reel of three to five nights as 9:16 frames', () => {
    const reels = of(pieces, 'discovery_reel')
    expect(reels).toHaveLength(1)
    expect(reels[0]).toMatchObject({ format: 'story', city: 'geelong' })
    expect(reels[0].versions.instagram.crop).toBe('9:16')
  })

  it('Friday: the venue spotlight for attendees and the organiser campaign for organisers, separate (J11)', () => {
    const [s] = of(pieces, 'venue_spotlight')
    expect(s).toMatchObject({ audience: 'attendees', objective: 'audience_growth', link: `${ORIGIN}/city/geelong` })
    // Family E in the locked look (the PM's 17:10 of 15 November 2026): one slide, the venue's week.
    expect(s.slides.map((x) => x.t)).toEqual(['venue'])
    const [o] = of(pieces, 'organiser_campaign')
    /* The canonical page, never /for-organisers, which 308s to it (src/app/for-organisers/page.tsx; Law 5). */
    expect(o).toMatchObject({ audience: 'organisers', objective: 'organiser_growth', link: `${ORIGIN}/organisers`, eventIds: [] })
    expect([o.nextStep, o.caption, o.versions.instagram.caption, o.versions.facebook.caption, JSON.stringify(o.slides)].join(' ')).not.toContain('/for-organisers')
  })

  // Family G (the PM's 23:38 of 18 November 2026, item 3): the organiser campaign is the approved organiser offer, posted as
  // Lawal approved it, with his approved words; it promises nothing the approved post does not.
  it('the organiser campaign is the approved offer with Lawal approved words, and promises nothing more', () => {
    const [o] = of(pieces, 'organiser_campaign')
    expect(o.slides[0]).toMatchObject({ t: 'file', url: ORGANISER_OFFER_FILE })
    expect(o.caption).toContain("List your event on EventLinqs: get discovered on your city's guide, sell tickets, promote it with your launch kit, and keep every attendee relationship yours.")
    expect(o.caption).not.toMatch(/each week we send|every week we send/i)
    // The PM's 06:39 of 18 November 2026, item 3: no claim that a link counts who it sends.
    for (const text of [o.caption, o.versions.instagram.caption, o.versions.facebook.caption]) expect(text).not.toMatch(/counts who|who it sends/i)
    /* And the launch kit it names is real: every host featured this week has its own kit. */
    expect(of(pieces, 'partner_kit').length).toBeGreaterThan(0)
  })

  it("a partner kit for every host featured, with no message drafted until the project manager's text lands (Lawal, 14:59)", () => {
    const kits = of(pieces, 'partner_kit')
    expect(kits.map((k) => k.partnerName).sort()).toEqual(['Costa Hall', 'Geelong City Market', 'Sailors Rest', 'The Barwon Club'])
    for (const k of kits) {
      expect(k).toMatchObject({ audience: 'partners', format: 'story' })
      expect(k.message).toBeNull()
      expect(k.slides[0]).toMatchObject({ t: 'story', chip: 'Featured on EventLinqs' })
    }
  })

  it('at least three strong pieces plus partner kits (C9)', () => {
    expect(pieces.filter((p) => p.kind !== 'partner_kit').length).toBeGreaterThanOrEqual(3)
  })

  it('every piece is whole: audience, objective, purpose, call to action, outcome, a real link (C1, C2, J10)', () => {
    for (const p of pieces) expect(pieceRefusal(p), `${p.kind} ${p.city}`).toBeNull()
  })

  it('a piece missing its one audience, its one purpose or its one next step is refused (C2)', () => {
    const whole = pieces[0]
    expect(pieceRefusal({ ...whole, audience: undefined as never })).toMatch(/one audience/)
    expect(pieceRefusal({ ...whole, audience: 'everyone' as never })).toMatch(/one audience/)
    expect(pieceRefusal({ ...whole, purpose: ' ' })).toMatch(/one purpose/)
    expect(pieceRefusal({ ...whole, nextStep: '' })).toMatch(/one call to action/)
  })

  /* The project manager's ruling of 29 October 2026, 14:52: the same one rule as a post's words (src/lib/social/words.ts). */
  it('a night whose own title carries the banned word is quoted exactly, and our own words never carry it', () => {
    const amcf = night({ at: '2026-10-31T00:00:00Z', title: 'African Music and Cultural Festival 2026', host: 'AMCF', venueName: 'Fed Square', categorySlug: 'festival' })
    const { pieces: withAmcf } = planCampaign({ nights: [...geelongWeek, amcf], cities: CITIES, weekStart: WEEK, origin: ORIGIN })
    const quoting = withAmcf.filter((p) => p.eventIds.includes(amcf.eventId))
    expect(quoting.length).toBeGreaterThan(0)
    for (const p of quoting) {
      expect(p.names).toContain('African Music and Cultural Festival 2026')
      expect(pieceRefusal(p), `${p.kind} ${p.city}`).toBeNull()
    }
    const p = quoting[0]
    expect(pieceRefusal({ ...p, caption: `${p.caption}\n\nA cultural weekend.` })).toMatch(/banned word/)
    expect(pieceRefusal({ ...p, versions: { ...p.versions, instagram: { ...p.versions.instagram, caption: `${p.versions.instagram.caption} #culture` } } })).toMatch(/banned word/)
    expect(pieceRefusal({ ...p, slides: [...p.slides, { ...p.slides[0], headline: 'Our cultural pick' } as never] })).toMatch(/banned word/)
    expect(pieceRefusal({ ...p, names: [] })).toMatch(/banned word/)
  })

  it('a night whose own description carries the word is drawn without that line, and its pieces are kept', () => {
    const games = night({ at: '2026-10-30T05:00:00Z', title: "Children's Week: Multicultural Board Games", host: 'Geelong Regional Libraries', summary: 'Children share and play board games from different cultures. Bring a friend.' })
    const { pieces: withGames } = planCampaign({ nights: [...geelongWeek, games], cities: CITIES, weekStart: WEEK, origin: ORIGIN })
    const carrying = withGames.filter((p) => p.eventIds.includes(games.eventId))
    expect(carrying.length).toBeGreaterThan(0)
    for (const p of carrying) {
      expect(JSON.stringify(p.slides)).not.toContain('different cultures')
      expect(pieceRefusal(p), `${p.kind} ${p.city}`).toBeNull()
    }
  })

  it('a photograph only with an approved rights row; otherwise the slide is typographic (J1 to J4)', () => {
    const [ahead] = of(pieces, 'week_ahead', 'geelong')
    // The night with its approved photograph leads: the cover shows it whole, and it has its own slide; no other night's.
    expect(ahead.slides[0]).toMatchObject({ t: 'week_cover', photoEventId: geelongWeek[0].eventId, photo: APPROVED })
    expect(ahead.slides.filter((s) => s.t === 'feature').map((s) => (s as { eventId: string; photo: string }).eventId)).toEqual([geelongWeek[0].eventId])
    // Any other photograph on any piece is the approved one or a stand-in of the night's kind, served from our own origin.
    for (const p of pieces) for (const s of p.slides) if ('photo' in s && s.photo) expect(s.photo === APPROVED || s.photo.startsWith(`${ORIGIN}/social/stand-ins/`), s.photo).toBe(true)
    expect(ahead.caption).toContain('Photo: Jo Bloggs for The Barwon Club')
    expect(JSON.stringify(pieces)).not.toContain('/stock/')
  })

  it('every night without a usable image is listed to ask its organiser for one, with no words drafted (J5, Lawal 14:59)', () => {
    const asked = imageRequests.map((r) => r.eventId)
    expect(asked).not.toContain(geelongWeek[0].eventId)
    expect(asked).toEqual(expect.arrayContaining([geelongWeek[1].eventId, geelongWeek[3].eventId]))
    for (const r of imageRequests) expect(Object.keys(r).sort()).toEqual(['eventId', 'hostName'])
  })

  it('every night slide carries its chip from the one call to action, and an unknown price none', () => {
    const [ahead] = of(pieces, 'week_ahead', 'geelong')
    // In the locked look a night is a gold timed card on its day's slide: FREE only where its call to action is free.
    const rows = ahead.slides.flatMap((s) => (s.t === 'days' ? s.rows : []))
    expect(new Map(rows.map((r) => [r.eventId, r.free]))).toEqual(new Map(geelongWeek.map((n, i) => [n.eventId, i === 0 || i === 3])))
  })

  it('Instagram and Facebook versions differ where the platforms do (J13)', () => {
    const [ahead] = of(pieces, 'week_ahead', 'geelong')
    expect(ahead.versions.instagram.caption).toContain('link in our bio')
    expect(ahead.versions.instagram.caption).not.toContain('https://')
    expect(ahead.versions.facebook.caption).toContain(`${ORIGIN}/city/geelong`)
    expect(ahead.versions.instagram.hook).toBe(ahead.versions.facebook.hook)
  })

  // Caption standard version 2: a row a night with no emoji (the signposts are said once), at most five emoji, the link
  // line led by its ticket, three tags last, no exclamation mark outside the hook, no long dash.
  it('captions: one row a night with no emoji, the marks of version 2, three tags last', () => {
    const [ahead] = of(pieces, 'week_ahead', 'geelong')
    for (const c of [ahead.versions.instagram.caption, ahead.versions.facebook.caption]) {
      const rows = c.split('\n').filter((l) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}, /.test(l))
      expect(rows).toHaveLength(5)
      for (const r of rows) expect(r).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(captionMarkFaults(c)).toEqual([])
      expect((c.match(/#\w+/g) ?? []).length).toBe(3)
      expect(c.split('\n').at(-1)).toMatch(/^#GeelongEvents #\w+ #EventLinqs$/)
    }
    expect(ahead.versions.instagram.caption).toContain('\u{1F39F} Times and tickets for all five: link in our bio')
    expect(ahead.versions.facebook.caption).toContain(`\u{1F39F} Times and tickets for all five:\n${ORIGIN}/city/geelong`)
  })
})

describe('the destination lists every night advertised (J15)', () => {
  it('an all free weekend goes to the free week page', () => {
    // A Tuesday night too, so the week's list is not the weekend's own (a later piece repeating a list drops itself).
    const free = [night({ at: '2026-10-27T09:00:00Z' }), night({ at: '2026-10-30T09:00:00Z' }), night({ at: '2026-10-31T09:00:00Z' })]
    const [w] = of(planCampaign({ nights: free, cities: CITIES, weekStart: WEEK, origin: ORIGIN }).pieces, 'weekend_carousel', 'geelong')
    expect(w.link).toBe(`${ORIGIN}/free/geelong/this-week`)
  })
})

describe('the editorial selection (K6)', () => {
  it('says why each night was picked', () => {
    const [ahead] = of(plan().pieces, 'week_ahead', 'geelong')
    expect(ahead.picks).toHaveLength(ahead.eventIds.length)
    for (const p of ahead.picks) expect(p.reason).toMatch(/^Picked: on /)
    expect(ahead.picks.find((p) => p.eventId === geelongWeek[0].eventId)?.reason).toContain('an image its owner approved')
  })
  it('takes no more than two of one venue or three of one category, and does not score free down', () => {
    const same = ['27', '28', '29', '30'].map((d) => night({ at: `2026-10-${d}T09:00:00Z`, venueName: 'One Room', categorySlug: 'music' }))
    const other = night({ at: '2026-10-31T09:00:00Z', venueName: 'Another Room', categorySlug: 'family', state: { entryMode: 'walk_in', isFree: true } })
    const { nights } = selectNights([...same, other], 5)
    expect(nights.filter((n) => n.venueName === 'One Room')).toHaveLength(2)
    expect(nights.map((n) => n.eventId)).toContain(other.eventId)
  })
  it('never brings back a night the founder left out', () => {
    const out = new Set([geelongWeek[1].eventId])
    const { pieces } = planCampaign({ nights: geelongWeek, cities: CITIES, weekStart: WEEK, origin: ORIGIN, excluded: out })
    for (const p of pieces) expect(p.eventIds).not.toContain(geelongWeek[1].eventId)
  })
  it('is photo led only where an approved image exists, else type led (path B, K1)', () => {
    const { pieces } = plan()
    expect(of(pieces, 'week_ahead', 'geelong')[0].mode).toBe('photo_led')
    expect(of(busyPlan().pieces, 'weekend_carousel', 'geelong')[0].mode).toBe('type_led')
  })
})

describe('a piece that is not whole is refused (C2, J10, J11)', () => {
  const [p] = plan().pieces
  it.each([
    ['no audience', { audience: 'everyone' as never }],
    ['no objective', { objective: 'reach' as never }],
    ['no purpose', { purpose: ' ' }],
    ['no call to action', { nextStep: '' }],
    ['no outcome', { outcome: '' }],
    ['no real page', { link: '/city/geelong' }],
    // Caption standard version 2: one exclamation mark at most, in the hook only; an emoji always (the PM's 21:00).
    ['an exclamation outside the hook', { caption: '\u{1F389} Big night.\nBe there!' }],
    ['two exclamation marks', { caption: '\u{1F389} Big night! Be there!' }],
    ['no emoji', { caption: 'Big night.' }],
    ['six emoji', { caption: '\u{1F389} Big night.\n\u{1F4CD} A\n\u{1F4C5} B\n\u{1F4B2} C\n\u{1F39F} D\n\u{1F3B6} E' }],
    ['an organiser campaign advertising a night', { kind: 'organiser_campaign' as const }],
  ])('%s', (_name, over) => {
    expect(pieceRefusal({ ...p, ...over })).not.toBeNull()
  })
})

describe('the creative checks before approval (K10, K12)', () => {
  const [ahead] = of(plan().pieces, 'week_ahead', 'geelong')
  const nights = new Map(geelongWeek.map((n) => [n.eventId, { venueName: n.venueName, title: n.title }]))
  it('a planned piece passes them', () => {
    expect(creativeRefusals(ahead, nights)).toEqual([])
  })
  it('refuses too many tags, an exclamation, a missing call to action, words past the limit, and a place the night does not hold', () => {
    const bad = {
      slides: ahead.slides.map((s) => (s.t === 'days' ? { ...s, rows: s.rows.map((r) => ({ ...r, place: 'Somewhere Else' })) } : s)),
      versions: {
        instagram: { ...ahead.versions.instagram, caption: `${ahead.versions.instagram.caption} #a #b #c #d`, cta: '' },
        facebook: { ...ahead.versions.facebook, caption: `\u{1F389} ${'x'.repeat(2300)}\nBe there!` },
      },
    }
    const said = creativeRefusals(bad, nights).join(' ')
    expect(said).toMatch(/carry \d+ tags/)
    expect(said).toMatch(/no call to action/)
    expect(said).toMatch(/over 2200/)
    expect(said).toMatch(/exclamation mark/)
    expect(said).toMatch(/not the night's venue/)
  })
})

describe('the host a night is shown under (ruling A of 23 October 2026)', () => {
  it("an EventLinqs listing is its venue's, and the listings organisation is named nowhere", () => {
    expect(hostOf({ listingSource: 'eventlinqs', organisationName: 'EventLinqs listings', organisationSlug: 'eventlinqs-listings', venueName: 'The Barwon Club' })).toBe('The Barwon Club')
    expect(hostOf({ listingSource: 'organiser', organisationName: 'EventLinqs listings', organisationSlug: 'eventlinqs-listings', venueName: 'Fed Square' })).toBe('Fed Square')
  })
  it('a research note in the venue field is never a place on a slide nor a partner', () => {
    expect(venueOf('Organiser not named on listing (Malaysian Victoria community contact)')).toBeNull()
    expect(venueOf('Organiser not named (stall bookings via Issimo Markets)')).toBeNull()
    expect(venueOf('Costa Hall')).toBe('Costa Hall')
    expect(hostOf({ listingSource: 'eventlinqs', organisationName: 'EventLinqs listings', organisationSlug: 'eventlinqs-listings', venueName: 'Organiser not named on listing' })).toBeNull()
  })
  it("an organiser's own night is its organisation's", () => {
    expect(hostOf({ listingSource: 'organiser', organisationName: 'Harbour Lights Collective', organisationSlug: 'harbour-lights', venueName: 'The Wharf' })).toBe('Harbour Lights Collective')
  })
})
