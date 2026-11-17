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
  // The fight words (the PM's 08:30 of 16 November 2026, item 5): Humanoid Fighting Championship at Margaret Court Arena was
  // listed as Music, the venue's usual category, and put right on production by the reviewer's path at 02:59 that day.
  it('a fight at an arena whose usual category is music is sport, by its own words (the regression case)', () => {
    expect(huntCategory('Humanoid Fighting Championship', 'music', 'Margaret Court Arena')).toBe('sports')
    expect(huntCategory('UFC Fight Night', 'music', 'Rod Laver Arena')).toBe('sports')
    expect(huntCategory('Pro Boxing: Title Fight', 'music', 'Festival Hall')).toBe('sports')
  })
  it("two sides at a theatre are a show, not a match", () => {
    expect(huntCategory('Grease vs Rocky Horror Show', 'music', 'Palais Theatre')).toBe('music')
  })
  // The PM's 04:38 of 18 November 2026: 'An Evening with Alastair Campbell' (a talk, in conversation with Louise Adler) was
  // listed as Music, the Recital Centre's usual category, because no classifier word read its title; the posts already read
  // it as a talk. Where the classifier reads nothing, the one kind reader the posts use (nightKind) decides a talk or a
  // theatre company's production before the venue's usual category.
  it('a talk the classifier cannot read is filed as a talk, never the venue usual category', () => {
    expect(huntCategory('An Evening with Alastair Campbell', 'music', 'Melbourne Recital Centre')).toBe('education')
    expect(huntCategory('Cosi: Geelong Repertory Theatre Company', 'arts-community', 'Woodbin Theatre')).toBe('theatre')
    expect(huntCategory('Elvis Costello', 'music', 'Rod Laver Arena')).toBe('music')
    expect(huntCategory('Vivaldi by Candlelight', 'music', 'Melbourne Recital Centre')).toBe('music')
  })
  it('the store chooses through this one rule', () => {
    const src = readFileSync('src/lib/listings/collect-store.ts', 'utf8')
    expect(src).toMatch(/huntCategory\(row\.title, hunt\.usualCategory, venueName\)/)
    expect(src).not.toMatch(/classify\(\{ title: row\.title \}\)\.primary \?\? hunt\.usualCategory/)
  })
})
