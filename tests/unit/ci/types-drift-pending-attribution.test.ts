import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  parseMigrationDdl,
  extractDoBlockBodies,
  ddlExplainsDelta,
  analyse,
} from '../../../scripts/ci/types-drift-analyse.mjs'
import { compareInventories } from '../../../scripts/verify/schema-provenance.mjs'

/*
 * THE DRILL FOR THE 21 AUGUST MISCLASSIFICATIONS.
 *
 * The types-drift guard failed PR #119 reporting five differences as genuine
 * drift. Three of them were expected differences the guard could not explain:
 *
 *   1. squad_member_status gaining "refunded". Explained by pending
 *      20260820000003, which adds the value inside a `DO $$ ... $$` idempotency
 *      guard. The DDL parser erased every dollar-quoted body, so the statement
 *      it saw began with `DO` and matched nothing. Writing the migration the
 *      careful way is what hid it.
 *   2 and 3. events_within_distance.Returns gaining refund_policy_* and
 *      external_ticket_url. The function is declared `RETURNS SETOF events`, so
 *      its shape follows the events table, and an ADD COLUMN on events reshapes
 *      it without any migration naming the function.
 *
 * Every test below pairs the positive with a NEGATIVE, because a matcher that
 * only ever says "explained" is worse than the bug it replaced: it turns the
 * guard into something that always passes.
 */

const ENUM_MIGRATION = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'squad_member_status' AND e.enumlabel = 'refunded'
  ) THEN
    ALTER TYPE public.squad_member_status ADD VALUE 'refunded';
  END IF;
END
$$;
`

describe('DO blocks execute, so their DDL counts', () => {
  it('extracts an enum value added inside a DO block', () => {
    const ddl = parseMigrationDdl(ENUM_MIGRATION)
    expect(ddl).toContainEqual({ kind: 'alter-type-add-value', name: 'squad_member_status' })
  })

  it('finds the DO body at all', () => {
    expect(extractDoBlockBodies(ENUM_MIGRATION)).toHaveLength(1)
  })

  it('explains the pending enum delta that used to report as drift', () => {
    const delta = { path: 'public.Enums.squad_member_status', kind: 'removed' }
    expect(ddlExplainsDelta(delta, parseMigrationDdl(ENUM_MIGRATION))).toBe(true)
  })

  it('NEGATIVE: a function BODY containing DDL text still explains nothing', () => {
    // Stored, not executed. If this ever returns add-column, any migration could
    // launder a genuine staleness by mentioning a column inside a function body.
    const sql = `CREATE OR REPLACE FUNCTION public.f() RETURNS void AS $$
BEGIN
  ALTER TABLE public.events ADD COLUMN sneaky text;
END
$$ LANGUAGE plpgsql;`
    const ddl = parseMigrationDdl(sql)
    expect(ddl.some((d) => d.kind === 'add-column')).toBe(false)
    const delta = { path: 'public.Tables.events.Row.sneaky', kind: 'added' }
    expect(ddlExplainsDelta(delta, ddl)).toBe(false)
  })

  it('NEGATIVE: a DO block adding a DIFFERENT enum does not explain this one', () => {
    const other = ENUM_MIGRATION.replace(/squad_member_status/g, 'order_status')
    const delta = { path: 'public.Enums.squad_member_status', kind: 'removed' }
    expect(ddlExplainsDelta(delta, parseMigrationDdl(other))).toBe(false)
  })
})

describe('a function that RETURNS SETOF a table has that table shape', () => {
  const DEFINE = `CREATE OR REPLACE FUNCTION events_within_distance(
      p_lat NUMERIC, p_lng NUMERIC, p_radius_km NUMERIC
    ) RETURNS SETOF events AS $$ SELECT * FROM events $$ LANGUAGE sql;`
  const ADD = `ALTER TABLE public.events ADD COLUMN IF NOT EXISTS refund_policy_type TEXT;`

  it('records the SETOF relationship', () => {
    expect(parseMigrationDdl(DEFINE)).toContainEqual({
      kind: 'function-returns-setof', name: 'events_within_distance', table: 'events',
    })
  })

  it('explains a Returns column from an ADD COLUMN on the mirrored table', () => {
    const delta = { path: 'public.Functions.events_within_distance.Returns.refund_policy_type', kind: 'added' }
    const setofMap = new Map([['events_within_distance', 'events']])
    expect(ddlExplainsDelta(delta, parseMigrationDdl(ADD), setofMap)).toBe(true)
  })

  it('NEGATIVE: an ADD COLUMN on an unrelated table does not explain it', () => {
    const delta = { path: 'public.Functions.events_within_distance.Returns.refund_policy_type', kind: 'added' }
    const setofMap = new Map([['events_within_distance', 'events']])
    const unrelated = parseMigrationDdl('ALTER TABLE public.orders ADD COLUMN refund_policy_type TEXT;')
    expect(ddlExplainsDelta(delta, unrelated, setofMap)).toBe(false)
  })

  it('NEGATIVE: direction still holds - a DROP does not explain an ADD', () => {
    const delta = { path: 'public.Functions.events_within_distance.Returns.refund_policy_type', kind: 'added' }
    const setofMap = new Map([['events_within_distance', 'events']])
    const dropped = parseMigrationDdl('ALTER TABLE public.events DROP COLUMN refund_policy_type;')
    expect(ddlExplainsDelta(delta, dropped, setofMap)).toBe(false)
  })

  it('NEGATIVE: with no SETOF relationship known, it still demands the function be named', () => {
    const delta = { path: 'public.Functions.some_fn.Returns.whatever', kind: 'added' }
    expect(ddlExplainsDelta(delta, parseMigrationDdl(ADD), new Map())).toBe(false)
  })
})

describe('the real migration, end to end', () => {
  it('attributes the squad enum to the real pending file', () => {
    const sql = readFileSync('supabase/migrations/20260820000003_refund_releases_squad_seat.sql', 'utf8')
    const delta = { path: 'public.Enums.squad_member_status', kind: 'removed' }
    expect(ddlExplainsDelta(delta, parseMigrationDdl(sql))).toBe(true)
  })
})

describe('a PostgREST version difference is not schema drift', () => {
  const withVersion = (v: string) => `export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "${v}"
  }
}
`
  it('ignores the version field', () => {
    const r = analyse({ committedText: withVersion('14.15'), liveText: withVersion('14.5'), pending: [] })
    expect(r.status).toBe('in-sync')
  })

  it('NEGATIVE: a real column difference beside it still fails', () => {
    const mk = (v: string, col: string) => `export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "${v}"
  }
  public: {
    Tables: {
      events: {
        Row: {
          ${col}: string
        }
      }
    }
  }
}
`
    const r = analyse({ committedText: mk('14.15', 'a_col'), liveText: mk('14.5', 'b_col'), pending: [] })
    expect(r.status).toBe('drift')
    expect(r.unexplained.length).toBeGreaterThan(0)
  })
})

describe('schema provenance comparison', () => {
  it('reports an object that exists on production and in no migration', () => {
    const r = compareInventories(
      ['column refunds.id', 'column refunds.stripe_refund_status'],
      ['column refunds.id'],
    )
    expect(r.outOfBand).toEqual(['column refunds.stripe_refund_status'])
  })

  it('reports nothing when the two agree', () => {
    const r = compareInventories(['column refunds.id'], ['column refunds.id'])
    expect(r.outOfBand).toEqual([])
  })

  it('separates pending-only objects from out-of-band ones', () => {
    const r = compareInventories(
      ['column a.x', 'column a.rogue'],
      ['column a.x', 'column a.not_yet_deployed'],
    )
    expect(r.outOfBand).toEqual(['column a.rogue'])
    expect(r.pendingOnly).toEqual(['column a.not_yet_deployed'])
  })
})
