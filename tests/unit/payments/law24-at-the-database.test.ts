// LAW 24 HOLDS AT THE DATABASE (Lawal 1 November 2026 06:15): every path that sets or deducts a fee (the charge, the
// squad and free checkouts, the payout's application fee, the connect ledger, the webhook, the reports) reads the fee
// the ORDER recorded, so the order row is where the rule is held. Migration 20261101062001 refuses a platform fee on an
// order written inside its organisation's six fee-free months, and refuses any window shorter than six months from
// registration. scripts/verify/law24-at-the-database-proof.sql proves both on TEST. These tests keep the rule in the
// tree: no later migration may drop it without putting it back.

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const dir = resolve(process.cwd(), 'supabase/migrations')
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const text = (f: string) => readFileSync(resolve(dir, f), 'utf8').replace(/\r\n/g, '\n')
const THE_RULE = '20261101062001_law24_holds_at_the_database.sql'

describe('LAW 24 is held at the order row', () => {
  test('the migration refuses a fee inside the window and a window under six months from registration', () => {
    const sql = text(THE_RULE)
    expect(sql).toMatch(/create trigger trg_order_fee_respects_law24\s+before insert or update of platform_fee_cents, organisation_id on public\.orders/)
    expect(sql).toMatch(/founding_fee_free_until >= public\.founding_add_months\(created_at, 6\)/)
    expect(sql).toMatch(/validate constraint organisations_law24_window/)
  })

  test('no later migration drops the trigger or the window rule without putting it back in the same file', () => {
    for (const f of files.filter((name) => name > THE_RULE)) {
      const sql = text(f).toLowerCase()
      if (/drop trigger[^;]*trg_order_fee_respects_law24/.test(sql)) expect(sql, f).toMatch(/create trigger trg_order_fee_respects_law24/)
      if (/drop constraint[^;]*organisations_law24_window/.test(sql)) expect(sql, f).toMatch(/add constraint organisations_law24_window/)
      expect(sql, f).not.toMatch(/drop function[^;]*order_fee_respects_law24/)
    }
  })

  test('the database month rule is the same rule the charge uses (six months from registration)', () => {
    const waiver = readFileSync(resolve(process.cwd(), 'src/lib/payments/founding-waiver.ts'), 'utf8')
    expect(waiver).toMatch(/export const FOUNDING_INITIAL_MONTHS = 6\b/)
    expect(text(THE_RULE)).toMatch(/founding_add_months\(o\.created_at, 6\)/)
  })
})
