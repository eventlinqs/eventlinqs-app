import { describe, expect, it } from 'vitest'
import { eventPagesFromSitemap, pageRuleFor } from '@/lib/listings/page-rules'

/**
 * MELBOURNE'S PAGE RULES, the second pair (WINDOW 2, 1 November 2026): The Comic's Lounge (one night per show page) and
 * Forum Melbourne (a dated calendar block per night). Fixtures are written for this test in the shape of those pages,
 * not copied from them.
 */

const CL = 'https://www.thecomicslounge.com.au'
const clPage = (o: { title: string; meta: string; price?: string; city?: string }) => `<html><body>
<section class="event-hero"><h1 class="event-hero-title">${o.title}</h1><p class="event-hero-venue">The Comic&#39;s Lounge</p>
<div class="event-hero-date"><span class="event-hero-date-weekday">Fri</span><span class="event-hero-date-day">6</span><span class="event-hero-date-city">${o.city ?? 'North Melbourne'}</span></div></section>
<article><p>The presenter's long words about the show, never kept.</p>${o.price ? `<p class="event-detail-price">${o.price}</p>` : ''}</article>
<aside class="event-checkout-aside" id="tickets"><p class="event-checkout-meta">${o.meta}</p><p class="event-checkout-meta">The Comic&#39;s Lounge</p></aside></body></html>`

describe("The Comic's Lounge rule", () => {
  const url = `${CL}/events/bp-proof-showcase-2026-11-06/`
  const rule = pageRuleFor(url)

  it('is found for its show pages; the sitemap leads only to them', () => {
    expect(rule).not.toBeNull()
    const xml = `<urlset><url><loc>${CL}/events/</loc></url><url><loc>${url}</loc></url><url><loc>${CL}/about/</loc></url></urlset>`
    expect(eventPagesFromSitemap(xml, rule!)).toEqual([url])
  })

  it('one night at the SHOW time (not the doors), with the street and the price from', () => {
    const found = rule!.read(clPage({ title: 'Bp Proof Showcase', meta: '6th Nov, 2026 · doors 8:30 PM · show 9:00 PM', price: 'From $35' }), url)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      title: 'Bp Proof Showcase',
      startsAt: '2026-11-06T10:00:00.000Z', // 9 pm AEDT
      venueName: "The Comic's Lounge",
      venueAddress: 'Level 1, 26 Errol Street, North Melbourne VIC',
      imageUrl: null,
      description: null,
    })
    expect(found[0].links).toEqual([{ url, availability: 'on_sale', priceFromCents: 3500 }])
  })

  it('no price stated is no price; another city keeps no street; no show time lands nothing', () => {
    const a = rule!.read(clPage({ title: 'Bp Two', meta: '5th Nov, 2026 · doors 5:30 PM · show 7:00 PM', city: 'Geelong' }), url)
    expect(a[0].links[0].priceFromCents).toBeNull()
    expect(a[0].venueAddress).toBeNull()
    expect(rule!.read(clPage({ title: 'Bp Three', meta: 'Dates to be announced' }), url)).toEqual([])
  })
})

const FM = 'https://forummelbourne.com.au'
const fmPage = (title: string, nights: [string, string][]) => `<html><body><h1>${title}</h1>
${nights.map(([d, t]) => `<div class="show"><div class="calendar">
  <span class="full-date">${d}</span>
  <span class="time">${t}</span>
</div><a href="https://premier.ticketek.com.au/shows/show.aspx?sh=BPPROOF26&amp;v=FRM&amp;utm_source=forummelbourne.com.au&amp;utm_medium=referral" target="_blank" class="button">Buy Tickets</a></div>`).join('')}
<p>Location: Forum Melbourne is located at 154 Flinders Street.</p></body></html>`

describe('the Forum Melbourne rule', () => {
  const url = `${FM}/shows/bp-proof-band`
  const rule = pageRuleFor(url)

  it('reads each dated night once, with the Ticketek link stripped of its tracking', () => {
    expect(rule).not.toBeNull()
    const found = rule!.read(fmPage('Bp Proof Band', [['Mon 2 Nov 2026', '6:30pm'], ['Mon 2 Nov 2026', '6:30pm'], ['Tue 3 Nov 2026', '8pm']]), url)
    expect(found.map((f) => f.startsAt)).toEqual(['2026-11-02T07:30:00.000Z', '2026-11-03T09:00:00.000Z'])
    expect(found[0]).toMatchObject({ title: 'Bp Proof Band', venueName: 'Forum Melbourne', venueAddress: '154 Flinders Street, Melbourne VIC' })
    expect(found[0].links).toEqual([{ url: 'https://premier.ticketek.com.au/shows/show.aspx?sh=BPPROOF26&v=FRM', availability: 'on_sale', priceFromCents: null }])
  })

  it('a page with no dated night lands nothing', () => {
    expect(rule!.read(fmPage('Bp Past', []), url)).toEqual([])
  })
})
