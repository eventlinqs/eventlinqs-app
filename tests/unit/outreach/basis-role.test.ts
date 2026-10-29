import { describe, expect, it } from 'vitest'
import { roleRefusal } from '../../../scripts/lib/outreach-basis-role.mjs'

/*
 * The cases are R4 step 2's real ones (29 October 2026): the generator took every address on a page, and 23 of 98 were not
 * the organiser's own role, so a basis under Spam Act Schedule 2 clause 4 (the message relates to their role) would have
 * been wrong for each.
 */
describe('an address is taken for an organiser only in their own role', () => {
  it('refuses another council service on a shared government domain, and keeps the organiser\'s own inbox there', () => {
    const o = 'Ballarat Aquatic and Lifestyle Centre'
    expect(roleRefusal('parentplace@ballarat.vic.gov.au', o, '')).toMatch(/shared government domain/)
    expect(roleRefusal('artgal@ballarat.vic.gov.au', o, '')).toMatch(/shared government domain/)
    expect(roleRefusal('info@ballarat.vic.gov.au', o, '')).toMatch(/shared government domain/)
    expect(roleRefusal('balc@ballarat.vic.gov.au', o, '')).toBeNull()
  })

  it('keeps a library branch named in the organiser and refuses the other branches', () => {
    expect(roleRefusal('bendigo@ncgrl.vic.gov.au', 'Bendigo Library', '')).toBeNull()
    expect(roleRefusal('kyneton@ncgrl.vic.gov.au', 'Bendigo Library', '')).toMatch(/shared government domain/)
    expect(roleRefusal('helpdesk@ncgrl.vic.gov.au', 'Bendigo Library', '')).toMatch(/helpdesk inbox/)
  })

  it('refuses an address published for job applications', () => {
    const before = 'Murphys are always on the lookout for friendly, positive team members to join us. If you think this sounds like you, please email a copy of your resume to '
    expect(roleRefusal('paul@murphysgeelong.com.au', "Murphy's Geelong", before)).toMatch(/job applications/)
  })

  it('does not read a site menu before a footer address as a jobs inbox', () => {
    const menu = 'Events & Specials Functions Join The Team Accessibility FAQs Contact us Merch Social Sanctuary Facebook Instagram Envelope Visit us 301 High Street, Northcote, VIC 3070 Wurundjeri Woi Wurrung Country '
    expect(roleRefusal('bar@northcotesocialclub.com', 'Northcote Social Club (Social Sanctuary)', menu)).toBeNull()
    expect(roleRefusal('info@thealbion.bar', 'OYE Latino (Latin Fridays at The Albion)', 'Venue Hire Careers Contact Reservations Contact (03) 9645 5277 ')).toBeNull()
  })

  it('refuses a restaurant inbox and keeps the events one', () => {
    expect(roleRefusal('steakhouse@mitretavern.com.au', 'The Mitre Tavern', '')).toMatch(/restaurant/)
    expect(roleRefusal('events@mitretavern.com.au', 'The Mitre Tavern', '')).toBeNull()
  })

  it('keeps an organiser\'s ordinary inboxes on their own domain', () => {
    expect(roleRefusal('info@asiaoasis.com.au', 'Asia Oasis', 'Contact us ')).toBeNull()
    expect(roleRefusal('acacia@northcotesocialclub.com', 'Northcote Social Club (Social Sanctuary)', 'Social Sanctuary Band Enquiries ')).toBeNull()
  })
})
