// THE CATEGORIES A NAMED MIGRATION ADDS, judged against a database that may not have them yet (WINDOW 1, 2 November
// 2026, before the city guide car). The guide branch carries the approved record of theatre, markets and
// classes-workshops (each naming 20261101161001) but not that migration file; production holds 22 categories and
// none of the three. The old rule gave no allowance when the file was not in the tree, so the production build would
// have stopped in prebuild on community-layer-protected and discovery-indexability. The allowance is now judged on the
// database alone: all of a migration's categories absent TOGETHER is awaiting; one present and another absent is lost.

import { describe, expect, test } from 'vitest'
import { awaitingCategories } from '../../../scripts/guards/lib/awaiting-categories.mjs'

const rows = [
  { slug: 'music' },
  { slug: 'theatre', migration: '20261101161001_guide_categories.sql' },
  { slug: 'markets', migration: '20261101161001_guide_categories.sql' },
  { slug: 'classes-workshops', migration: '20261101161001_guide_categories.sql' },
]

describe('categories a named migration adds', () => {
  test('a database with none of them is awaiting that migration, whether or not its file is in the tree', () => {
    const r = awaitingCategories(rows, ['music', 'sports'])
    expect([...r.awaiting].sort()).toEqual(['classes-workshops', 'markets', 'theatre'])
    expect(r.lines.join(' ')).toContain('20261101161001_guide_categories.sql')
  })

  test('one present and another absent is a lost category, never awaiting', () => {
    const r = awaitingCategories(rows, ['music', 'theatre'])
    expect(r.awaiting.size).toBe(0)
  })

  test('a database that has them all awaits nothing', () => {
    const r = awaitingCategories(rows, ['music', 'theatre', 'markets', 'classes-workshops'])
    expect(r.awaiting.size).toBe(0)
    expect(r.lines).toEqual([])
  })

  test('a row naming no migration is never excused', () => {
    const r = awaitingCategories([{ slug: 'music' }], [])
    expect(r.awaiting.size).toBe(0)
  })
})
