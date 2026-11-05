import { describe, expect, it } from 'vitest'
import { countEvents, eventsPerCityName } from '@/lib/events/event-counts'

/*
 * THE CONTROLLER'S 08:50 (2), FROM THE 5 NOVEMBER AUDIT (C:\dev\EVIDENCE\AUDIT-5NOV\counts.txt): the homepage's city tiles
 * ('Melbourne 211 events') and /cities ('Bendigo VIC 174 events') counted DATES, one row each, while the city's own guide
 * counts EVENTS by its eventKey (Melbourne 97, Bendigo 89). Every count of events reads the guide's one definition.
 */
const row = (title: string, venue_name: string | null, venue_city: string | null) => ({ title, venue_name, venue_city })
const ROWS = [
  row('Storytime', 'Bendigo Library', 'Bendigo'),
  row('Storytime ', 'bendigo library', 'Bendigo'),
  row('Storytime', 'Bendigo Library', 'Bendigo'),
  row('Toddler Time', 'Eaglehawk Library', 'Eaglehawk, Bendigo'),
  row('Benson Boone', 'Rod Laver Arena', 'Melbourne'),
  row('Benson Boone', 'Rod Laver Arena', 'Melbourne'),
  row('Laugh Lab', 'La La Land CBD', 'West Melbourne'),
  row('Boyz II Men', 'Mt Duneed Estate', 'Geelong'),
  row('No city', 'Somewhere', null),
]

describe('countEvents: the guide\'s eventKey, a title at a venue', () => {
  it('counts a night on many dates once, whatever its case or padding', () => {
    expect(countEvents(ROWS)).toBe(6)
  })
  it('counts nothing in nothing', () => {
    expect(countEvents([])).toBe(0)
  })
})

describe('eventsPerCityName: the tiles\' venue_city match, counted in events', () => {
  it('counts each city\'s events, the venue_city containing its name in any case', () => {
    const m = eventsPerCityName(ROWS, ['Melbourne', 'Bendigo', 'Geelong', 'Ballarat'])
    expect(Object.fromEntries(m)).toEqual({ Melbourne: 2, Bendigo: 2, Geelong: 1, Ballarat: 0 })
  })
})
