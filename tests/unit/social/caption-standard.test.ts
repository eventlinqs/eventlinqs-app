import { describe, expect, it } from 'vitest'
import { captionFor, dayWordOf, hookFor, experiencesOf, practicalLine, whereOf } from '@/lib/social/lifecycle'
import { pieceQuality, type QualityNight } from '@/lib/social/piece-quality'
import type { Slide } from '@/lib/social/campaign'

/*
 * THE 05:15 CAPTION STANDARD (the PM's order of 05:15 on 22 November 2026; Lawal, 04:56: "nothing ever goes out and gets
 * edited, ever, in this engine"). The writer's shape, and the publish gate's five checks each red on the caption that
 * really went to be published: AMCF's final day feed piece 70329a33, held by hand at 07:31 because nothing in the engine
 * refused it. The fixed case is Colours of Asia's last night (asia-oasis-22nov-last-day).
 */
const COA_SUMMARY = 'A free festival in Alexandra Gardens with Asian street food, lantern gardens, music, dance, art and artisan markets.'

describe('the writer, to the standard', () => {
  it("Colours of Asia's last night: its hook, its words and the practical line, then the fact block of four markers", () => {
    const caption = captionFor({
      platform: 'instagram',
      firstLine: hookFor('final_day', experiencesOf(COA_SUMMARY, 'Colours of Asia: Garden of Wonders'), 'Alexandra Gardens', { title: 'Colours of Asia: Garden of Wonders' }) as string,
      facts: {
        title: 'Colours of Asia: Garden of Wonders',
        place: 'Alexandra Gardens',
        dateLabel: 'Sun 22 Nov',
        times: '11am to 10pm',
        priceLine: 'Free',
        summary: COA_SUMMARY,
        organiser: 'Asia Oasis',
        address: 'Alexandra Avenue, Melbourne VIC 3004',
        city: 'Melbourne',
        dayWord: dayWordOf('2026-11-22', '2026-11-22'),
        practical: practicalLine({ freeEntry: true, registrationRequired: false, ticketingByEventLinqs: false }),
      },
      link: 'https://www.eventlinqs.com.au/go/x?via=instagram',
    })
    expect(caption).toBe(
      [
        'Last day today for street food, lantern gardens and music at Alexandra Gardens, and still on.',
        `${COA_SUMMARY} It's free, and there's nothing to book.`,
        [
          'Colours of Asia: Garden of Wonders, by Asia Oasis',
          '\u{1F4CD} Alexandra Gardens, Alexandra Avenue, Melbourne VIC 3004',
          '\u{1F4C5} Today, Sun 22 Nov, 11am to 10pm',
          '\u{1F4B2} Free entry',
          '\u{1F39F} Details on EventLinqs: link in our bio',
        ].join('\n'),
      ].join('\n\n'),
    )
    expect(caption).not.toMatch(/ticket/i)
  })

  it('the place says each part once, the day word reads from the post, and a paid night says how to buy', () => {
    expect(whereOf('Alexandra Gardens', 'Alexandra Avenue, Melbourne VIC 3004', 'Melbourne')).toBe('Alexandra Gardens, Alexandra Avenue, Melbourne VIC 3004')
    expect(whereOf('The Jazzlab', null, 'Melbourne')).toBe('The Jazzlab, Melbourne')
    expect(dayWordOf('2026-11-23', '2026-11-22')).toBe('Tomorrow')
    expect(dayWordOf('2026-11-26', '2026-11-22')).toBe('Thursday')
    expect(practicalLine({ freeEntry: false, registrationRequired: false, ticketingByEventLinqs: true })).toBe('Tickets are on EventLinqs.')
  })

  it('with no experience in its words the first line names the night itself, never a stock phrase', () => {
    expect(hookFor('first_day', [], 'The Jazzlab', { title: 'The Jazz Alchemists' })).toBe('The Jazz Alchemists at The Jazzlab, from today.')
  })
})

describe("the publish gate's five checks, on the exact caption", () => {
  const amcf = (over: Partial<QualityNight> = {}): QualityNight => ({
    eventId: 'amcf',
    title: 'African Music and Cultural Festival 2026',
    summary: 'Three days of African music, food, fashion and dance at Federation Square.',
    venueName: 'Federation Square',
    host: null,
    categorySlug: 'festivals',
    sourceTitle: null,
    startDate: '2026-11-21T23:00:00Z',
    endDate: '2026-11-22T11:00:00Z',
    timezone: 'Australia/Melbourne',
    isFree: true,
    ...over,
  } as QualityNight)
  const slides: Slide[] = [{ t: 'photo', composition: 'photo_whole', eventId: 'amcf', photo: 'https://x/amcf.jpg', credit: null, width: 1100, height: 733, line: null } as unknown as Slide]
  const judge = (caption: string, kind = 'final_day') =>
    pieceQuality({ slides, caption, captions: [caption], momentKind: kind, madeAt: '2026-11-21T19:00:00Z', nights: new Map([['amcf', amcf()]]), now: new Date('2026-11-21T19:30:00Z') }).filter((r) => r.startsWith('[standard]'))
  const HELD = "Final day today, still on until it closes.\n\nAfrican Music and Cultural Festival 2026\n\u{1F4CD} Federation Square\n\u{1F4C5} Sun 22 Nov\n\u{1F4B2} Free entry\n\n\u{1F39F} Event details and tickets: link in our bio"
  const GOOD = [
    'Last day today for African music, food and dance at Federation Square, and still on.',
    "Three days of African music, food, fashion and dance at Federation Square. It's free, and there's nothing to book.",
    'African Music and Cultural Festival 2026\n\u{1F4CD} Federation Square, Melbourne\n\u{1F4C5} Today, Sun 22 Nov, 10am to 10pm\n\u{1F4B2} Free entry\n\u{1F39F} Details on EventLinqs: link in our bio',
  ].join('\n\n')

  it("AMCF's held piece, as it was approved at 06:40, is refused on every check it fails", () => {
    const faults = judge(HELD).join(' | ')
    expect(faults).toMatch(/does not say 'Last day'/) // 1. run day
    expect(faults).toMatch(/states no time/) // 2. time stated
    expect(faults).toMatch(/says 'ticket'/) // 4. free wording
    expect(faults).toMatch(/names nothing of the night's own words/) // 5. first line
  })

  it('the standard caption passes every check', () => {
    expect(judge(GOOD)).toEqual([])
  })

  it('3. a fact that is not the row is refused: the wrong start, the wrong venue', () => {
    expect(judge(GOOD.replace('10am to 10pm', '11am to 10pm')).join(' ')).toMatch(/does not carry its start, 10am/)
    expect(judge(GOOD.replace('Federation Square, Melbourne', 'Birrarung Marr, Melbourne')).join(' ')).toMatch(/does not name its venue/)
  })

  it('a piece that is not a lifecycle moment is not judged by these checks', () => {
    expect(pieceQuality({ slides, caption: HELD, momentKind: null, madeAt: '2026-11-21T19:00:00Z', nights: new Map([['amcf', amcf()]]), now: new Date('2026-11-21T19:30:00Z') }).filter((r) => r.startsWith('[standard]'))).toEqual([])
  })
})
