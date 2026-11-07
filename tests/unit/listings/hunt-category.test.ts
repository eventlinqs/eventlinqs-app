import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { huntCategory } from '@/lib/listings/headline-hunt'

/*
 * A MATCH IS SPORT BY ITS OWN WORDS, WHATEVER THE VENUE (class O, read from production on 7 November 2026: the hunt took a
 * venue's usual category when the title classifier could not read a night, so seven Melbourne United and South East
 * Melbourne Phoenix games at John Cain Arena were listed as Music). A title naming two sides ('A vs B', 'A v B') is a
 * match; anything else keeps the classifier's reading, then the venue's usual category, as before.
 */
describe('the category of a hunted night', () => {
  it('a match at an arena whose usual category is music is sport', () => {
    expect(huntCategory('Melbourne United vs Brisbane Bullets', 'music', 'John Cain Arena')).toBe('sports')
    expect(huntCategory('South East Melbourne Phoenix vs Cairns Taipans', 'music', 'John Cain Arena')).toBe('sports')
    expect(huntCategory('Australia v Colombia', 'music', 'GMHBA Stadium')).toBe('sports')
    expect(huntCategory('BBL|16 - Melbourne Stars v Adelaide Strikers', 'music', 'Melbourne Cricket Ground')).toBe('sports')
  })
  it('a name that only contains the letters vs or v is not a match', () => {
    expect(huntCategory('Elvis Costello', 'music', 'Rod Laver Arena')).toBe('music')
    expect(huntCategory('Vivaldi by Candlelight', 'music', 'Rod Laver Arena')).toBe('music')
  })
  // 'Grease vs Rocky Horror Show' is a musical (read from production, 7 November 11:16): two sides in a title are a match only
  // at a sporting venue, an arena, stadium, ground, oval, park or racecourse.
  it("two sides at a theatre are a show, not a match", () => {
    expect(huntCategory('Grease vs Rocky Horror Show', 'music', 'Palais Theatre')).toBe('music')
  })
  it('the store chooses through this one rule', () => {
    const src = readFileSync('src/lib/listings/collect-store.ts', 'utf8')
    expect(src).toMatch(/huntCategory\(row\.title, hunt\.usualCategory, venueName\)/)
    expect(src).not.toMatch(/classify\(\{ title: row\.title \}\)\.primary \?\? hunt\.usualCategory/)
  })
})
