// GROWTH SYSTEM DIRECTIVE SECTION 7 (Lawal 1 November 2026 16:59; the build order of the CONTROLLER's 17:04): "Every
// experiment must record: hypothesis, target audience, budget, start and end dates, primary metric, baseline, results,
// decision to stop, improve or scale ... Introduce paid advertising only after conversion tracking and contribution
// economics are reliable." These tests keep the register's rules in the tree; the database is proved on TEST by
// scripts/verify/growth-experiments-proof.sql.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const sql = () => readFileSync(resolve(process.cwd(), 'supabase/migrations/20261101165001_growth_experiments.sql'), 'utf8').replace(/\r\n/g, '\n')

describe('the growth experiments register', () => {
  test('records every field section 7 names', () => {
    const s = sql()
    for (const col of ['hypothesis', 'audience', 'budget_cents', 'starts_on', 'ends_on', 'primary_metric', 'baseline', 'result', 'decision']) {
      expect(s).toMatch(new RegExp(`\\b${col}\\b`))
    }
  })

  test('a decision is stop, improve or scale, and is taken only on a result against a baseline', () => {
    const s = sql()
    expect(s).toMatch(/decision text check \(decision is null or decision in \('stop', 'improve', 'scale'\)\)/)
    expect(s).toMatch(/growth_experiments_decided_on_a_result/)
  })

  test('paid advertising waits for reliable tracking: a paid experiment says what made tracking reliable', () => {
    expect(sql()).toMatch(/growth_experiments_paid_needs_tracking_proof/)
  })
})
