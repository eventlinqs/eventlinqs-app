import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TEMPLATE_CLASS } from '@/lib/comms/categories'
import { classify } from '../../../scripts/ops/pipeline-migrations.mjs'

// THE SOURCE ASK TAKES ITS CLASS (the founder, 12:14 of 23 November 2026; law 24): migration 20261123130001 changes
// public.comms_subtype_of_template_key IN PLACE from the function in force (law 14 (z)), one row after its one anchor,
// refusing when the anchor is not there exactly once, and changing nothing on a second run. Its rules, read from its SQL,
// and its effect, applied here to the full map in force (20261121150001) exactly as the migration applies it.

const MIGRATIONS = join(process.cwd(), 'supabase/migrations')
const sql = readFileSync(join(MIGRATIONS, '20261123130001_source_ask_takes_its_class.sql'), 'utf8').replace(/\r\n/g, '\n')
const inForce = readFileSync(join(MIGRATIONS, '20261121150001_lifecycle_letters_take_their_class.sql'), 'utf8').replace(/\r\n/g, '\n')
const ANCHOR = "('lifecycle_perm', 'PERM-IMAGE'),"
const ROW = "('source_ask', 'PERM-SOURCE'),"

const mapOf = (text: string): Record<string, string> => {
  const block = text.slice(text.indexOf('select m.subtype from (values'), text.indexOf(') as m(key, subtype)'))
  return Object.fromEntries([...block.matchAll(/\('([a-z0-9_]+)', '([A-Z0-9-]+)'\)/g)].map((m) => [m[1], m[2]]))
}
const count = (hay: string, needle: string) => hay.split(needle).length - 1

describe('migration 20261123130001: the source ask takes its class', () => {
  it('reads the function in force and changes it in place, never writing a whole new text', () => {
    expect(sql).toContain("v_def := pg_get_functiondef('public.comms_subtype_of_template_key(text)'::regprocedure);")
    expect(sql).toContain('execute v_def;')
    expect(sql.toLowerCase()).not.toContain('create or replace function')
  })

  it('puts the one row right after its one anchor, and refuses unless the anchor is there exactly once', () => {
    expect(sql).toContain("v_anchor constant text := '(''lifecycle_perm'', ''PERM-IMAGE''),';")
    expect(sql).toContain("v_row constant text := '(''source_ask'', ''PERM-SOURCE''),';")
    expect(sql).toContain("v_def := replace(v_def, v_anchor, v_anchor || E'\\n    ' || v_row);")
    expect(sql).toMatch(/if v_count <> 1 then\s+raise exception 'the template map in force holds the anchor % % times, not once; nothing changed'/)
    expect(count(inForce, ANCHOR)).toBe(1)
  })

  it('changes nothing on a second run, and its post-conditions read the row and every class back', () => {
    expect(sql).toMatch(/if position\('\(''source_ask'',' in v_def\) > 0 then\s+-- Already in force: a second run changes nothing[^\n]*\n\s+return;/)
    expect(sql).toContain("if public.comms_subtype_of_template_key('source_ask') is distinct from 'PERM-SOURCE' then")
    for (const [key, subtype] of [['lifecycle_perm', 'PERM-IMAGE'], ['lifecycle_acq', 'ACQ-FIRST'], ['featured', 'LIST-FEATURED'], ['reply_stop', 'SYS-UNSUBSCRIBE']]) {
      expect(sql).toContain(`comms_subtype_of_template_key('${key}') is distinct from '${subtype}'`)
    }
  })

  it('applied to the map in force, as the migration applies it, gives exactly the code map: every key kept, one added', () => {
    const before = mapOf(inForce)
    const once = inForce.replace(ANCHOR, () => `${ANCHOR}\n    ${ROW}`)
    const after = mapOf(once)
    expect(after).toEqual({ ...before, source_ask: 'PERM-SOURCE' })
    expect(Object.fromEntries(Object.entries(TEMPLATE_CLASS).map(([k, c]) => [k, c.subtype]))).toEqual(after)
    // The row sits right after its anchor, at the anchor's own indent.
    expect(once).toContain(`    ${ANCHOR}\n    ${ROW}\n    ('lifecycle_acq', 'ACQ-FIRST'),`)
  })

  it('adds only: no drop, delete, truncate or rename, so the pipeline backs nothing up and refuses nothing', () => {
    const c = classify(sql)
    expect(c.destructive).toBe(false)
    expect(c.refused).toEqual([])
  })
})
