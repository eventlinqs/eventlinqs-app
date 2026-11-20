import { describe, expect, it } from 'vitest'
import { notAPlace } from '@/lib/listings/venue-name'

/* The PM's 03:14 of 21 November 2026, item 3. Every 'not a place' below is a venue row production held at 03:30 that
   day; every place is a venue the guides list. */
describe('a venue is a place', () => {
  it.each([
    'City of Greater Geelong',
    'City of Ballarat',
    'City of Ballarat Playgroups',
    'City of Greater Bendigo',
    'City of Melbourne',
    'Surf Coast Shire Council',
    '1 Sailors Gully Road, Eaglehawk',
    '12-14 Smith Street, Collingwood',
  ])('refuses %s', (name) => {
    expect(notAPlace(name)).not.toBeNull()
  })

  it.each([
    'Steampacket Gardens',
    'Old Eaglehawk Court House',
    'Geelong Arts Centre',
    'The Capital',
    'Melbourne Recital Centre',
    'The 9 Lives Bar',
    'Ulumbarra Theatre',
    'Fed Square',
    'Federation Square',
  ])('keeps %s', (name) => {
    expect(notAPlace(name)).toBeNull()
  })

  it('names why', () => {
    expect(notAPlace('City of Greater Geelong')).toMatch(/names a council/)
    expect(notAPlace('1 Sailors Gully Road, Eaglehawk')).toMatch(/street address/)
    expect(notAPlace('  ')).toBe('no venue is named')
  })
})
