import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { onOwnHost, ownHost } from '@/lib/outreach/own-host'

/*
 * A NIGHT BOOKED ON THE ORGANISER'S OWN WEBSITE IS THEIRS (the PM's 14:12 of 12 November 2026, twenty a day lawfully):
 * how a promoter's nights at a hired venue are theirs without linking them to the venue. A shared host is never anyone's.
 */
describe("an organiser's own website host", () => {
  it('is the host of their own site, without www, and nothing for a malformed address', () => {
    expect(ownHost('https://www.nextstopcomedy.com/')).toBe('nextstopcomedy.com')
    expect(ownHost('https://tipsysketching.club')).toBe('tipsysketching.club')
    expect(ownHost('https://geelongartscentre.org.au/whats-on')).toBe('geelongartscentre.org.au')
    expect(ownHost('not a url')).toBeNull()
    expect(ownHost(null)).toBeNull()
  })
  it('a shared ticketing, social, builder, government or education host is never anyone\'s own', () => {
    for (const u of [
      'https://www.eventbrite.com.au/o/someone',
      'https://events.humanitix.com/x',
      'https://www.trybooking.com/BXYZ',
      'https://www.instagram.com/someone',
      'https://linktr.ee/someone',
      'https://www.ballarat.vic.gov.au/',
      'https://www.ncgrl.vic.gov.au/storytimes/',
      'https://www.unimelb.edu.au/events',
      'https://someone.wixsite.com/site',
      'https://www.eventlinqs.com.au/events/x',
    ]) expect(ownHost(u), u).toBeNull()
  })
  it('the drafter and the photo page read nights through the one reader', () => {
    const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')
    expect(read('src', 'lib', 'outreach', 'twenty-drafts.ts')).toMatch(/readTheirNights\(db, organiser, now, 1\)/)
    expect(read('src', 'lib', 'listings', 'photo-permission.ts')).toMatch(/readTheirNights\(db, \{/)
    expect(read('src', 'lib', 'outreach', 'their-nights.ts')).toMatch(/ownHost\(organiser\.website_url\)/)
  })
})

describe("a booking page on their own host (the PM's 06:13 of 13 November 2026, the twenty's supply)", () => {
  it('is their host, its www, or any subdomain of it: their own box office', () => {
    expect(onOwnHost('https://sovereignhill.com.au/events', 'sovereignhill.com.au')).toBe(true)
    expect(onOwnHost('https://www.sovereignhill.com.au/events', 'sovereignhill.com.au')).toBe(true)
    expect(onOwnHost('https://shtickets.sovereignhill.com.au/book/123', 'sovereignhill.com.au')).toBe(true)
    expect(onOwnHost('https://tickets.birdsbasement.com/e/1', 'birdsbasement.com')).toBe(true)
  })

  it('is never a lookalike, another site that only mentions their host, or a malformed address', () => {
    expect(onOwnHost('https://evilsovereignhill.com.au/', 'sovereignhill.com.au')).toBe(false)
    expect(onOwnHost('https://sovereignhill.com.au.example.com/', 'sovereignhill.com.au')).toBe(false)
    expect(onOwnHost('https://www.eventbrite.com.au/e/1?ref=https://shtickets.sovereignhill.com.au/', 'sovereignhill.com.au')).toBe(false)
    expect(onOwnHost('not a url', 'sovereignhill.com.au')).toBe(false)
    expect(onOwnHost(null, 'sovereignhill.com.au')).toBe(false)
  })

  it('is what the reader of their nights confirms every match on', () => {
    const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')
    expect(read('src', 'lib', 'outreach', 'their-nights.ts')).toMatch(/onOwnHost\(l\.url as string, host\)/)
    expect(read('src', 'lib', 'outreach', 'their-nights.ts')).toMatch(/onOwnHost\(e\.external_ticket_url as string \| null, host\)/)
  })
})

