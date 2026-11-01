// CITY FIRST, DIRECTIVE 7: the coverage report counts authorised images by the scorecard's own photo rule. The rule is
// SQL in two functions, so this holds the two predicates identical: a change to one without the other fails here.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const read = (f: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', f), 'utf8').replace(/\r\n/g, '\n')
const photoRule = (sql: string) => {
  const start = sql.indexOf('photo as (select v.id,')
  const end = sql.indexOf(') venue_photo', start)
  expect(start, 'photo rule start').toBeGreaterThan(-1)
  expect(end, 'photo rule end').toBeGreaterThan(start)
  return sql.slice(start, end).replace(/\s+/g, ' ')
}

describe('one photo rule for the scorecard and the city coverage', () => {
  test('the authorised image predicate is the same text in both', () => {
    expect(photoRule(read('20261101162001_city_coverage.sql'))).toBe(photoRule(read('20261101044501_growth_scorecard_selling.sql')))
  })

  test('the coverage counts a city only by placement, never by the label alone', () => {
    const sql = read('20261101162001_city_coverage.sql')
    expect(sql).toMatch(/mine as \(select \* from up where rel in \('city', 'surrounding'\)\)/)
    expect(sql).toMatch(/'upcoming_by_label'/)
  })
})
