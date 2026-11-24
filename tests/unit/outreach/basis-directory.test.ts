import { describe, expect, test } from 'vitest'
import { DIRECTORY_SIZE, basisFinds, directoryRefusal } from '@/lib/outreach/basis-find'

/*
 * A DIRECTORY PAGE TAKES ONLY ITS EVENTS OR OFFICE INBOX (WINDOW 5C, 25 November 2026): a parish's contact page that
 * lists its priests, staff and volunteers gave the nightly pool's rule twelve addresses, four of them volunteers' own
 * free mail, and every one passed. The page here is made up in the same shape; no real person's address is in this file.
 */
const SITE = 'https://www.parish.example'
const PAGE = `<html><body><h1>Contact us</h1>
<p>Parish Priest: Fr John Smith Email: frjohn@parish.example</p>
<p>Assistant Priest: Fr Peter Brown Email: peterb@parish.example</p>
<p>Parish Business Manager: Mr Tom Green Email: tomg@parish.example</p>
<p>Parish Secretary: Mrs Ann White Email: annw@parish.example</p>
<p>Bulletin notices: bulletin@parish.example</p>
<p>Pastoral Council Chairperson: Bill Black Email: bill.black.home@gmail.com</p>
<p>St Vincent de Paul: helpers.svdp@yahoo.com.au</p>
<p>General enquiries: office@parish.example</p>
</body></html>`

describe('a page listing many addresses', () => {
  test('takes its office inbox and the role that handles bookings, never a priest, other staff or a volunteer', () => {
    const { finds, refused } = basisFinds({ name: 'St Example Parish', website: SITE }, [{ url: `${SITE}/contact`, html: PAGE }], [])
    expect(finds.map((f) => f.address).sort()).toEqual(['annw@parish.example', 'office@parish.example'])
    const why = new Map(refused.map((r) => [r.address, r.why]))
    expect(why.get('bill.black.home@gmail.com')).toContain("a person's own mail on a page listing many people")
    expect(why.get('helpers.svdp@yahoo.com.au')).toContain("a person's own mail")
    for (const a of ['frjohn@parish.example', 'peterb@parish.example', 'tomg@parish.example', 'bulletin@parish.example']) {
      expect(why.get(a), a).toContain('not the inbox for their events')
    }
  })
  test('a page with few addresses keeps the rule as it was, and a hotel\'s rooms and restaurant are not its events', () => {
    const html = '<p>Events: events@hotel.example</p><p>Rooms: reservations@hotel.example</p><p>Dining: dining@hotel.example</p>'
    const { finds, refused } = basisFinds({ name: 'Example Hotel', website: 'https://www.hotel.example' }, [{ url: 'https://www.hotel.example', html }], [])
    expect(finds.map((f) => f.address)).toEqual(['events@hotel.example'])
    expect(refused.map((r) => r.address).sort()).toEqual(['dining@hotel.example', 'reservations@hotel.example'])
    expect(DIRECTORY_SIZE).toBe(4)
  })
  test('the rule alone: an events inbox, or a person named in the role, is taken; anyone else is not', () => {
    expect(directoryRefusal('bookings@venue.example', 'own domain', 'Contact: ')).toBeNull()
    expect(directoryRefusal('jane@venue.example', 'own domain', 'Events Coordinator: Jane Doe Email: ')).toBeNull()
    expect(directoryRefusal('jane@venue.example', 'own domain', 'Head Chef: Jane Doe Email: ')).not.toBeNull()
    expect(directoryRefusal('events.team@gmail.com', 'free mail', 'Events: ')).not.toBeNull()
  })
})
