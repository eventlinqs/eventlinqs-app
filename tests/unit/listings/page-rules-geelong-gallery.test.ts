import { describe, expect, it } from 'vitest'
import { pageRuleFor, eventPagesFromSitemap } from '@/lib/listings/page-rules'

/*
 * GEELONG GALLERY, 55 LITTLE MALOP STREET (capture under the PM's 09:45 of 13 November 2026, Victoria after Melbourne).
 * Read that morning by the polite reader: its sitemap lists each event page under /events/; each names the event in its
 * h1 and each session as a date line then its times; the gallery's opening hours follow no date line. Built by hand in
 * the same shape, never copied from theirs.
 */

const URL = 'https://geelonggallery.org.au/events/bp-proof-printmaking-workshop/'
const page = (sessions: [string, string][]) => `<!doctype html><html><body><main>
<h1 class="t">Bp Proof Printmaking Workshop</h1><div><p>Tickets</p><p>$78</p><p>$83</p></div>
${sessions.map(([d, t]) => `<div><p>${d}</p><p>${t}</p></div>`).join('')}
<footer><p>Free entry</p><p>Open daily</p><p>from 10am to 5pm</p></footer></main></body></html>`

const rule = () => {
  const r = pageRuleFor(URL)
  if (!r) throw new Error('no rule for Geelong Gallery')
  return r
}

describe('the Geelong Gallery rule', () => {
  it('is found for its event pages, and its sitemap gives the event pages only', () => {
    const xml = `<urlset><url><loc>https://geelonggallery.org.au/events/</loc></url><url><loc>${URL}</loc></url></urlset>`
    expect(eventPagesFromSitemap(xml, rule())).toEqual([URL])
  })

  it('reads every session as its own night, start and finish in Melbourne time, at the gallery', () => {
    const found = rule().read(page([['Saturday 5 December 2026', '11.00am to 3.30pm'], ['Saturday 6 February 2027', '11.00am to 3.30pm']]), URL)
    expect(found).toHaveLength(2)
    // 11 am on 5 December 2026 in Melbourne (daylight time, UTC+11) is 00:00 UTC; 3.30 pm is 04:30 UTC.
    expect(found[0]).toMatchObject({
      title: 'Bp Proof Printmaking Workshop',
      startsAt: '2026-12-05T00:00:00.000Z',
      endsAt: '2026-12-05T04:30:00.000Z',
      venueName: 'Geelong Gallery',
      venueAddress: '55 Little Malop Street, Geelong VIC 3220',
      imageUrl: null,
      description: null,
      links: [{ url: URL, availability: 'on_sale', priceFromCents: null }],
    })
    expect(found[1].startsAt).toBe('2027-02-06T00:00:00.000Z')
  })

  it('reads a dash joining two words in the title as a colon', () => {
    const titled = page([['Saturday 5 December 2026', '11.00am to 3.30pm']]).replace(
      'Bp Proof Printmaking Workshop',
      `Bp Proof Workshop${String.fromCharCode(0x2014)}Inspired by Bp`,
    )
    expect(rule().read(titled, URL)[0].title).toBe('Bp Proof Workshop: Inspired by Bp')
  })

  it('never takes the opening hours as a session, and reads nothing from a page with no dated session', () => {
    expect(rule().read(page([]), URL)).toEqual([])
  })
})
