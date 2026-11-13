import { describe, expect, it } from 'vitest'
import { pageRuleFor, eventPagesFromSitemap } from '@/lib/listings/page-rules'

/*
 * SAILORS REST, A GEELONG VENUE'S OWN PROGRAMME (capture under the PM's 09:05 of 13 November 2026). Read that morning by
 * the polite reader: no schema.org Event data; its own event sitemap lists each page under /event/; each page has the
 * title, 'Event Date: <Month D, YYYY>', the night's programme as ' | ' lines with times, then the venue's opening hours.
 * The pages below are built by hand in the same shape, never copied from theirs.
 */

const URL = 'https://www.sailorsrestgeelong.com.au/event/bp-proof-night/'
const page = (o: { date?: string; programme?: string[]; hours?: string[] }) => `<!doctype html><html><body><main>
<h1 class="t">Bp Proof Night &#8211; on the Bay</h1>
${o.date ? `<p>Event Date: ${o.date}</p>` : ''}<p>Friday December 4</p>
${(o.programme ?? []).map((l) => `<p>${l}</p>`).join('')}
<div><h3>Opening hours</h3>${(o.hours ?? ['Open 7 Days 11:00am \u2013 Late', 'Friday 3:00pm \u2013 Late']).map((l) => `<p>${l}</p>`).join('')}</div>
</main></body></html>`

const rule = () => {
  const r = pageRuleFor(URL)
  if (!r) throw new Error('no rule for Sailors Rest')
  return r
}

describe('the Sailors Rest rule', () => {
  it('is found for its event pages, and its sitemap gives the event pages only', () => {
    expect(rule().host).toBe('sailorsrestgeelong.com.au')
    const xml = `<urlset><url><loc>https://www.sailorsrestgeelong.com.au/events/</loc></url><url><loc>${URL}</loc></url></urlset>`
    expect(eventPagesFromSitemap(xml, rule())).toEqual([URL])
  })

  it("starts the night at the earliest time in its programme, in Melbourne's time, facts only", () => {
    const found = rule().read(page({ date: 'December 4, 2026', programme: ['FREE Bp Tastings | 5-7 PM', 'Live Acoustic by Bp Proof | 5-8 PM', 'DJ | 8 PM-Late'] }), URL)
    expect(found).toHaveLength(1)
    // 5 pm on 4 December 2026 in Melbourne (daylight time, UTC+11) is 06:00 UTC.
    expect(found[0]).toMatchObject({
      title: 'Bp Proof Night: on the Bay',
      startsAt: '2026-12-04T06:00:00.000Z',
      timeStatus: 'exact',
      timeFromWords: true,
      venueName: 'Sailors Rest',
      imageUrl: null,
      description: null,
    })
  })

  it("never reads one item's FREE as the night's price (checklist E6)", () => {
    const found = rule().read(page({ date: 'December 4, 2026', programme: ['FREE Bp Tastings | 5-7 PM'] }), URL)
    expect(found[0].links).toEqual([{ url: URL, availability: 'on_sale', priceFromCents: null }])
  })

  it('reads a range written with a dash, and a lone time with its own meridiem', () => {
    const dash = rule().read(page({ date: 'December 4, 2026', programme: ['Bp Band | 7:30\u20139:30 PM'] }), URL)
    expect(dash[0].startsAt).toBe('2026-12-04T08:30:00.000Z')
    const lone = rule().read(page({ date: 'December 4, 2026', programme: ['Doors | 6 PM'] }), URL)
    expect(lone[0].startsAt).toBe('2026-12-04T07:00:00.000Z')
  })

  it("never takes the venue's opening hours as the night's time: a page with no programme time is that day, date only", () => {
    const found = rule().read(page({ date: 'December 4, 2026', programme: ['A night on the bay'] }), URL)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ timeStatus: 'date_only' })
  })

  it('reads nothing from a page without its Event Date line', () => {
    expect(rule().read(page({ programme: ['DJ | 8 PM-Late'] }), URL)).toEqual([])
  })
})
