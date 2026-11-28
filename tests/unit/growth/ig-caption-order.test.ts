import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { captionOrder } from '@/lib/growth/ig'

/*
 * CAR U, U1, ITS ORDER (the weekend post of 28 November 2026, published 08:00:29). Red on main, where plain /ig numbered
 * the post's nights by the revision's event_ids, which the intake sorts by date: #1 Michael Charles, #3 the Book Market,
 * #5 Kalachakra, while the post's slide 2 and its caption lead with the Book Market and end with Rhys Nicholson then
 * KALACHAKRA. Now the lead follows the order its published caption first names each night, the slides' order.
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
// The published revision 3's Instagram caption as production holds it (read 08:48:10), and its nights in its event_ids order.
const CAPTION = [
  'Six ways to spend the weekend in Melbourne, Sat 28 and Sun 29 Nov.',
  '',
  'Sat 28 and Sun 29 Nov, 9am to 4pm The Melbourne Book Market, A Shed, Queen Victoria Market. Free',
  'Sat 28 Nov, 7.30pm Michael Charles "Where to Next? 2026 international tour, Bird\'s Basement, 11 Singers Lane. From $40',
  'Sat 28 and Sun 29 Nov, 8pm J Cole, Rod Laver Arena. On sale',
  'Sun 29 Nov, 4pm Sunday Laughternoons, Comedy Republic, Bourke St. From $29',
  'Sun 29 Nov, 7.30pm Rhys Nicholson and Work Friends Try Some Loose Ideas, Comedy Republic, Bourke St. From $25',
  'Sun 29 Nov, 7.30pm Adrian Sherriff’s Kalachakra: Afro-Cuban Crossings Debut, JL Room, The JazzLab, Brunswick. From $25',
].join('\n')
const NIGHTS = [
  { id: 'michael', title: 'Michael Charles "Where to Next? 2026 international tour' },
  { id: 'jcole-sat', title: 'J Cole' },
  { id: 'market-sun', title: 'The Melbourne Book Market' },
  { id: 'laughternoons', title: 'Sunday Laughternoons' },
  { id: 'kalachakra', title: 'Adrian Sherriff’s Kalachakra: Afro-Cuban Crossings Debut' },
  { id: 'rhys', title: 'Rhys Nicholson and Work Friends Try Some Loose Ideas' },
  { id: 'jcole-sun', title: 'J Cole' },
]
const IDS = NIGHTS.map((n) => n.id)

describe("the post's own order", () => {
  it('is the order its caption first names each night: the Book Market first, Kalachakra last, J Cole by its dates', () => {
    expect(captionOrder(CAPTION, NIGHTS, IDS)).toEqual(['market-sun', 'michael', 'jcole-sat', 'jcole-sun', 'laughternoons', 'rhys', 'kalachakra'])
  })
  it('reads a title by its part before a colon and with either apostrophe, and puts a night the caption never names after the rest', () => {
    expect(captionOrder('First Kalachakra, then the market: The Melbourne Book Market', [{ id: 'k', title: 'Kalachakra: Afro-Cuban' }, { id: 'm', title: 'The Melbourne Book Market' }, { id: 'x', title: 'Unnamed Night' }], ['x', 'm', 'k'])).toEqual(['k', 'm', 'x'])
    expect(captionOrder('', NIGHTS, IDS)).toEqual(IDS)
  })
  it('is what the lead reads, from the newest revision\'s Instagram caption', () => {
    const ig = read('src/lib/growth/ig.ts')
    expect(ig).toContain(".select('event_ids, versions')")
    expect(ig).toContain("const order = captionOrder(rev?.versions?.instagram?.caption ?? '', page.items.map((i) => ({ id: i.card.id, title: i.card.title })), rev?.event_ids ?? [])")
  })
})
