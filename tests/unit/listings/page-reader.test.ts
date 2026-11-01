import { describe, expect, it } from 'vitest'
import { eventPagesFromSitemap, pageRuleFor, PAGE_RULES } from '@/lib/listings/page-rules'
import { runCollection, type CandidateRow, type CollectionStore, type Fetcher } from '@/lib/listings/collect-run'
import type { RegisteredSource } from '@/lib/listings/collect'

/**
 * THE PAGE READER (the CONTROLLER's 15:54 of 1 November 2026): a primary page with no schema.org Event data and no feed
 * is read by a rule written for that source, facts only (title, each performance's date and time, venue, price from,
 * the page as the booking link), never its description or its image. The source's own sitemap leads to its event pages;
 * robots.txt is obeyed for every page; an archived page lands nothing. Every find goes through the same judge to review.
 *
 * The fixtures below are written for this test in the shape of the Geelong Arts Centre's event pages (labelled blocks),
 * not copied from them.
 */

const GAC = 'https://geelongartscentre.org.au'
const SITEMAP = `${GAC}/sitemaps-1-section-event-1-sitemap.xml`

const page = (o: { title: string; performances: [string, string][]; prices: string[]; venue: [string, string]; archived?: boolean }) => `<!doctype html><html><head>
<title>${o.title} | Geelong Arts Centre</title><meta property="og:image" content="https://static.example/poster.jpg"></head><body>
<main><h1 class="x">${o.title}</h1>${o.archived ? '<p>This is an archived Event</p>' : ''}
<p>Description</p><p>A long paragraph of the presenter's own words that must never be kept.</p></main>
<aside><div><p>Performances:</p>${o.performances.map(([d, t]) => `<p><span>${d}</span><span><span>${t}</span></span></p>`).join('')}</div>
<div><p>Ticket Prices:</p>${o.prices.map((p) => `<p><span>Ticket</span><span>${p}</span></p>`).join('')}<p>*$6.95 transaction fee applies</p></div>
<div><p>Venue:</p><p>${o.venue[0]}</p><p>${o.venue[1]}</p><a>Venue Info</a></div></aside></body></html>`

const SHOW = page({
  title: 'Bp Proof Quartet: Songs at Dusk',
  performances: [['Fri, 13 Nov 2026', '07:30pm'], ['Sat, 14 Nov 2026', '02:00pm']],
  prices: ['$45', '$0', '$30'],
  venue: ['Costa Hall', '1 Gheringhap St'],
})

describe('the Geelong Arts Centre rule', () => {
  const rule = pageRuleFor(`${GAC}/whats-on/all-events/bp-proof-quartet/`)

  it('is found for an event page of that site, and for no other site', () => {
    expect(rule).not.toBeNull()
    expect(pageRuleFor('https://example.com/whats-on/all-events/x/')).toBeNull()
    expect(PAGE_RULES.every((r) => r.host && r.eventPath instanceof RegExp)).toBe(true)
  })

  it('reads one night per performance, at its wall clock in Melbourne, with the venue and the price from', () => {
    const found = rule!.read(SHOW, `${GAC}/whats-on/all-events/bp-proof-quartet/`)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({
      title: 'Bp Proof Quartet: Songs at Dusk',
      startsAt: '2026-11-13T08:30:00.000Z', // 7.30 pm AEDT (UTC+11)
      endsAt: null,
      venueName: 'Costa Hall',
      venueAddress: '1 Gheringhap St, Geelong VIC',
      pageUrl: `${GAC}/whats-on/all-events/bp-proof-quartet/`,
    })
    expect(found[1].startsAt).toBe('2026-11-14T03:00:00.000Z')
    expect(found[0].links).toEqual([{ url: `${GAC}/whats-on/all-events/bp-proof-quartet/`, availability: 'on_sale', priceFromCents: 3000 }])
  })

  it('keeps facts only: never the description, never the image', () => {
    for (const e of rule!.read(SHOW, `${GAC}/whats-on/all-events/bp-proof-quartet/`)) {
      expect(e.description).toBeNull()
      expect(e.imageUrl).toBeNull()
    }
  })

  it('an archived page, or one with no performance it can read, lands nothing', () => {
    expect(rule!.read(page({ title: 'Old Show', performances: [['Fri, 07 Aug 2026', '07:00pm']], prices: ['$30'], venue: ['Costa Hall', '1 Gheringhap St'], archived: true }), `${GAC}/whats-on/all-events/old/`)).toEqual([])
    expect(rule!.read('<html><body><h1>Nothing here</h1></body></html>', `${GAC}/whats-on/all-events/none/`)).toEqual([])
  })

  it('a show with every price at $0 is free (price from 0)', () => {
    const free = rule!.read(page({ title: 'Free Foyer Set', performances: [['Sun, 15 Nov 2026', '12:00pm']], prices: ['$0'], venue: ['The Open House', '50 Little Malop St'] }), `${GAC}/whats-on/all-events/foyer/`)
    expect(free[0].links[0].priceFromCents).toBe(0)
  })
})

describe('the sitemap leads to the event pages', () => {
  it('lists only the pages the rule reads', () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>${GAC}/whats-on/all-events/a/</loc></url><url><loc>${GAC}/about-us/</loc></url><url><loc>${GAC}/whats-on/all-events/b/</loc></url></urlset>`
    expect(eventPagesFromSitemap(xml, pageRuleFor(`${GAC}/whats-on/all-events/a/`)!)).toEqual([`${GAC}/whats-on/all-events/a/`, `${GAC}/whats-on/all-events/b/`])
  })
})

describe('the run reads a page-rule source through its sitemap', () => {
  const NOW = new Date('2026-11-01T06:00:00Z')
  const source: RegisteredSource = {
    id: 'gac', name: 'Geelong Arts Centre', pageUrl: SITEMAP, collection: 'read', changes: 'daily', lastCheckedAt: null, lastSuccessAt: null,
    permits: { facts: true, descriptions: false, images: false, links: true }, verified: true, partner: false, partnerVenue: null, citySlug: 'geelong',
  } as RegisteredSource

  it('robots.txt, the sitemap, each allowed event page; a disallowed page is never fetched; finds land for review', async () => {
    const landed: CandidateRow[] = []
    const store: CollectionStore = {
      sources: async () => [source], known: async () => [], heldLinks: async () => new Set(),
      land: async (row) => { landed.push(row); return true }, record: async () => {}, addLinks: async () => {}, logRun: async () => {},
      publishPartnerNight: async () => {}, expirePassed: async () => 0,
    }
    const pages: Record<string, string> = {
      [`${GAC}/robots.txt`]: 'User-agent: *\nDisallow: /whats-on/all-events/private/\n\nUser-agent: GPTBot\nDisallow: /',
      [SITEMAP]: `<urlset><url><loc>${GAC}/whats-on/all-events/quartet/</loc></url><url><loc>${GAC}/whats-on/all-events/private/</loc></url><url><loc>${GAC}/whats-on/all-events/old/</loc></url></urlset>`,
      [`${GAC}/whats-on/all-events/quartet/`]: SHOW,
      [`${GAC}/whats-on/all-events/old/`]: page({ title: 'Old Show', performances: [['Fri, 07 Aug 2026', '07:00pm']], prices: ['$30'], venue: ['Costa Hall', '1 Gheringhap St'], archived: true }),
    }
    const asked: string[] = []
    const fetcher: Fetcher = async (url) => {
      asked.push(url)
      if (!(url in pages)) throw new Error('unreachable')
      return { status: 200, text: async () => pages[url] }
    }
    const r = await runCollection(store, fetcher, NOW, Infinity, { pauseMs: 0 })
    expect(asked).toEqual([`${GAC}/robots.txt`, SITEMAP, `${GAC}/whats-on/all-events/quartet/`, `${GAC}/whats-on/all-events/old/`])
    expect(r.read).toBe(1)
    expect(landed.map((l) => [l.title, l.startsAt, l.decidedBy])).toEqual([
      ['Bp Proof Quartet: Songs at Dusk', '2026-11-13T08:30:00.000Z', 'person'],
      ['Bp Proof Quartet: Songs at Dusk', '2026-11-14T03:00:00.000Z', 'person'],
    ])
    expect(landed.every((l) => l.description === null && l.imageUrl === null)).toBe(true)
  })

  it('a page that answers 403 or 429 stops the source at once: no further page of it is asked, and the run says why', async () => {
    const landed: CandidateRow[] = []
    const recorded: Record<string, string> = {}
    const store: CollectionStore = {
      sources: async () => [source], known: async () => [], heldLinks: async () => new Set(),
      land: async (row) => { landed.push(row); return true }, record: async (id, outcome) => { recorded[id] = outcome }, addLinks: async () => {}, logRun: async () => {},
      publishPartnerNight: async () => {}, expirePassed: async () => 0,
    }
    const asked: string[] = []
    const fetcher: Fetcher = async (url) => {
      asked.push(url)
      if (url === `${GAC}/robots.txt`) return { status: 200, text: async () => 'User-agent: *
Disallow: /cpresources/' }
      if (url === SITEMAP) return { status: 200, text: async () => `<urlset><url><loc>${GAC}/whats-on/all-events/quartet/</loc></url><url><loc>${GAC}/whats-on/all-events/two/</loc></url><url><loc>${GAC}/whats-on/all-events/three/</loc></url></urlset>` }
      if (url === `${GAC}/whats-on/all-events/quartet/`) return { status: 200, text: async () => SHOW }
      return { status: 429, text: async () => 'slow down' }
    }
    await runCollection(store, fetcher, NOW, Infinity, { pauseMs: 0 })
    expect(asked).toEqual([`${GAC}/robots.txt`, SITEMAP, `${GAC}/whats-on/all-events/quartet/`, `${GAC}/whats-on/all-events/two/`])
    expect(landed).toHaveLength(2)
    expect(recorded.gac).toMatch(/answered 429 .*reading stopped/)
  })
})
