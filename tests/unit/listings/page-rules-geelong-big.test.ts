import { describe, expect, it } from 'vitest'
import { eventPagesFromSitemap, pageRuleFor } from '@/lib/listings/page-rules'

/**
 * GEELONG'S BIG NIGHTS, TWO PAGE RULES (WINDOW 2, 2 November 2026, the CONTROLLER's 15:34 order: "the engine's next
 * sources by order: GMHBA Stadium's own events page ... Mt Duneed Estate concerts ... each by its own page, polite fetch,
 * facts only"). Neither source publishes schema.org Event data; each event page states its facts in regular markup (read
 * 2 November by the polite reader, C:\dev\EVIDENCE\CITY-FIRST-1NOV\geelong-big-rules\):
 *
 *  - GMHBA STADIUM, by the Kardinia Park Stadium Trust (kardiniapark.vic.gov.au): its event sitemap lists /event/<slug>/;
 *    each page has one h1 (the title), one 'event-hero-date' block ('Wed, 2 Dec 2026 7:35 pm') and, where tickets are
 *    sold, a 'Tickets available HERE' link to the seller.
 *  - MT DUNEED ESTATE, by A Day On The Green (adayonthegreen.com.au): its sitemap lists /currenttours/<tour>/<stop>; the
 *    Geelong stop's page names the date ('Sat 28 Nov 2026'), the venue, a ticket table and a Set Times table whose
 *    'Gates Open' row is the start and 'Approximate Finish' row the finish.
 *
 * The fixtures are written for this test in the shape of those pages, not copied from them.
 */

const KP = 'https://www.kardiniapark.vic.gov.au'
const kpPage = (o: { title: string; when: string; tickets?: string }) => `<!doctype html><html><head>
<script type="application/ld+json">{"@type":"BreadcrumbList"}</script></head><body>
<section class="event-hero"><h1 style="color: #FFFFFF;">${o.title}</h1>
<div class="col-12"><div class="event-hero-actions-inner"><div class="event-hero-date">
${o.when}                </div><div class="event-hero-actions"><a href="#">Share</a></div></div></div></section>
<section class="event-body"><p>The organiser's own long words about the night, never kept.</p>
${o.tickets ? `<p>Tickets available <a href="${o.tickets}">HERE</a></p>` : ''}
<h3>More upcoming events</h3><div class="event-card"><h3>Another night</h3><div class="date">Nov 07</div></div></section></body></html>`

describe('GMHBA Stadium rule (Kardinia Park Stadium Trust)', () => {
  const url = `${KP}/event/bp-proof-match/`
  const rule = pageRuleFor(url)

  it('is found for its event pages, and the sitemap leads only to them', () => {
    expect(rule).not.toBeNull()
    expect(rule!.host).toBe('kardiniapark.vic.gov.au')
    const xml = `<urlset><url><loc>${KP}/events/</loc></url><url><loc>${KP}/event/bp-proof-match/</loc></url><url><loc>${KP}/event/bp-second-night/</loc></url><url><loc>${KP}/news/bp-story/</loc></url></urlset>`
    expect(eventPagesFromSitemap(xml, rule!)).toEqual([`${KP}/event/bp-second-night/`, `${KP}/event/bp-proof-match/`])
  })

  it('reads the night: title, start in Melbourne time, the stadium and its street, the seller link', () => {
    const found = rule!.read(kpPage({ title: 'Bp Proof v Colombia', when: 'Wed, 2 Dec 2026 7:35 pm', tickets: 'https://www.ticketmaster.com.au/bp-proof/event/25006545A1BD282E' }), url)
    expect(found).toEqual([{
      title: 'Bp Proof v Colombia',
      startsAt: '2026-12-02T08:35:00.000Z', // 7.35 pm AEDT (UTC+11)
      endsAt: null,
      venueName: 'GMHBA Stadium',
      venueAddress: '354 Moorabool Street, South Geelong VIC 3220',
      pageUrl: url,
      imageUrl: null,
      description: null,
      links: [{ url: 'https://www.ticketmaster.com.au/bp-proof/event/25006545A1BD282E', availability: 'on_sale', priceFromCents: null }],
    }])
  })

  it('reads a noon start, and a title dash as a plain hyphen', () => {
    const [night] = rule!.read(kpPage({ title: 'Bp Proof VS Th&#7875; C&ocirc;ng&#8211;Viettel (Vietnam)', when: 'Sat, 19 Dec 2026 12:00 pm' }), url)
    expect(night.title).toBe('Bp Proof VS Thể Công-Viettel (Vietnam)')
    expect(night.startsAt).toBe('2026-12-19T01:00:00.000Z') // 12.00 pm AEDT
  })

  it('with no seller link, the booking link is the stadium page itself', () => {
    const [night] = rule!.read(kpPage({ title: 'Bp Proof Night', when: 'Wed, 25 Nov 2026 6:45 pm' }), url)
    expect(night.links).toEqual([{ url, availability: 'on_sale', priceFromCents: null }])
  })

  it('reads nothing from a page with no date block or no title', () => {
    expect(rule!.read(kpPage({ title: 'Bp Proof Night', when: 'Date to be announced' }), url)).toEqual([])
    expect(rule!.read(kpPage({ title: '', when: 'Wed, 25 Nov 2026 6:45 pm' }), url)).toEqual([])
  })
})

const AD = 'https://www.adayonthegreen.com.au'
const adPage = (o: { date: string; venue: string; times: [string, string][]; tickets: [string, string][] }) => `<!doctype html><html><body>
<div class="tour-header"><h2 class="fw-bold mb-0 text-start">${o.date}</h2>
<div class="mt-3 text-start d-none d-md-block"><h5 class="fw-normal">${o.venue}</h5><h5>Geelong, Victoria</h5></div>
<h1>
Bp Proof Band												<span class="fw-normal"> Australian &amp; New Zealand Tour 2026</span>
</h1><h4 class="fw-normal">Joined by Bp Support | Bp Other</h4></div>
<p>The promoter's own long words about the tour, never kept.</p>
<div class="tickets"><div>FINAL TICKETS</div>${o.tickets.map(([label, price]) => `<div class="row"><div>${label}</div><div>${price}</div></div>`).join('')}</div>
<div class="set-times"><h2>Set Times</h2><table class="table table-striped"><tbody>
${o.times.map(([t, what]) => `<tr><td class="col-2 pe-2 pe-md-0">${t}<td><td class="col">${what}</td></tr>`).join('')}
</tbody></table></div>
<div class="venue"><div>${o.venue}</div><div>65 Pettavel Road</div><div>Geelong, Victoria</div></div></body></html>`

describe('Mt Duneed Estate rule (A Day On The Green)', () => {
  const url = `${AD}/currenttours/bpproofband/geelong`
  const rule = pageRuleFor(url)
  const tickets: [string, string][] = [
    ['Diamond Reserved Seating', '$349.90'],
    ['General Admission Lawn', '$179.90'],
    ['The Retreat - Upgrade Only', '$120.00'],
    ['Concert &amp; Dining', '$389.90'],
    ['Hamper - Upgrade Only', '$159.00'],
    ['Bp Proof Band VIP Meet &amp; Greet Package', '$499.90'],
  ]
  const times: [string, string][] = [['4:00pm', 'Gates Open'], ['6:00pm', 'Bp Other'], ['8:15pm', 'Bp Proof Band'], ['9:30pm', 'Approximate Finish']]

  it('is found only for the Geelong stops of its tours', () => {
    expect(rule).not.toBeNull()
    expect(rule!.host).toBe('adayonthegreen.com.au')
    const xml = `<urlset><url><loc>${AD}/currenttours</loc></url><url><loc>${AD}/currenttours/bpproofband/geelong</loc></url><url><loc>${AD}/currenttours/bpproofband/huntervalley</loc></url><url><loc>${AD}/past-tours/2024/bpold/geelong</loc></url><url><loc>${AD}/bpproofband-news</loc></url></urlset>`
    expect(eventPagesFromSitemap(xml, rule!)).toEqual([`${AD}/currenttours/bpproofband/geelong`])
  })

  it('reads the night: headline, gates to finish in Melbourne time, the estate and its street, the open price from', () => {
    const found = rule!.read(adPage({ date: 'Sat 28 Nov 2026', venue: 'Mount Duneed Estate', times, tickets }), url)
    expect(found).toEqual([{
      title: 'Bp Proof Band',
      startsAt: '2026-11-28T05:00:00.000Z', // gates 4.00 pm AEDT
      endsAt: '2026-11-28T10:30:00.000Z', // approximate finish 9.30 pm
      venueName: 'Mount Duneed Estate', // the page's own name for it
      venueAddress: '65 Pettavel Road, Geelong VIC',
      pageUrl: url,
      imageUrl: null,
      description: null,
      links: [{ url, availability: 'on_sale', priceFromCents: 17990 }],
    }])
  })

  it('reads nothing when the page is not at Mt Duneed Estate, or names no date or no gates time', () => {
    expect(rule!.read(adPage({ date: 'Sat 28 Nov 2026', venue: 'Bimbadgen', times, tickets }), url)).toEqual([])
    expect(rule!.read(adPage({ date: 'Date to be announced', venue: 'Mount Duneed Estate', times, tickets }), url)).toEqual([])
    expect(rule!.read(adPage({ date: 'Sat 28 Nov 2026', venue: 'Mount Duneed Estate', times: [['9:30pm', 'Approximate Finish']], tickets }), url)).toEqual([])
  })

  it('with no finish row, the night has no finish', () => {
    const [night] = rule!.read(adPage({ date: 'Sat 28 Nov 2026', venue: 'Mt Duneed Estate', times: [['4:00pm', 'Gates Open']], tickets }), url)
    expect(night.endsAt).toBeNull()
  })
})
