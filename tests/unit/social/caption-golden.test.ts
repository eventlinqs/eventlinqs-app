import { describe, expect, it } from 'vitest'
import { ctaFor } from '@/lib/events/cta'
import { listCaptions, listEmoji, countPhrase, rowLine, standardTags, tagWord, type CampaignNight } from '@/lib/social/campaign'
import { captionMarkFaults } from '@/lib/social/caption-marks'
import { posterCaption } from '@/lib/social/daily-posters'

/*
 * THE GOLDEN CASES (the PM's 21:40 of 18 November 2026): Lawal's own Kate Ceberano caption, word for word
 * (START-16OCT/OPS-DIRECTIVE-LOCKED-18NOV.md, item 5), and the three samples of caption standard version 2 as they stand
 * (C:/dev/GROWTH/CAPTION-STANDARD-18NOV.md; Lawal's approval of 20:44). Each test quotes its golden text and holds the
 * engine's caption to it line by line. Where a golden line cannot come from a listing's own facts, the test says which line
 * and why, and holds the engine's own line instead:
 *   - a pronoun is never guessed from a name ('her Closer Tour' is written 'the Closer Tour');
 *   - a seller's fee the row does not hold is not printed ('plus the venue's $6.95 transaction fee');
 *   - a sentence a person wrote about the week ('all under one roof', 'with a full orchestra') is the engine's own line
 *     from the rows' facts;
 *   - a venue whose name holds its city is named alone on its place line (the PM's 23:45 of 17 November, fix (d)), so
 *     'Melbourne Recital Centre, Melbourne' is written 'Melbourne Recital Centre';
 *   - Facebook's link is written whole, https://www. and all, so it is always a link (the PM's 20:50: Facebook keeps the
 *     link clickable).
 */
const night = (over: Partial<CampaignNight>): CampaignNight =>
  ({
    eventId: '00000000-0000-4000-9000-000000000001',
    slug: 'a-night',
    title: 'A Night',
    startDate: '2026-11-19T08:00:00Z',
    endDate: '2026-11-19T11:00:00Z',
    timezone: 'Australia/Melbourne',
    citySlug: 'geelong',
    cityName: 'Geelong',
    venueName: null,
    host: null,
    categorySlug: 'music',
    summary: null,
    approvedPhotoUrl: null,
    photoCredit: null,
    cta: ctaFor({ tiers: [{ price: 5000 }] }),
    priceLine: null,
    ...over,
  }) as unknown as CampaignNight
const SITE = 'eventlinqs.com.au'
const ORIGIN = `https://www.${SITE}`
const lines = (c: string) => c.split('\n')

describe("Lawal's own caption, Kate Ceberano at Her Majesty's Theatre (OPS-DIRECTIVE-LOCKED-18NOV.md, item 5)", () => {
  const slug = 'kate-ceberano-australian-made-tour-2026-her-majesty-s-theatre-ballarat-2026-11-19'
  const kate = night({ slug, title: 'Kate Ceberano: Australian Made Tour 2026', citySlug: 'ballarat', cityName: 'Ballarat', venueName: "Her Majesty's Theatre", host: "Her Majesty's Theatre" })
  const city = { slug: 'ballarat', name: 'Ballarat' }
  const LAWAL = [
    '🎶 Kate Ceberano is coming to Ballarat!',
    "Experience the Australian Made Tour at Her Majesty's Theatre this Thursday, 19 November, at 7 pm.",
    "📍 Her Majesty's Theatre, Ballarat",
    '📅 Thursday 19 November · 7 pm',
    '🎟 Event details and tickets:',
    'eventlinqs.com.au/events/kate-ceberano-australian-made-tour-2026-her-majesty-s-theatre-ballarat-2026-11-19',
    '#BallaratEvents #KateCeberano #EventLinqs',
  ]
  it('Facebook: his caption word for word, the link written whole', () => {
    const fb = posterCaption(kate, city, SITE, { platform: 'facebook', link: `${ORIGIN}/events/${slug}` })
    expect(lines(fb)).toEqual(LAWAL.map((l) => (l.startsWith('eventlinqs.com.au/') ? `https://www.${l}` : l)))
  })
  it('Instagram: the same, the link in our bio', () => {
    const ig = posterCaption(kate, city, SITE, { platform: 'instagram', link: `${ORIGIN}/events/${slug}` })
    expect(lines(ig)).toEqual([...LAWAL.slice(0, 4), '🎟 Event details and tickets: link in our bio', LAWAL[6]])
    expect(captionMarkFaults(ig)).toEqual([])
  })
})

describe("Version 2's third sample: Kim Wilde at Costa Hall (a single night, Geelong)", () => {
  const kim = night({
    slug: 'the-kim-wilde-closer-tour-costa-hall-2026-11-22',
    title: 'Kim Wilde: Closer Tour',
    startDate: '2026-11-22T08:30:00Z',
    endDate: '2026-11-22T11:00:00Z',
    venueName: 'Costa Hall',
    host: 'Costa Hall',
    summary: 'Hear the 80s pop star behind more than 30 million records, live at Costa Hall.',
    cta: ctaFor({ tiers: [{ price: 8990 }] }),
    priceLine: 'From $89.90',
  })
  const SAMPLE = [
    '🎶 Kim Wilde is bringing her Closer Tour to Geelong!',
    'Hear the 80s pop star behind more than 30 million records, live at Costa Hall.',
    '📍 Costa Hall, Geelong',
    '📅 Sunday 22 November · 7.30 pm',
    "💲 Tickets from $89.90, plus the venue's $6.95 transaction fee",
    '🎟 Event details and tickets: link in our bio',
    'Bring the friend who knows every word.',
    '#GeelongEvents #KimWilde #EventLinqs',
  ]
  it('Instagram: the sample line for line, with no pronoun guessed and no fee the row does not hold', () => {
    const ig = posterCaption(kim, { slug: 'geelong', name: 'Geelong' }, SITE, { platform: 'instagram', link: `${ORIGIN}/events/${kim.slug}` })
    expect(lines(ig)).toEqual(SAMPLE.map((l) => l.replace('bringing her ', 'bringing the ').replace(", plus the venue's $6.95 transaction fee", '')))
    expect(captionMarkFaults(ig)).toEqual([])
  })
  it('Facebook: the same, the link line followed by the page itself', () => {
    const fb = posterCaption(kim, { slug: 'geelong', name: 'Geelong' }, SITE, { platform: 'facebook', link: `${ORIGIN}/events/${kim.slug}` })
    expect(fb).toContain(`🎟 Event details and tickets:\n${ORIGIN}/events/${kim.slug}\nBring the friend who knows every word.`)
  })
})

describe("Version 2's first sample: four events at Melbourne Recital Centre (a venue's week)", () => {
  const at = (title: string, startDate: string, categorySlug = 'music', i = 0) =>
    night({ eventId: `mrc-${title}-${i}`, slug: `mrc-${i}`, title, startDate, endDate: startDate, citySlug: 'melbourne', cityName: 'Melbourne', venueName: 'Melbourne Recital Centre', host: 'Melbourne Recital Centre', categorySlug })
  const ac = 'An Evening with Alastair Campbell'
  const week = [
    at('Eternity', '2026-11-19T07:00:00Z'),
    at('Holly Hebe', '2026-11-19T09:30:00Z'),
    at('Timor-Leste: Ita Nia Lian, Ita Nia Istoria', '2026-11-20T08:30:00Z'),
    at(ac, '2026-11-22T00:30:00Z', 'talks-and-ideas', 1),
    at(ac, '2026-11-22T04:00:00Z', 'talks-and-ideas', 2),
    at(ac, '2026-11-22T07:30:00Z', 'talks-and-ideas', 3),
  ]
  const shows = week.slice(0, 4)
  const melbourne = { slug: 'melbourne', name: 'Melbourne' }
  const SAMPLE = [
    '🎭 Four events at Melbourne Recital Centre this week.',
    'From Holly Hebe on Thursday night to three Sunday sessions with Alastair Campbell, all under one roof.',
    'Thu 19 Nov, 6 pm: Eternity',
    'Thu 19 Nov, 8.30 pm: Holly Hebe',
    'Fri 20 Nov, 7.30 pm: Timor-Leste: Ita Nia Lian, Ita Nia Istoria',
    'Sun 22 Nov, 11.30 am, 3 pm and 6.30 pm: An Evening with Alastair Campbell',
    '📍 Melbourne Recital Centre, Melbourne',
    '🎟 Event details and tickets: link in our bio',
    'Know someone who would love one of these? Send this to them.',
    '#MelbourneEvents #MelbourneRecitalCentre #EventLinqs',
  ]
  const words = listCaptions({
    hook: `${listEmoji(shows, true)} ${countPhrase(week)} at Melbourne Recital Centre this week.`,
    nights: shows,
    rows: shows.map((n) => rowLine(n, week, false)),
    pictured: null,
    place: 'Melbourne Recital Centre',
    link: `${ORIGIN}/city/melbourne`,
    share: 'Know someone who would love one of these? Send this to them.',
    tags: standardTags(melbourne, tagWord('Melbourne Recital Centre')),
    crop: '4:5',
    lead: 'Event details and tickets',
  })
  it('Instagram: every line the rows decide is the sample word for word; the second line is the engine’s own', () => {
    const ig = lines(words.versions.instagram.caption)
    expect(ig).toHaveLength(SAMPLE.length)
    SAMPLE.forEach((line, i) => {
      if (i === 1) expect(ig[1]).toBe('From Eternity on Thursday to An Evening with Alastair Campbell on Sunday.')
      else if (i === 6) expect(ig[6]).toBe('📍 Melbourne Recital Centre')
      else expect(ig[i]).toBe(line)
    })
    expect(captionMarkFaults(words.versions.instagram.caption)).toEqual([])
  })
  it('Facebook: the same, with the link line followed by the page itself', () => {
    expect(words.versions.facebook.caption).toContain(`🎟 Event details and tickets:\n${ORIGIN}/city/melbourne\nKnow someone`)
  })
})

describe("Version 2's second sample: five events in Geelong this week (a city's list)", () => {
  const at = (title: string, startDate: string, venueName: string, categorySlug: string) =>
    night({ eventId: `g-${title}`, slug: `g-${title.length}`, title, startDate, endDate: startDate, venueName, host: venueName, categorySlug })
  const week = [
    at('Geelong Dance Movement: A Passage Through Time', '2026-11-19T07:30:00Z', 'The Play House', 'arts-community'),
    at('Geelong Caravanning and Adventure Leisurefest', '2026-11-19T22:00:00Z', 'Geelong Racecourse', 'festival'),
    at('Torquay Dance Academy: Showtime: A World of Imagination', '2026-11-21T00:00:00Z', 'The Play House', 'arts-community'),
    at('The Church: A Psychedelic Symphony with The George Ellis Orchestra', '2026-11-21T08:30:00Z', 'Costa Hall', 'music'),
    at('The Kim Wilde: Closer Tour', '2026-11-22T08:30:00Z', 'Costa Hall', 'music'),
  ]
  const geelong = { slug: 'geelong', name: 'Geelong' }
  const PICTURED = 'Pictured: dancers and a band on stage, photographs from Pexels, not these nights.'
  const SAMPLE = [
    '🎉 Five events in Geelong this week, from The Church with a full orchestra to Kim Wilde at Costa Hall!',
    'Dance at The Play House, a leisure fest at the Racecourse and two big nights of music.',
    PICTURED,
    '📅 Thursday 19 to Sunday 22 November',
    'Thu 19 Nov, 6.30 pm: Geelong Dance Movement: A Passage Through Time, The Play House',
    'Fri 20 Nov, 9 am: Geelong Caravanning and Adventure Leisurefest, Geelong Racecourse',
    'Sat 21 Nov, 11 am: Torquay Dance Academy: Showtime: A World of Imagination, The Play House',
    'Sat 21 Nov, 7.30 pm: The Church: A Psychedelic Symphony with The George Ellis Orchestra, Costa Hall',
    'Sun 22 Nov, 7.30 pm: The Kim Wilde: Closer Tour, Costa Hall',
    '🎟 Times and tickets for all five: link in our bio',
    'Tag who you are going with.',
    '#GeelongEvents #Geelong #EventLinqs',
  ]
  const words = listCaptions({
    hook: `${listEmoji(week, false)} ${countPhrase(week)} in Geelong this week.`,
    nights: week,
    rows: week.map((n) => rowLine(n, week)),
    pictured: PICTURED,
    place: null,
    link: `${ORIGIN}/city/geelong`,
    share: 'Tag who you are going with.',
    tags: standardTags(geelong, tagWord('Geelong')),
    crop: '9:16',
  })
  it('Instagram: every line the rows decide is the sample word for word; the hook’s close and the second line are the engine’s own', () => {
    const ig = lines(words.versions.instagram.caption)
    expect(ig).toHaveLength(SAMPLE.length)
    SAMPLE.forEach((line, i) => {
      if (i === 0) expect(ig[0]).toBe('🎉 Five events in Geelong this week.')
      else if (i === 1) expect(ig[1]).toBe('From Geelong Dance Movement: A Passage Through Time on Thursday to The Kim Wilde: Closer Tour on Sunday.')
      else expect(ig[i]).toBe(line)
    })
    expect(captionMarkFaults(words.versions.instagram.caption)).toEqual([])
  })
  it('Facebook: the same, with the link line followed by the page itself', () => {
    expect(words.versions.facebook.caption).toContain(`🎟 Times and tickets for all five:\n${ORIGIN}/city/geelong\nTag who you are going with.`)
  })
})
