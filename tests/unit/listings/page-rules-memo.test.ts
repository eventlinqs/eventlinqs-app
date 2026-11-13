import { describe, expect, it } from 'vitest'
import { pageRuleFor, eventPagesFromSitemap } from '@/lib/listings/page-rules'

/*
 * MEMO MUSIC HALL, ST KILDA (capture under the PM's 09:45 of 13 November 2026). Read that morning by the polite reader:
 * no schema.org Event data; its sitemap lists each gig page under /memo-gig/; each names the night in one heading with
 * its date and time in a span, then doors and showtime; a sidebar lists other gigs' dates. The pages below are built by
 * hand in the same shape, never copied from theirs.
 */

const URL = 'https://www.memomusichall.com.au/memo-gig/bp-proof-revue-launch/'
const page = (o: { date?: string; showtime?: string | null }) => `<!doctype html><html><body>
<div class="col-sm-9 main_content"><h2 class="single-gig-name">BP PROOF REVUE &#8211; BAND LAUNCH - <span class="single-gig-date">${o.date ?? 'Sat 1 May 2027, 7:00PM AEST'}</span> </h2>
<div class="single-gig-info"><p>Doors 7.00PM</p>${o.showtime === null ? '' : `<p>Showtime ${o.showtime ?? '8.00PM'}</p>`}<p>TICKETS:</p><p>$57.50/51.50/42.50+bf Online</p></div></div>
<div class="gig-related-date"><h2>Sat 21 Nov, 7:00PM AEDT</h2></div><div class="gig-related-date"><h2>Sun 31 Jan, 3:00PM AEDT</h2></div>
</body></html>`

const rule = () => {
  const r = pageRuleFor(URL)
  if (!r) throw new Error('no rule for MEMO Music Hall')
  return r
}

describe('the MEMO Music Hall rule', () => {
  it('is found for its gig pages, and its sitemap gives the gig pages only', () => {
    const xml = `<urlset><url><loc>https://www.memomusichall.com.au/gigs/</loc></url><url><loc>${URL}</loc></url></urlset>`
    expect(eventPagesFromSitemap(xml, rule())).toEqual([URL])
  })

  it('reads the title and the night at its showtime, in Melbourne time, facts only, with no dash in the title', () => {
    const found = rule().read(page({}), URL)
    expect(found).toHaveLength(1)
    // 8 pm on 1 May 2027 in Melbourne (standard time, UTC+10) is 10:00 UTC.
    expect(found[0]).toMatchObject({
      title: 'BP PROOF REVUE: BAND LAUNCH',
      startsAt: '2027-05-01T10:00:00.000Z',
      venueName: 'MEMO Music Hall',
      venueAddress: '88 Acland Street, St Kilda VIC 3182',
      imageUrl: null,
      description: null,
      timeFromWords: true,
    })
  })

  it("takes the heading's time where no showtime is stated, and never a sidebar gig's date", () => {
    const found = rule().read(page({ showtime: null }), URL)
    expect(found).toHaveLength(1)
    expect(found[0].startsAt).toBe('2027-05-01T09:00:00.000Z')
  })

  it('reads a night in daylight time', () => {
    expect(rule().read(page({ date: 'Sat 21 Nov 2026, 7:30PM AEDT', showtime: null }), URL)[0].startsAt).toBe('2026-11-21T08:30:00.000Z')
  })

  it('takes no price, since its tiers include concessions (checklist E6)', () => {
    expect(rule().read(page({}), URL)[0].links).toEqual([{ url: URL, availability: 'on_sale', priceFromCents: null }])
  })

  it('reads nothing from a page without its heading', () => {
    expect(rule().read('<h2>Sat 21 Nov, 7:00PM AEDT</h2>', URL)).toEqual([])
  })
})
