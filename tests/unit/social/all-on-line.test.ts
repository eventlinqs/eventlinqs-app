import { describe, expect, it } from 'vitest'
import { allOnLine } from '@/lib/social/campaign'
import { languageFaults } from '@/lib/social/piece-quality'

/*
 * 'ALL TWO ON EVENTLINQS' (production's tonight piece for Geelong, read at 16:40:53 on 19 November 2026 and looked at in
 * the round 2 samples), fixed as a class (law 4): the tonight slide's tap line and the ask slide's closing line say 'Both'
 * for two and never 'All one', and the language gate refuses the old words, so a stored piece carrying them is drawn again.
 */
describe("the tap line says 'both' for two, never 'all one' or 'all two'", () => {
  it.each([
    [1, 'On EventLinqs'],
    [2, 'Both on EventLinqs'],
    [3, 'All three on EventLinqs'],
    [5, 'All five on EventLinqs'],
  ])('%i nights: %s', (n, line) => {
    expect(allOnLine(n)).toBe(line)
    expect(languageFaults([allOnLine(n)])).toEqual([])
  })

  it('the language gate refuses the old words, so a stored piece carrying them is drawn again', () => {
    expect(languageFaults(['All two on EventLinqs'])).toEqual(['[language] "All two on" is not correct English; write it again.'])
    expect(languageFaults(['All one on EventLinqs'])).toHaveLength(1)
    expect(languageFaults(['All 2 are on EventLinqs.'])).toHaveLength(1)
  })

  it('the drill: three or more read clean, and a title that only starts with All is never refused', () => {
    expect(languageFaults(['All three on EventLinqs', 'All 12 are on EventLinqs.', 'All Two Feet Festival, The Barwon Club'])).toEqual([])
  })
})
