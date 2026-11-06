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

  it('an early and a late show, not tied to dates, leave every date date only: nothing is guessed', () => {
    const found = pageRuleFor(url)!.read(
      page(['2026-11-19', '2026-11-20', '2026-11-21'], '<p>Early Show Starts: 7:30 pm</p><p>Late Doors Open: 9:20 pm</p><p>Late Show Starts: 10:00 pm</p>'),
      url,
    )
    expect(found).toHaveLength(3)
    expect(found.every((f) => f.timeStatus === 'date_only')).toBe(true)
  })
})
