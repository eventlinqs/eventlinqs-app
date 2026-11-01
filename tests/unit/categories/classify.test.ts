// CITY FIRST, DIRECTIVE 2: the fifteen guide categories, one primary, up to three secondary, by written rules that are
// the same in every city; nothing matched means review, never a category picked to fill a section.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { classify, GUIDE_CATEGORIES, GUIDE_CATEGORY_WORDS, wordMatches } from '@/lib/categories/classify'

describe('the fifteen', () => {
  test("are exactly the directive's, in its words, with the existing slugs kept", () => {
    expect(GUIDE_CATEGORIES).toHaveLength(15)
    expect(Object.values(GUIDE_CATEGORY_WORDS)).toEqual([
      'Music and concerts', 'Nightlife and DJs', 'Comedy', 'Theatre and performing arts', 'Festivals and cultural events',
      'Sports', 'Food and drink', 'Markets', 'Arts and exhibitions', 'Family and children', 'Community',
      'Classes and workshops', 'Business and networking', 'Health and wellness', 'Education and talks',
    ])
  })
})

describe('the rules, first match wins', () => {
  test("the organiser's own choice stands", () => {
    expect(classify({ organiserChoice: 'music', title: 'Night Market Comedy' })).toMatchObject({ primary: 'music', rule: 'organiser' })
  })

  test("a reviewer's choice stands, unless a precise category added since fits the words", () => {
    expect(classify({ reviewerChoice: 'community', title: 'Lara Community Market' })).toMatchObject({ primary: 'markets', rule: 'reviewer-refined' })
    expect(classify({ reviewerChoice: 'arts-community', title: 'Pantomime at the Playhouse' })).toMatchObject({ primary: 'theatre', rule: 'reviewer-refined' })
    expect(classify({ reviewerChoice: 'comedy', title: 'Laugh Lab' })).toMatchObject({ primary: 'comedy', rule: 'reviewer' })
    // A reviewer's music night that mentions a market keeps music: markets was never carved out of music.
    expect(classify({ reviewerChoice: 'music', title: 'Live at the Market Hotel' })).toMatchObject({ primary: 'music', rule: 'reviewer' })
  })

  test("the source's own category words come before the title", () => {
    expect(classify({ sourceCategories: ['Comedy'], title: 'Friday at the Pub' })).toMatchObject({ primary: 'comedy', rule: 'source-words' })
  })

  test('the most precise words win: a kids yoga class is a class, a night market is a market', () => {
    expect(classify({ title: 'Kids Yoga Class' }).primary).toBe('classes-workshops')
    expect(classify({ title: 'Kids Yoga Class' }).secondary).toEqual(['health-wellness', 'family'])
    expect(classify({ title: 'Geelong Night Market' }).primary).toBe('markets')
  })

  test('whole words only: a Markham street gig is not a market, a classic car show is not a class', () => {
    expect(wordMatches('Live gig on Markham Street')).toEqual(['music'])
    expect(wordMatches('Classic car show')).toEqual([])
  })

  test('nothing matched is review, never a category to fill a section', () => {
    expect(classify({ title: 'Saturday at the Wool Exchange' })).toEqual({ primary: null, secondary: [], rule: 'review', matched: [] })
  })

  test('no city is named in the rules', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/categories/classify.ts'), 'utf8')
    expect(src).not.toMatch(/['"](geelong|ballarat|bendigo|melbourne)['"]/i)
  })
})
