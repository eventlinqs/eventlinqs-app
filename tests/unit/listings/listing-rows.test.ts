import { describe, expect, it } from 'vitest'
import {
  LISTING_COLUMNS,
  clockFrom12h,
  headerProblem,
  judgeFile,
  judgeRow,
  parseCsv,
  type JudgeContext,
} from '@/lib/listings/listing-rows'

/**
 * WI2 Part 1: each row of a checked listings file becomes IMPORT, REFUSED (a
 * rule it breaks, named) or HELD (an unruled question, by number), and nothing
 * in the file is ever mended or invented (docs/walk-in/WI2-PLAN.md section 6).
 * The names and places below are invented for the test.
 */

const ctx: JudgeContext = {
  now: new Date('2026-10-22T02:00:00Z'), // 13:00 on 22 October in Melbourne
  categorySlugs: new Set(['music', 'comedy', 'community']),
  guideCities: new Map([
    ['melbourne', 'Australia/Melbourne'],
    ['geelong', 'Australia/Melbourne'],
  ]),
}

const good = {
  city: 'melbourne',
  date: '2026-10-22',
  day: 'Thu',
  start: '6:30pm',
  finish: '8:30pm',
  frequency: 'weekly',
  name: 'Corner Hall Trivia',
  host: 'The Corner Hall',
  address: '12 Example Street',
  suburb: 'Fitzroy',
  category: 'community',
  entry: 'Free',
  age_limit: '',
  what_happens: 'Teams answer trivia rounds in the front room.',
  website: 'https://cornerhall.example.com',
  instagram: 'cornerhall',
  instagram_post: '',
  venue_email: '',
  facebook: '',
  source_url: 'https://whatson.example.com/corner-hall-trivia',
  source_date: 'read 2026-10-21',
  freshness: 'CURRENT',
  notes: 'the project manager\x27s own note',
}
const judge = (over: Partial<typeof good> = {}) => judgeRow({ ...good, ...over }, ctx)
const reasons = (over: Partial<typeof good>) => {
  const v = judge(over)
  return v.verdict === 'import' ? [] : v.reasons.join(' | ')
}

describe('reading the file', () => {
  it('a quoted comma, a doubled quote, CRLF line ends and a byte order mark', () => {
    const rows = parseCsv('﻿a,b\r\n"1, 2","say ""hi"""\r\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1, 2', 'say "hi"'],
    ])
  })

  it('times in the form the files write them', () => {
    expect(clockFrom12h('7pm')).toBe('19:00')
    expect(clockFrom12h('6:30pm')).toBe('18:30')
    expect(clockFrom12h('12am')).toBe('00:00')
    expect(clockFrom12h('12:15pm')).toBe('12:15')
    expect(clockFrom12h('19:00')).toBeNull()
    expect(clockFrom12h('7')).toBeNull()
  })

  it('the header must be the listings columns, in any order', () => {
    expect(headerProblem([...LISTING_COLUMNS].reverse())).toBeNull()
  })

  it("the project manager's current header lacks the four new columns, and says which", () => {
    const current = 'date,day,start,finish,name,host,address,suburb,category,entry,age_limit,what_happens,website,instagram,facebook,source_url,source_date,freshness,notes'.split(',')
    expect(headerProblem(current)).toMatch(/missing city, frequency, instagram_post, venue_email/)
  })

  it('an unknown column is named', () => {
    expect(headerProblem([...LISTING_COLUMNS, 'price'])).toMatch(/not columns of this file: price/)
  })
})

describe('a good row imports as written', () => {
  it('every field taken from the file, times in 24-hour form, the source date as a date', () => {
    const v = judge()
    expect(v.verdict).toBe('import')
    if (v.verdict !== 'import') return
    expect(v.row).toMatchObject({
      citySlug: 'melbourne',
      date: '2026-10-22',
      rule: 'weekly',
      startsAt: '18:30',
      endsAt: '20:30',
      categorySlug: 'community',
      ageRestrictionMin: null,
      instagramHandle: 'cornerhall',
      sourceDate: '2026-10-21',
    })
  })

  it('the monthly rules map from the file\x27s words', () => {
    // 2026-10-06 is the first Tuesday of October.
    const v = judge({ date: '2026-10-06', day: 'Tue', frequency: 'monthly-1st' })
    expect(v.verdict === 'import' && v.row.rule).toBe('monthly-1')
  })
})

describe('refused, each with its reason', () => {
  it.each([
    [{ city: 'sydney' }, /not a guide city/],
    [{ day: 'Fri' }, /not 2026-10-22's weekday \(Thu\)/],
    [{ start: '18:30' }, /start "18:30" is not a time/],
    [{ frequency: 'every week' }, /frequency "every week"/],
    [{ date: '2026-10-13', day: 'Tue', frequency: 'monthly-1st' }, /not the 1 of its weekday/],
    [{ category: 'Live music (jazz)' }, /category "Live music \(jazz\)" is not one of the live category slugs/],
    [{ entry: '$10 on the door' }, /is not free walk-in entry/],
    [{ age_limit: '21+' }, /age_limit "21\+"/],
    [{ what_happens: 'Grab a ticket at the bar.' }, /what_happens:/],
    [{ name: 'Happy hour at the Corner Hall' }, /opening hours, a happy hour or a discount/],
    [{ website: 'http://cornerhall.example.com' }, /not an https address/],
    [{ instagram: '@cornerhall' }, /not a bare handle/],
    [{ instagram_post: 'https://example.com/p/1' }, /not an Instagram post or reel address/],
    [{ venue_email: 'not-an-email' }, /not an email address/],
    [{ source_date: 'read 2026-10-23' }, /in the future/],
    [{ source_date: '2026-09-30' }, /older than 21 days/],
    [{ freshness: 'STALE' }, /not CURRENT/],
    [{ name: '' }, /name is empty/],
  ])('%o', (over, why) => {
    const v = judge(over as Partial<typeof good>)
    expect(v.verdict).toBe('refused')
    expect(reasons(over as Partial<typeof good>)).toMatch(why)
  })
})

describe('held, by the question that has not been ruled', () => {
  it('no finish time: question 1', () => {
    const v = judge({ finish: '' })
    expect(v.verdict === 'held' && v.questions).toEqual([1])
  })

  it('a booking, registration or RSVP: question 2', () => {
    const v = judge({ entry: 'Free; team booking recommended' })
    expect(v.verdict === 'held' && v.questions).toEqual([2])
  })

  it('a donation: question 5', () => {
    const v = judge({ entry: 'Gold coin donation' })
    expect(v.verdict === 'held' && v.questions).toEqual([5])
  })

  it('a row that both breaks a rule and waits on a question is refused, with the rule named', () => {
    const v = judge({ finish: '', city: 'sydney' })
    expect(v.verdict).toBe('refused')
  })
})

describe('a whole file', () => {
  it('a wrong header refuses every row and imports nothing', () => {
    const f = judgeFile('date,day\n2026-10-22,Thu\n', ctx)
    expect(f.headerProblem).toMatch(/missing/)
    expect(f.rows).toEqual([])
  })

  it('counts each verdict and keeps the line number', () => {
    const header = LISTING_COLUMNS.join(',')
    const line = (over: Partial<typeof good>) => LISTING_COLUMNS.map((c) => JSON.stringify({ ...good, ...over }[c])).join(',')
    const f = judgeFile([header, line({}), line({ finish: '' }), line({ city: 'perth' })].join('\n'), ctx)
    expect(f.counts).toEqual({ import: 1, held: 1, refused: 1 })
    expect(f.rows.map((r) => r.line)).toEqual([2, 3, 4])
  })
})
