// THE LEARNING LOOP (Lawal 16:13, relayed by the CONTROLLER 16:14 (5)): every event found by anyone that the engine did
// not already hold goes into a misses register with WHY it was missed, and the fix that stops that kind of miss is
// built; a weekly report shows misses falling. These tests keep the register's rules in the tree; the database
// behaviour is proved on TEST by scripts/verify/event-misses-proof.sql.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const sql = () => readFileSync(resolve(process.cwd(), 'supabase/migrations/20261101163001_event_misses.sql'), 'utf8').replace(/\r\n/g, '\n')

describe('the misses register', () => {
  test('names every reason a miss can have, the ones Lawal named first', () => {
    const s = sql()
    for (const why of ['source_not_registered', 'no_adapter', 'parse_fault', 'wrong_city', 'filtered_wrongly', 'too_late']) {
      expect(s).toContain(`'${why}'`)
    }
  })

  test('records who found it, where, and the fix that stops that kind of miss', () => {
    const s = sql()
    for (const col of ['found_by', 'found_on_url', 'reason', 'fix', 'fixed_at', 'city_slug']) expect(s).toMatch(new RegExp(`\\b${col}\\b`))
    expect(s).toMatch(/found_by text not null check \(found_by in \('window', 'leaders', 'visitor', 'organiser', 'engine'\)\)/)
  })

  test('a weekly report per city by reason, so the trend can be read', () => {
    expect(sql()).toMatch(/create or replace function public\.growth_misses_weekly\(p_city text\)/)
  })
})
