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
    expect(huntCategory('Melbourne United vs Brisbane Bullets', 'music')).toBe('sports')
    expect(huntCategory('South East Melbourne Phoenix vs Cairns Taipans', 'music')).toBe('sports')
    expect(huntCategory('Australia v Colombia', 'music')).toBe('sports')
    expect(huntCategory('BBL|16 - Melbourne Stars v Adelaide Strikers', 'music')).toBe('sports')
  })
  it('a name that only contains the letters vs or v is not a match', () => {
    expect(huntCategory('Elvis Costello', 'music')).toBe('music')
    expect(huntCategory('Vivaldi by Candlelight', 'music')).toBe('music')
  })
  it('the store chooses through this one rule', () => {
    const src = readFileSync('src/lib/listings/collect-store.ts', 'utf8')
    expect(src).toMatch(/huntCategory\(row\.title, hunt\.usualCategory\)/)
    expect(src).not.toMatch(/classify\(\{ title: row\.title \}\)\.primary \?\? hunt\.usualCategory/)
  })
})
