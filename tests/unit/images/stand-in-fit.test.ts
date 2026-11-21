import { describe, expect, it } from 'vitest'
import { sportNamed, standInFits } from '@/lib/images/stand-in-fit'

/*
 * A STAND IN SHOWS ITS OWN EVENT (the PM's 07:40 item 3 of 22 November 2026: the fit rule as a test, red on Sheffield
 * Shield showing a basketball court). The cases are production's own assignments read on www after train AZ, retired at
 * retire-unfit-APPLY.sql, and the photographs that replaced them on 22 November.
 */
describe('a stand in shows its own event', () => {
  it('Sheffield Shield shown as a basketball court: refused; as cricket players on a field: fits', () => {
    const shield = { kind: 'sports', words: 'Sheffield Shield Day 1, Victoria v Queensland' }
    expect(standInFits(shield, 'Basketball court')).toBe(false)
    expect(standInFits(shield, 'Cricket players field')).toBe(true)
  })

  it("Wellington Phoenix FC is soccer, not the NBL's Phoenix; the Matildas name soccer in their own words", () => {
    expect(sportNamed('Melbourne City FC vs Wellington Phoenix FC')).toBe('soccer')
    expect(standInFits({ kind: 'sports', words: 'Melbourne City FC vs Wellington Phoenix FC' }, 'Basketball arena game')).toBe(false)
    expect(standInFits({ kind: 'sports', words: 'CommBank Matildas v Colombia' }, 'Soccer stadium match')).toBe(true)
    expect(standInFits({ kind: 'sports', words: 'Australia v Colombia. The Matildas host Colombia.' }, 'Soccer stadium match')).toBe(true)
  })

  it('a sports event whose words name no sport fits no sport photograph, and a photograph of no sport fits no sports event', () => {
    expect(standInFits({ kind: 'sports', words: 'Super Saturday on the Coast' }, 'Swimming pool lanes')).toBe(false)
    expect(standInFits({ kind: 'sports', words: 'Sheffield Shield Day 1' }, 'A crowd at a rock show')).toBe(false)
  })

  it('a toddler time shown as an aquarium: refused; a storytime in a library reading room: fits', () => {
    expect(standInFits({ kind: 'family', words: 'Toddler time' }, 'Aquarium tank')).toBe(false)
    expect(standInFits({ kind: 'family', words: 'Storytime' }, 'Library reading room')).toBe(true)
  })

  it('a musical shown as a pottery wheel: refused; ballet shoes only for a dance night', () => {
    expect(standInFits({ kind: 'arts-community', words: 'CentreStage Presents Frozen: The Broadway Musical' }, 'Pottery wheel clay')).toBe(false)
    expect(standInFits({ kind: 'arts-community', words: 'Swan Lake. A ballet in four acts.' }, 'Ballet shoes')).toBe(true)
    expect(standInFits({ kind: 'arts-community', words: 'Mildly Monstrous Presents Macbeth' }, 'Ballet shoes')).toBe(false)
  })

  it("a photograph of a stage, a choir or a library fits the night its own words name (today's hand allocation)", () => {
    expect(standInFits({ kind: 'arts-community', words: 'Swan Lake' }, 'Ballet dancers as swans on stage')).toBe(true)
    expect(standInFits({ kind: 'arts-community', words: 'Carols by Candlelight Geelong' }, 'A choir on stage')).toBe(true)
  })
})
