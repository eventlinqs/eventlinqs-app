import { describe, expect, it } from 'vitest'
import { pageRuleFor, eventPagesFromSitemap } from '@/lib/listings/page-rules'

/*
 * CHERRY BAR, 68 LITTLE COLLINS STREET (capture under the PM's 09:45 of 13 November 2026). Read that morning by the polite
 * reader: no schema.org Event data; its sitemap lists its current shows under /events/; each page has the show in its h1,
 * 'Starts <day> <date> . <time>' and 'Finishes ...', and a link to its seller. Built by hand in the same shape.
 */

const URL = 'https://www.cherrybar.com.au/events/bp-proof-band-live-at-cherry-bar-sat-dec-12th/'
const page = (o: { title?: string; starts?: string | null; finishes?: string | null; seller?: boolean }) => `<!doctype html><html><body>
<header><p>68 LITTLE COLLINS STREET, MELBOURNE</p><p>OPEN EVERY NIGHT FROM 7PM</p></header>
<main><h1 class="entry-title">${o.title ?? 'Bp Proof Band live at Cherry Bar, Melbourne, SAT DEC 12th'}</h1>
${o.starts === null ? '' : `<div><span>Starts</span> <span>${o.starts ?? 'Saturday 12 December 2026 · 8:00pm'}</span></div>`}
${o.finishes === null ? '' : `<div><span>Finishes</span> <span>${o.finishes ?? 'Saturday 12 December 2026 · 11:00pm'}</span></div>`}
${o.seller === false ? '' : '<a href="https://www.eventbrite.com.au/e/bp-proof-band-tickets-1">Get tickets on Eventbrite</a>'}
<p>KEEP IT GOING. Sun to Thu 7pm to 3am</p></main></body></html>`

const rule = () => {
  const r = pageRuleFor(URL)
  if (!r) throw new Error('no rule for Cherry Bar')
  return r
}

describe('the Cherry Bar rule', () => {
  it('is found for its show pages, and its sitemap gives the show pages only', () => {
    const xml = `<urlset><url><loc>https://www.cherrybar.com.au/events/</loc></url><url><loc>${URL}</loc></url></urlset>`
    expect(eventPagesFromSitemap(xml, rule())).toEqual([URL])
  })

  it('reads the show, its start and finish in Melbourne time, its street, and its seller', () => {
    const found = rule().read(page({}), URL)
    expect(found).toHaveLength(1)
    // 8 pm and 11 pm on 12 December 2026 in Melbourne (daylight time, UTC+11).
    expect(found[0]).toMatchObject({
      title: 'Bp Proof Band live at Cherry Bar, Melbourne',
      startsAt: '2026-12-12T09:00:00.000Z',
      endsAt: '2026-12-12T12:00:00.000Z',
      venueName: 'Cherry Bar',
      venueAddress: '68 Little Collins Street, Melbourne VIC',
      imageUrl: null,
      description: null,
      links: [{ url: 'https://www.eventbrite.com.au/e/bp-proof-band-tickets-1', availability: 'on_sale', priceFromCents: null }],
    })
  })

  it('links the page itself where no seller is named, and keeps no finish it cannot read', () => {
    const found = rule().read(page({ seller: false, finishes: null }), URL)
    expect(found[0].links[0].url).toBe(URL)
    expect(found[0].endsAt).toBeNull()
  })

  it("drops the show title's own short date with or without a comma", () => {
    expect(rule().read(page({ title: 'Bp Proof Duo live at Cherry Bar FRI DEC 11' }), URL)[0].title).toBe('Bp Proof Duo live at Cherry Bar')
  })

  it('reads nothing from a page with no start', () => {
    expect(rule().read(page({ starts: null }), URL)).toEqual([])
  })
})
