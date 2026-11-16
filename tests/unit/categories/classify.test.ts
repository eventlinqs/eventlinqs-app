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
      'Music and concerts', 'Sports', 'Comedy', 'Nightlife and DJs', 'Markets', 'Food and drink', 'Family and children',
      'Arts and exhibitions', 'Theatre and performing arts', 'Festivals and community celebrations',
      'Classes and workshops', 'Business and networking', 'Health and wellness', 'Education and talks', 'Community',
    ])
  })

  // Lawal, 19:17 1 November (CONTROLLER 19:19 (3)): the tiles in the order a visitor looks for them, sport near the top:
  // music, sport, comedy, nightlife, markets, food and drink, family, arts, then the rest, community last (Lawal 01:12,
  // 2 November). The database's guide_order is
  // the same order as this list, one rule in two places, read from the migration that sets it.
  test("are in the order a visitor looks for them, and the database's guide_order is the same order", () => {
    expect(GUIDE_CATEGORIES.slice(0, 8)).toEqual(['music', 'sports', 'comedy', 'nightlife', 'markets', 'food-drink', 'family', 'arts-community'])
    expect(GUIDE_CATEGORIES[GUIDE_CATEGORIES.length - 1]).toBe('community')
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261101192001_guide_order_visitor_first.sql'), 'utf8').replace(/\r\n/g, '\n')
    const pairs = [...sql.matchAll(/\('([a-z-]+)', (\d+)\)/g)].map((m) => [m[1], Number(m[2])])
    expect(pairs).toEqual(GUIDE_CATEGORIES.map((slug, i) => [slug, i + 1]))
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

/*
 * THE FIGHT WORDS (the PM's 08:30 of 16 November 2026, item 5): Humanoid Fighting Championship was listed as Music because
 * no sports word read its title. Read from production that morning: every other title of the last 120 days holding a fight
 * word was a day of the Boxing Day Test, so 'boxing' never counts inside 'Boxing Day'.
 */
describe('the fight words', () => {
  test('a fight is sport by its own words (the regression case)', () => {
    expect(classify({ title: 'Humanoid Fighting Championship' })).toMatchObject({ primary: 'sports', rule: 'title-words' })
    for (const title of ['UFC 312 Fight Night', 'Pro Boxing at Festival Hall', 'MMA: Eternal 91', 'Muay Thai Kickboxing title fight', 'WWE Live Wrestling', 'Brazilian Jiu Jitsu Open']) {
      expect(wordMatches(title)).toContain('sports')
    }
  })

  test("'boxing' never counts inside 'Boxing Day', and the looser words count only in their phrases", () => {
    expect(wordMatches('Boxing Day Picnic in the Gardens')).toEqual([])
    expect(wordMatches('Boxing Day Market')).toEqual(['markets'])
    expect(wordMatches('Boxing Day sales, then boxing at the club')).toEqual(['sports'])
    expect(wordMatches('Fighting for the Reef: a talk')).toEqual(['education'])
    expect(wordMatches('Barista Championship')).toEqual([])
  })

  test('the most precise words still win: a kickboxing class is a class', () => {
    expect(classify({ title: 'Kickboxing class for beginners' }).primary).toBe('classes-workshops')
  })
})
