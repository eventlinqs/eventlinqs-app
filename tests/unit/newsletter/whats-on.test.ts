import { describe, expect, it } from 'vitest'
import { buildWhatsOn, pickProblems, PRICE_LABEL_MAX, type NlPick, type WhatsOnInput } from '@/lib/newsletter/whats-on'
import { selectSlots, tierOfNight, type EditionNight } from '@/lib/newsletter/select'

/*
 * NL-1 (law 46, Lawal's design A of 21 November 2026; reference C:\dev\EVIDENCE\EL-21NOV\nl-design\whats-on\build_a.py):
 * the edition drawn from data, the copy gate per pick, and the transparent selection. The picks are design A's own
 * Melbourne weekend (21 to 22 November 2026), as production listed them.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const pick = (over: Partial<NlPick> & { slug: string; title: string }): NlPick => ({
  categoryLabel: null,
  categorySlug: null,
  whenLabel: 'Sat 21 Nov, 7:30pm',
  venue: 'Venue',
  priceLabel: 'Free entry',
  image: 'https://img.example/x.jpg',
  imageAlt: 'A photograph of the night',
  ...over,
})
const input = (over: Partial<WhatsOnInput> = {}): WhatsOnInput => ({
  edition: 'weekend',
  editionId: 'weekend-melbourne-2026-11-21',
  cityName: 'Melbourne',
  citySlug: 'melbourne',
  datesLabel: 'Sat 21 to Sun 22 Nov 2026',
  subjectDates: 'Sat 21 to Sun 22 Nov',
  areaLabel: 'Melbourne & Surrounds',
  heroImage: { desktop: 'https://img.example/hero-d.jpg', mobile: 'https://img.example/hero-m.jpg' },
  intro: "It's a big weekend in Melbourne: festivals, live music, comedy and plenty of free events.",
  featured: {
    ...pick({ slug: 'amcf-2026', title: 'African Music and Cultural Festival 2026', categoryLabel: 'Festival', categorySlug: 'festivals', whenLabel: 'Sat 21 to Sun 22 Nov', venue: 'Federation Square' }),
    blurb: 'Saturday and Sunday are still to come. Walk in, it is free.',
    featImage: { desktop: 'https://img.example/feat-d.jpg', mobile: 'https://img.example/feat-m.jpg' },
  },
  highlights: [
    pick({ slug: 'colours-of-asia', title: 'Colours of Asia: Garden of Wonders', categoryLabel: 'Festival', categorySlug: 'festivals', whenLabel: 'Sat 21 Nov, from 11am', venue: 'Alexandra Gardens' }),
    pick({ slug: 'vinicius-duo', title: 'Vinicius Cantuaria and Chico Pinheiro Duo', categoryLabel: 'Live music', categorySlug: 'music', venue: "Bird's Basement", priceLabel: "Tickets at Bird's Basement" }),
    pick({ slug: 'comedy-republic', title: 'Comedy Republic Main Stage', categoryLabel: 'Comedy', categorySlug: 'comedy', whenLabel: 'Sat 21 Nov, 8pm', venue: 'Comedy Republic', priceLabel: 'Tickets at Comedy Republic' }),
  ],
  free: pick({ slug: 'run-the-tan', title: 'Run the Tan: Run Club', whenLabel: 'Sat 21 Nov, 8am', venue: 'Tan Track' }),
  gem: pick({ slug: 'book-market', title: 'The Melbourne Book Market', whenLabel: 'Sat 21 Nov, 9am', venue: 'Queen Victoria Market' }),
  drive: { ...pick({ slug: 'the-church', title: 'The Church: A Psychedelic Symphony', venue: 'Costa Hall', priceLabel: 'Tickets at Costa Hall' }), cityName: 'Geelong' },
  alerts: [pick({ slug: 'beck', title: 'Beck', priceLabel: 'Tickets on AXS' }), pick({ slug: 'year-8-teachers', title: 'The Year 8 Teachers', priceLabel: 'Tickets at Comedy Republic' })],
  origin: ORIGIN,
  unsubscribeUrl: `${ORIGIN}/unsubscribe/digest/token`,
  manageUrl: `${ORIGIN}/newsletter/city`,
  referUrl: `${ORIGIN}/newsletter/refer`,
  ...over,
})

describe("What's On in Melbourne, drawn from data in Lawal's design", () => {
  const out = buildWhatsOn(input())
  it("titles itself as the design does, and every slot is there", () => {
    expect(out.subject).toBe("What's On in Melbourne this weekend, Sat 21 to Sun 22 Nov")
    for (const words of ['What&#8217;s On in<br>', 'Melbourne', 'Featured festival', 'More Weekend Highlights', 'Free This Weekend', 'Hidden Gem', 'Worth the Drive', 'Ticket Alert', 'Know someone who&#8217;d love this?', 'Manage preferences', 'Unsubscribe']) {
      expect(out.html).toContain(words)
    }
    expect(out.leftOut).toEqual([])
  })
  it('every event link carries the newsletter, the edition and its slot', () => {
    const hrefs = [...out.html.matchAll(/href="(https:\/\/www\.eventlinqs\.com\.au\/events\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
    expect(hrefs.length).toBeGreaterThanOrEqual(10)
    for (const h of hrefs) {
      const u = new URL(h)
      expect(u.searchParams.get('utm_source')).toBe('newsletter')
      expect(u.searchParams.get('utm_medium')).toBe('email')
      expect(u.searchParams.get('utm_campaign')).toBe('weekend-melbourne-2026-11-21')
      expect(u.searchParams.get('utm_content')).toMatch(/^(featured|h[1-3]|free|gem|drive|alert[12])$/)
    }
    // The ticket alert's own button keeps its anchor after the query.
    expect(out.html).toContain('/city/melbourne?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=weekend-melbourne-2026-11-21&amp;utm_content=alert#just-announced')
  })
  it('the footer names the business from the founder signature, and the plain text part carries every pick', () => {
    expect(out.html).toMatch(/EventLinqs, ABN 30 837 447 587, Geelong VIC, Australia/)
    for (const t of ['African Music and Cultural Festival 2026', 'Comedy Republic Main Stage', 'Run the Tan: Run Club', 'Beck']) expect(out.text).toContain(t)
    expect(out.text).toContain('Unsubscribe: https://www.eventlinqs.com.au/unsubscribe/digest/token')
  })
  it('no dash and no exclamation mark anywhere in its words', () => {
    const words = out.html.replace(/<style[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ')
    expect(words).not.toMatch(/[\u2013\u2014]|\s-\s/)
    expect(words).not.toContain('!')
  })
})

describe('the copy gate leaves a failing pick out alone, never the edition (law 22)', () => {
  it('a dash, a placeholder, a sentence for a price, the banned word: each refused with its reason', () => {
    expect(pickProblems(pick({ slug: 'a', title: 'Quintet - JL' }))).toEqual(expect.arrayContaining([expect.stringMatching(/a dash/)]))
    expect(pickProblems(pick({ slug: 'b', title: 'Night', venue: 'TBA' }))).toEqual(expect.arrayContaining([expect.stringMatching(/a placeholder/)]))
    const sentence = 'Free entry, but bring a gold coin for the community stall on the day'
    expect(sentence.length).toBeGreaterThan(PRICE_LABEL_MAX)
    expect(pickProblems(pick({ slug: 'c', title: 'Night', priceLabel: sentence }))).toEqual(expect.arrayContaining([expect.stringMatching(/a sentence, not a label/)]))
    expect(pickProblems(pick({ slug: 'd', title: 'Night', imageAlt: 'A cultural night out' }))).toEqual(expect.arrayContaining([expect.stringMatching(/banned word/)]))
    // A night's own name may carry it (AMCF's title).
    expect(pickProblems(pick({ slug: 'e', title: 'African Music and Cultural Festival 2026' }))).toEqual([])
  })
  it('a failing highlight is left out; the rest of the edition draws', () => {
    const bad = pick({ slug: 'bad', title: 'Bad - Night' })
    const out = buildWhatsOn(input({ highlights: [bad, ...input().highlights.slice(0, 2)] }))
    expect(out.leftOut).toEqual([expect.stringMatching(/^h1 bad: a dash/)])
    expect(out.html).not.toContain('/events/bad')
    expect(out.html).toContain('/events/colours-of-asia')
  })
  it('a slot the supply cannot fill is left out, never invented', () => {
    const out = buildWhatsOn(input({ gem: null, drive: null, alerts: [] }))
    expect(out.html).not.toContain('Hidden Gem')
    expect(out.html).not.toContain('Worth the Drive')
    expect(out.html).not.toContain('Ticket Alert')
    expect(out.html).toContain('Free This Weekend')
  })
})

describe('the selection is written out: tier, own photograph, variety, never twice', () => {
  const NOW = new Date('2026-11-20T20:00:00Z')
  const night = (over: Partial<EditionNight> & { id: string; title: string }): EditionNight => ({
    slug: over.id,
    startDate: '2026-11-21T09:00:00Z',
    endDate: null,
    venue: 'A Room',
    categorySlug: 'music',
    categoryName: 'Music',
    isFree: false,
    ticketed: true,
    ticketedHere: false,
    image: 'https://img.example/x.jpg',
    ownPhoto: true,
    listedAt: '2026-11-01T00:00:00Z',
    ...over,
  })
  const nights = [
    night({ id: 'knit', title: 'Knitting and crochet social group', venue: 'Biyal-a Armstrong Creek Library', ticketed: false, isFree: true, categorySlug: 'community' }),
    night({ id: 'arena', title: 'Two Big Bands', venue: 'Rod Laver Arena', startDate: '2026-11-22T09:00:00Z' }),
    night({ id: 'jazz', title: 'Late Jazz', venue: "Bird's Basement" }),
    night({ id: 'jazz2', title: 'Early Jazz', venue: 'The JazzLab', startDate: '2026-11-21T07:00:00Z' }),
    night({ id: 'comedy', title: 'Main Stage', venue: 'Comedy Republic', categorySlug: 'comedy' }),
    night({ id: 'market', title: 'Book Market', venue: 'Queen Victoria Market', ticketed: false, isFree: true, categorySlug: 'markets' }),
    night({ id: 'noimg', title: 'A Night With No Picture', venue: 'Corner Hotel', image: null, ownPhoto: false }),
  ]
  const slots = selectSlots({ nights, driveNights: [night({ id: 'costa', title: 'The Church', venue: 'Costa Hall' })], laterNights: [night({ id: 'beck', title: 'Beck', venue: 'Margaret Court Arena', startDate: '2027-02-18T08:30:00Z', listedAt: '2026-11-20T11:12:00Z' })], now: NOW })
  it('leads with the headline night; a library session never leads or highlights', () => {
    expect(tierOfNight(nights[0])).toBe(4)
    expect(slots.featured?.id).toBe('arena')
    expect(slots.highlights.map((n) => n.id)).not.toContain('knit')
  })
  it('varies the categories across the highlights while another is there', () => {
    const cats = slots.highlights.map((n) => n.categorySlug)
    expect(new Set(cats).size).toBe(cats.length)
  })
  it('no night twice; the free slot is a real free night; the drive and the alert come from their own lists', () => {
    const all = [slots.featured, ...slots.highlights, slots.free, slots.gem, slots.drive, ...slots.alerts].filter((n) => n !== null).map((n) => n!.id)
    expect(new Set(all).size).toBe(all.length)
    expect(slots.free?.isFree).toBe(true)
    expect(slots.drive?.id).toBe('costa')
    expect(slots.alerts.map((n) => n.id)).toEqual(['beck'])
  })
})

/*
 * A URL INSIDE <style> IS NEVER HTML-ESCAPED (found by looking, 21 November 2026, 14:44: the practice weekend editions at
 * 390 showed an empty navy band where the city photograph belongs). The phone hero's URL sat inside the <style> element
 * written with &amp;, and a <style> element's text is raw, its entities never decoded, so the image proxy received
 * 'amp;src' and answered 400 (the same URL with & answered 200 image/jpeg). Attribute values are decoded, so the desktop
 * hero, the featured card and the cards were whole. Every edition on a phone lost its city photograph.
 */
describe('the edition writes each image URL for the context it sits in', () => {
  const proxied = (k: string) => `${ORIGIN}/api/newsletter/image?k=${k}&src=https%3A%2F%2Fimages.example%2Fa.jpg`
  const styleOf = (html: string) => html.slice(html.indexOf('<style'), html.indexOf('</style>'))

  it('the phone hero inside <style> keeps its & and carries no HTML entity', () => {
    const { html } = buildWhatsOn(input({ heroImage: { desktop: proxied('hero-d'), mobile: proxied('hero-m') } }))
    expect(styleOf(html)).toContain(`url('${proxied('hero-m')}')`)
    expect(styleOf(html)).not.toMatch(/&(amp|quot|lt|gt|#\d+);/)
  })

  it('a character that could end the url() or the element is percent-encoded there, never written as an entity', () => {
    const { html } = buildWhatsOn(input({ heroImage: { desktop: 'https://img.example/d.jpg', mobile: "https://img.example/m.jpg?x=a'b)c</style>" } }))
    expect(styleOf(html)).toContain("url('https://img.example/m.jpg?x=a%27b%29c%3C/style%3E')")
  })

  it('the desktop hero in its attributes stays escaped, as an attribute must be', () => {
    const { html } = buildWhatsOn(input({ heroImage: { desktop: proxied('hero-d'), mobile: proxied('hero-m') } }))
    expect(html).toContain(`background="${ORIGIN}/api/newsletter/image?k=hero-d&amp;src=`)
  })
})

/*
 * 'VIEW IN BROWSER' (the PM's order of 21 November 2026, about 03:30): an edition opens its own web copy
 * (/newsletter/<edition>/<city>/<date>) from above the masthead and from the plain text part; the web copy itself carries
 * no link to itself.
 */
describe('View in browser', () => {
  const web = `${ORIGIN}/newsletter/weekend/melbourne/2026-11-21`

  it('the edition links its web copy above the masthead and first in the text part', () => {
    const { html, text } = buildWhatsOn(input({ webUrl: web }))
    expect(html).toContain(`<a href="${web}" style="color:#4A5466;text-decoration:underline">View in browser</a>`)
    expect(html.indexOf('View in browser')).toBeLessThan(html.indexOf('class="hero"'))
    expect(text.split('\n')[0]).toBe(`View in browser: ${web}`)
  })

  it('the web copy carries none', () => {
    const { html, text } = buildWhatsOn(input({ webUrl: null }))
    expect(html).not.toContain('View in browser')
    expect(text).not.toContain('View in browser')
  })
})
