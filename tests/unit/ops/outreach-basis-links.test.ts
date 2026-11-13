import { describe, expect, it } from 'vitest'
import { linkedPages, MAX_LINKED_PAGES } from '../../../scripts/lib/outreach-basis-links.mjs'

/*
 * A VENUE'S BOOKINGS ADDRESS IS ON ITS CONTACT, HIRE AND BOOKINGS PAGES (the PM's 08:25 of 13 November 2026, (a)): the
 * basis tool follows the links a site's own home page gives to those pages, on its own domain only, and reads each
 * through the polite reader. Another site's link is never followed, however it is worded.
 */
const page = (html: string) => ({ url: 'https://www.thevenue.com.au/', html })

describe('the pages a home page links for an address', () => {
  it('follows its own contact, hire, bookings, functions and about links, by their words or their path', () => {
    const p = page(`
      <a href="/contact-us">Get in touch</a>
      <a href="/venue/hire">Hire the room</a>
      <a href="https://thevenue.com.au/book">Bookings</a>
      <a href="/functions-and-events">Functions</a>
      <a href="/our-story">About us</a>
      <a href="/ask">Enquiries</a>
      <a href="/whats-on">What's on</a>`)
    expect(linkedPages(p, 'thevenue.com.au')).toEqual([
      'https://www.thevenue.com.au/contact-us',
      'https://www.thevenue.com.au/venue/hire',
      'https://thevenue.com.au/book',
      'https://www.thevenue.com.au/functions-and-events',
      'https://www.thevenue.com.au/our-story',
      'https://www.thevenue.com.au/ask',
    ])
  })

  it('never follows another site, a mail or phone link, or the same page twice', () => {
    const p = page(`
      <a href="https://www.eventbrite.com.au/contact">Contact</a>
      <a href="mailto:bookings@thevenue.com.au">Bookings</a>
      <a href="tel:0390000000">Book by phone</a>
      <a href="/contact#form">Contact</a>
      <a href="/contact">Contact us</a>`)
    expect(linkedPages(p, 'thevenue.com.au')).toEqual(['https://www.thevenue.com.au/contact'])
  })

  it('a subdomain of their own site is theirs; at most six pages are taken', () => {
    const many = Array.from({ length: 9 }, (_, i) => `<a href="https://tickets.thevenue.com.au/book-${i}">Book</a>`).join('')
    const out = linkedPages(page(many), 'thevenue.com.au')
    expect(out).toHaveLength(MAX_LINKED_PAGES)
    expect(out[0]).toBe('https://tickets.thevenue.com.au/book-0')
  })

  it('no page, no links', () => {
    expect(linkedPages(null, 'thevenue.com.au')).toEqual([])
  })
})

describe('melbourneDay: a sighting is dated in Melbourne, never in UTC', () => {
  it('is the next day in Melbourne before 11 am daylight time', async () => {
    const { melbourneDay } = await import('../../../scripts/lib/outreach-basis-links.mjs')
    // 10:25 am on 13 November 2026 in Melbourne is 23:25 UTC on the 12th.
    expect(melbourneDay(new Date('2026-11-12T23:25:23Z'))).toBe('2026-11-13')
    expect(melbourneDay(new Date('2026-11-12T12:00:00Z'))).toBe('2026-11-12')
    expect(melbourneDay(new Date('2026-11-13T13:00:00Z'))).toBe('2026-11-14')
  })
})
