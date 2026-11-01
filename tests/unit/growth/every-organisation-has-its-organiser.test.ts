// EVERY ORGANISATION HAS ITS ORGANISER (WINDOW 3's question of 1 November 2026, answered at 12:30). The funnel and
// ticketing_activations count organisers, so an organisation that signed up on its own must have its organisers row.
// Migration 20261101132001 writes it when the organisation is created and backfills those without one, never linking
// a found host by name; scripts/verify/every-organisation-has-its-organiser-proof.sql proves it on TEST. These tests
// keep the rule in the tree: no later migration may drop it without putting it back.

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const dir = resolve(process.cwd(), 'supabase/migrations')
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const text = (f: string) => readFileSync(resolve(dir, f), 'utf8').replace(/\r\n/g, '\n')
const THE_RULE = '20261101132001_every_organisation_has_its_organiser.sql'

describe('every organisation has its organiser', () => {
  test('the migration writes the row when an organisation is created, from the organisation itself', () => {
    const sql = text(THE_RULE)
    expect(sql).toMatch(/create trigger trg_organisation_gets_its_organiser\s+after insert on public\.organisations/)
    expect(sql).toMatch(/values \(btrim\(new\.name\), new\.id, new\.owner_id,/)
    expect(sql).toMatch(/on conflict do nothing/)
    expect(sql).toMatch(/organiser_acquisition_refresh_quietly/)
  })

  test('it never links a found host by name: it writes only rows that name the organisation', () => {
    const sql = text(THE_RULE)
    expect(sql).not.toMatch(/update public\.organisers/)
  })

  test('no later migration drops the trigger without putting it back in the same file', () => {
    for (const f of files.filter((name) => name > THE_RULE)) {
      const sql = text(f).toLowerCase()
      if (/drop trigger[^;]*trg_organisation_gets_its_organiser/.test(sql)) {
        expect(sql, f).toMatch(/create trigger trg_organisation_gets_its_organiser/)
      }
      expect(sql, f).not.toMatch(/drop function[^;]*organisation_created_gets_its_organiser/)
    }
  })
})
