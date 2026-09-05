import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACTION_FILE,
  MIGRATION_FILE,
  actionCallsRpc,
  findDirectWrites,
  migrationDeclaresDeferredTriggers,
  runGuard,
} from '../../../scripts/guards/price-history-integrity.mjs'

/**
 * PRICE-HISTORY-INTEGRITY: the guard that keeps ticket_price_history a record
 * the database wrote, and keeps the dynamic pricing save one transaction
 * (scripts/guards/price-history-integrity.mjs). These pin the scanner's three
 * judgements against the exact shapes it exists to catch, and prove the guard
 * is green on the tree as committed.
 */
const ROOT = join(__dirname, '..', '..', '..')

describe('findDirectWrites: a write on the builder for the named table', () => {
  test('the old three-statement save is caught, with its line and method', () => {
    const text = [
      "const { error: deleteError } = await adminClient",
      "  .from('dynamic_pricing_rules')",
      "  .delete()",
      "  .eq('ticket_tier_id', tier_id)",
      '',
      "const { error: insertError } = await adminClient",
      "  .from('dynamic_pricing_rules')",
      "  .insert(rows)",
    ].join('\n')
    expect(findDirectWrites(text, 'dynamic_pricing_rules')).toEqual([
      { line: 2, method: 'delete' },
      { line: 7, method: 'insert' },
    ])
  })

  test('a read is not a write', () => {
    const text = "const { data } = await supabase.from('dynamic_pricing_rules').select('id, price_cents').in('ticket_tier_id', ids)"
    expect(findDirectWrites(text, 'dynamic_pricing_rules')).toEqual([])
  })

  test('an insert into the history from application code is caught', () => {
    const text = "await admin.from('ticket_price_history').insert({ event_id, tier_name, price_cents, reason: 'changed' })"
    expect(findDirectWrites(text, 'ticket_price_history')).toEqual([{ line: 1, method: 'insert' }])
  })

  test('a write on a DIFFERENT table after a read of this one is not attributed to it', () => {
    const text = [
      "const { data } = await supabase.from('ticket_price_history').select('id')",
      '',
      "await admin.from('orders').update({ status: 'confirmed' })",
    ].join('\n')
    expect(findDirectWrites(text, 'ticket_price_history')).toEqual([])
  })

  test('double quotes and backticks name the table too', () => {
    expect(findDirectWrites('x.from("ticket_price_history").upsert(r)', 'ticket_price_history')).toHaveLength(1)
    expect(findDirectWrites('x.from(`ticket_price_history`).update(r)', 'ticket_price_history')).toHaveLength(1)
  })
})

describe('actionCallsRpc and migrationDeclaresDeferredTriggers', () => {
  test('the action must reach save_dynamic_pricing by name', () => {
    expect(actionCallsRpc("await adminClient.rpc('save_dynamic_pricing', { p_tier_id })")).toBe(true)
    expect(actionCallsRpc("await adminClient.from('ticket_tiers').update({ dynamic_pricing_enabled })")).toBe(false)
  })

  test('an immediate trigger in place of a deferred one is named', () => {
    const sql = readFileSync(join(ROOT, MIGRATION_FILE), 'utf8')
    expect(migrationDeclaresDeferredTriggers(sql)).toEqual([])
    const immediate = sql.replace(
      /CREATE CONSTRAINT TRIGGER dynamic_pricing_rules_record_price_history[\s\S]*?DEFERRABLE INITIALLY DEFERRED/,
      (m) => m.replace('DEFERRABLE INITIALLY DEFERRED', 'NOT DEFERRABLE'),
    )
    expect(migrationDeclaresDeferredTriggers(immediate)).toEqual(['dynamic_pricing_rules_record_price_history'])
  })
})

describe('the guard on the tree as committed', () => {
  test('is green: no direct writes, the action reaches the RPC, both triggers deferred', () => {
    const { scanned, failures } = runGuard(ROOT)
    expect(scanned).toBeGreaterThan(100)
    expect(failures).toEqual([])
  })

  test('the action file it names exists and calls the RPC', () => {
    expect(actionCallsRpc(readFileSync(join(ROOT, ACTION_FILE), 'utf8'))).toBe(true)
  })

  test('is registered in the runner', () => {
    const runner = readFileSync(join(ROOT, 'scripts', 'guards', 'run-guards.mjs'), 'utf8')
    expect(runner).toContain("'scripts/guards/price-history-integrity.mjs'")
  })
})
