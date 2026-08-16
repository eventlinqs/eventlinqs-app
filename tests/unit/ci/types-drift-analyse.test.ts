// THE TYPES-DRIFT CLASSIFIER.
//
// The guard used to ask one question - "do the committed types equal the live
// schema?" - and answered two opposite conditions with the same failure and the
// same remedy:
//
//   TYPES ARE STALE       the live schema moved, the types did not. A defect.
//                         Fix: regenerate.
//   MIGRATIONS ARE PENDING the types are correct for the schema the repository's
//                         migrations define, and the target has not had them
//                         applied. Expected. Regenerating would DESTROY the
//                         correct types by replacing them with the pre-migration
//                         shape.
//
// On PR #118 the second condition blocked the merge, and the prescribed remedy
// would have deleted external_ticket_url, destination_url and draft_code from
// the committed types and then failed typecheck against the code using them.
//
// These tests pin the classification in both directions. The fixtures are the
// shape of that actual incident.

import { describe, it, expect } from 'vitest'

import {
  analyse,
  diffSchemas,
  parseGeneratedTypes,
  parseMigrationDdl,
  splitSqlStatements,
  ddlExplainsDelta,
} from '../../../scripts/ci/types-drift-analyse.mjs'

const POST_MIGRATION = `export type Database = {
  public: {
    Tables: {
      share_links: {
        Row: {
          code: string
          destination_url: string | null
          event_id: string | null
          id: string
        }
        Insert: {
          code: string
          destination_url?: string | null
          event_id?: string | null
          id?: string
        }
        Update: {
          code?: string
          destination_url?: string | null
          event_id?: string | null
          id?: string
        }
      }
    }
  }
}
`

const PRE_MIGRATION = `export type Database = {
  public: {
    Tables: {
      share_links: {
        Row: {
          code: string
          event_id: string
          id: string
        }
        Insert: {
          code: string
          event_id: string
          id?: string
        }
        Update: {
          code?: string
          event_id?: string
          id?: string
        }
      }
    }
  }
}
`

const MIGRATION_SQL = `
alter table public.share_links add column if not exists destination_url text;
alter table public.share_links alter column event_id drop not null;
`

const pending = [{ version: '20260815000001', file: '20260815000001_external_ticketing.sql', sql: MIGRATION_SQL }]

describe('parseGeneratedTypes', () => {
  it('reads a column, its type and its optionality', () => {
    const map = parseGeneratedTypes(POST_MIGRATION)
    expect(map.get('public.Tables.share_links.Row.event_id')).toEqual({ optional: false, type: 'string | null' })
    expect(map.get('public.Tables.share_links.Insert.event_id')).toEqual({ optional: true, type: 'string | null' })
    expect(map.get('public.Tables.share_links.Update.code')).toEqual({ optional: true, type: 'string' })
  })

  it('ignores everything outside `export type Database`', () => {
    const map = parseGeneratedTypes(`export type Json = string | number\n${POST_MIGRATION}`)
    expect([...map.keys()].some((k) => k.includes('Json'))).toBe(false)
  })
})

describe('diffSchemas', () => {
  it('separates nullability from optionality', () => {
    // The bug the drill caught on its first run. Update.event_id is optional on
    // BOTH sides; only the nullability moved. A combined "nullish" test saw no
    // difference in nullability, fell through to type-changed, and reported a
    // legitimate pending migration as unexplained drift.
    const deltas = diffSchemas(parseGeneratedTypes(POST_MIGRATION), parseGeneratedTypes(PRE_MIGRATION))
    const update = deltas.find((d) => d.path === 'public.Tables.share_links.Update.event_id')
    expect(update?.kind).toBe('became-nullable')
  })

  it('reports a column the live DB has and the committed types lack as removed', () => {
    const liveWithExtra = PRE_MIGRATION.replace('          id: string\n', '          id: string\n          retired_at: string | null\n')
    const deltas = diffSchemas(parseGeneratedTypes(PRE_MIGRATION), parseGeneratedTypes(liveWithExtra))
    expect(deltas.find((d) => d.path.endsWith('retired_at'))?.kind).toBe('removed')
  })

  it('finds nothing when the two agree', () => {
    expect(diffSchemas(parseGeneratedTypes(POST_MIGRATION), parseGeneratedTypes(POST_MIGRATION))).toEqual([])
  })
})

describe('parseMigrationDdl', () => {
  it('reads the statements that can move a generated type', () => {
    const ddl = parseMigrationDdl(MIGRATION_SQL)
    expect(ddl).toContainEqual({ kind: 'add-column', table: 'share_links', column: 'destination_url' })
    expect(ddl).toContainEqual({ kind: 'drop-not-null', table: 'share_links', column: 'event_id' })
  })

  it('does not mistake ADD CONSTRAINT for ADD COLUMN', () => {
    const ddl = parseMigrationDdl('alter table public.share_links add constraint share_links_target_exactly_one check (true);')
    expect(ddl.filter((d) => d.kind === 'add-column')).toEqual([])
  })

  it('survives a dollar-quoted function body full of semicolons', () => {
    // 20260808000006 defines a plpgsql trigger. Splitting on ";" without
    // stripping the $$ body first shreds one statement into several and the DDL
    // either side of it stops parsing.
    const sql = `
      create or replace function public.f() returns trigger as $$
      begin
        update public.share_links set retired_at = now();
        return old;
      end;
      $$ language plpgsql;
      alter table public.events add column if not exists external_ticket_url text;
    `
    expect(parseMigrationDdl(sql)).toContainEqual({ kind: 'add-column', table: 'events', column: 'external_ticket_url' })
    expect(splitSqlStatements(sql).some((s) => /update public\.share_links/i.test(s))).toBe(false)
  })
})

describe('ddlExplainsDelta is directional', () => {
  const addColumn = [{ kind: 'add-column', table: 'share_links', column: 'destination_url' }]

  it('an ADD COLUMN explains a column the committed types have and live lacks', () => {
    const delta = { path: 'public.Tables.share_links.Row.destination_url', kind: 'added' }
    expect(ddlExplainsDelta(delta, addColumn)).toBe(true)
  })

  it('an ADD COLUMN does NOT explain a column live has and the committed types lack', () => {
    // Otherwise merely naming a column anywhere in any migration would launder
    // genuine staleness, which is the failure this guard exists to catch.
    const delta = { path: 'public.Tables.share_links.Row.destination_url', kind: 'removed' }
    expect(ddlExplainsDelta(delta, addColumn)).toBe(false)
  })

  it('a DROP NOT NULL does not explain a type change', () => {
    const ddl = [{ kind: 'drop-not-null', table: 'share_links', column: 'event_id' }]
    const delta = { path: 'public.Tables.share_links.Row.event_id', kind: 'type-changed' }
    expect(ddlExplainsDelta(delta, ddl)).toBe(false)
  })
})

describe('analyse: the verdict', () => {
  it('PASSES when every difference is explained by a pending migration', () => {
    const result = analyse({ committedText: POST_MIGRATION, liveText: PRE_MIGRATION, pending })
    expect(result.status).toBe('pending-migrations')
    expect(result.unexplained).toEqual([])
    expect(result.migrations).toEqual(['20260815000001_external_ticketing.sql'])
  })

  it('FAILS on genuinely stale types, even alongside a legitimate pending migration', () => {
    const liveMoved = PRE_MIGRATION.replace('          id: string\n', '          id: string\n          retired_at: string | null\n')
    const result = analyse({ committedText: POST_MIGRATION, liveText: liveMoved, pending })
    expect(result.status).toBe('drift')
    expect(result.unexplained.map((d) => d.path)).toContain('public.Tables.share_links.Row.retired_at')
  })

  it('FAILS on a committed column no migration in the tree creates', () => {
    // A capability the old guard did not have. It called this drift and
    // prescribed regenerating from production, which would have deleted the
    // hand-edited type with nobody the wiser.
    const invented = POST_MIGRATION.replace('          code: string\n', '          code: string\n          invented: string | null\n')
    const result = analyse({ committedText: invented, liveText: PRE_MIGRATION, pending })
    expect(result.status).toBe('drift')
    expect(result.unexplained.some((d) => d.path.endsWith('invented'))).toBe(true)
  })

  it('reports in-sync when there is nothing to explain', () => {
    const result = analyse({ committedText: PRE_MIGRATION, liveText: PRE_MIGRATION, pending: [] })
    expect(result.status).toBe('in-sync')
  })

  it('does not treat an unapplied migration as a licence for unrelated drift', () => {
    // With NO pending migrations at all, the same difference must fail.
    const result = analyse({ committedText: POST_MIGRATION, liveText: PRE_MIGRATION, pending: [] })
    expect(result.status).toBe('drift')
  })
})
