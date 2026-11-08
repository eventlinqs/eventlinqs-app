import { describe, expect, it } from 'vitest'
import { pageRuleFor } from '@/lib/listings/page-rules'

/*
 * BIRD'S BASEMENT STATES ITS SHOW TIME IN WORDS, NOT IN ITS EVENT DATA (the engine accuracy sweep, 6 November 2026). Its show
 * pages carry one schema.org Event per date with a date only startDate ('2026-11-07') and say 'Early Show Starts: 7:30 pm'
 * further down, more than 300 characters from the date, so the sweep could read the date and not the time: 33 listings
 * unreadable. Read through the polite reader that night: /show/1779 states one show; /show/1773 states an early and a late
 * show for three dates without saying which dates run which.
 */
const page = (dates: string[], words: string) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(
    dates.map((d) => ({
      '@context': 'https://schema.org', '@type': 'Event', name: 'The Santana Songbook by SPIRIT', startDate: d, endDate: d,
      location: { '@type': 'Place', name: "Bird's Basement", address: '11 Singers Lane, Melbourne VIC 3000' },
      offers: { '@type': 'Offer', price: '29.00', priceCurrency: 'AUD', url: 'https://birdsbasement.com/show/1779/the-santana-songbook-by-spirit' },
    })),
  )}</script></head><body><h1>The Santana Songbook by SPIRIT</h1><p>Price Range: From $45 + booking fee.</p>${words}</body></html>`
const url = 'https://birdsbasement.com/show/1779/the-santana-songbook-by-spirit'
const melbourne = (iso: string) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

describe("Bird's Basement's page rule", () => {
  it('is written for its show pages', () => {
    expect(pageRuleFor(url)?.host).toBe('birdsbasement.com')
  })

  it('one stated show time is every date\'s start, read from the words', () => {
    const found = pageRuleFor(url)!.read(page(['2026-11-07'], '<p>Early Doors Open: 6:00 pm</p><p>Early Show Starts: 7:30 pm</p>'), url)
    expect(found).toHaveLength(1)
    expect(melbourne(found[0].startsAt)).toMatch(/Sat,? 7 Nov,? 7:30\s?pm/)
    expect(found[0]).toMatchObject({ timeStatus: 'exact', timeFromWords: true })
  })

  it("the from price is the visible 'Price Range: From $45', never the $29.00 every page's Event data carries", () => {
    const found = pageRuleFor(url)!.read(page(['2026-11-07'], '<p>Early Show Starts: 7:30 pm</p>'), url)
    expect(found[0].links.map((l) => l.priceFromCents)).toEqual([4500])
    const unpriced = pageRuleFor(url)!.read(page(['2026-11-07'], '<p>Early Show Starts: 7:30 pm</p>').replace('Price Range: From $45 + booking fee.', ''), url)
    expect(unpriced[0].links.every((l) => l.priceFromCents === null)).toBe(true)
  })

  /*
   * LAWAL'S RULING, 7 November 2026 16:53 (the CONTROLLER's 17:05): 'A date range with two show times is three dates with two
   * sessions each; a person reads it in one look.' The case before this said 'nothing is guessed' and left all three dates
   * date only; that was wrong, and 'the source does not say' is never written while a person reading the page can tell.
   * /show/1773's own lines (read 7 November, C:\dev\EVIDENCE\ENGINE-P0\readers-62\birdsbasement.txt): the dates Thursday 19
   * to Saturday 21 November 2026, 'Early Doors Open: 6:00 pm', 'Early Show Starts: 7:30 pm', 'Late Doors Open: 9:20 pm',
   * 'Late Show Starts: 10:00 pm'; its Event data three date only nights; its ticket page refused (robots.txt answered 403).
   */
  it('an early and a late show on a range of dates are every date twice: one session at each stated start', () => {
    const found = pageRuleFor(url)!.read(
      page(
        ['2026-11-19', '2026-11-20', '2026-11-21'],
        '<p>Early Doors Open: 6:00 pm</p><p>Early Show Starts: 7:30 pm</p><p>Late Doors Open: 9:20 pm</p><p>Late Show Starts: 10:00 pm</p>',
      ),
      url,
    )
    expect(found).toHaveLength(6)
    const local = (iso: string) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .format(new Date(iso))
        .replace(',', '')
    expect(found.map((f) => local(f.startsAt))).toEqual([
      '2026-11-19 19:30', '2026-11-19 22:00',
      '2026-11-20 19:30', '2026-11-20 22:00',
      '2026-11-21 19:30', '2026-11-21 22:00',
    ])
    expect(found.every((f) => f.timeStatus === 'exact' && f.timeFromWords === true)).toBe(true)
  })
  it('a doors time is never a session: only a show start makes one', () => {
    const found = pageRuleFor(url)!.read(page(['2026-11-19'], '<p>Early Doors Open: 6:00 pm</p><p>Early Show Starts: 7:30 pm</p><p>Late Doors Open: 9:20 pm</p><p>Late Show Starts: 10:00 pm</p>'), url)
    expect(found).toHaveLength(2)
    expect(found.map((f) => melbourne(f.startsAt)).join(' | ')).not.toMatch(/6:00|9:20/)
  })
})
