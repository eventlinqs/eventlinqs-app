// THE ENUM CONVERSION OF 5 SEPTEMBER 2026, DRILLED THROUGH THE REAL GUARD.
//
// origin/main went red at dc71374e: the types-drift guard reported 48
// unexplained differences. Three hand edits, not 48 schema changes: six door
// functions written into the wrong schema block, two return fields missing from
// events_within_distance, and events.venue_geocode_source narrowed by hand to
// 'places' | 'geocoding' | 'manual' inside the GENERATED section, where the
// generator emits `string | null` for a TEXT column.
//
// The narrowing was the right idea in the wrong place. 20260905000003 moves it
// into the database as a real Postgres enum, and from then on the generator
// emits the union itself. Until that migration reaches production the committed
// types are the post-migration shape, which the guard must classify as
// MIGRATIONS PENDING, not drift. This file reads the REAL migration from disk
// and drives the REAL classifier over the two REAL shapes, so a later edit to
// either cannot silently break the classification.
//
// Every positive is paired with a negative, as in the attribution drill: a
// matcher that only ever says "explained" is a guard that always passes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  analyse,
  ddlExplainsDelta,
  parseMigrationDdl,
} from '../../../scripts/ci/types-drift-analyse.mjs'

const MIGRATION_FILE = '20260905000003_venue_geocode_source_enum.sql'
const MIGRATION_SQL = readFileSync(`supabase/migrations/${MIGRATION_FILE}`, 'utf8')

/** What the generator emits AFTER the migration (verified on TEST, 5 September 2026). */
const COMMITTED_ENUM = `export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string
          venue_geocode_source:
            | Database["public"]["Enums"]["venue_geocode_source"]
            | null
        }
        Insert: {
          id?: string
          venue_geocode_source?:
            | Database["public"]["Enums"]["venue_geocode_source"]
            | null
        }
        Update: {
          id?: string
          venue_geocode_source?:
            | Database["public"]["Enums"]["venue_geocode_source"]
            | null
        }
      }
    }
    Enums: {
      venue_geocode_source: "places" | "geocoding" | "manual"
    }
    Functions: {
      events_within_distance: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          id: string
          venue_geocode_source:
            | Database["public"]["Enums"]["venue_geocode_source"]
            | null
        }[]
      }
    }
  }
}
`

/** What production answers BEFORE the migration: the column is TEXT. */
const LIVE_TEXT = `export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string
          venue_geocode_source: string | null
        }
        Insert: {
          id?: string
          venue_geocode_source?: string | null
        }
        Update: {
          id?: string
          venue_geocode_source?: string | null
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    Functions: {
      events_within_distance: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          id: string
          venue_geocode_source: string | null
        }[]
      }
    }
  }
}
`

/** The declaration that gives events_within_distance its shape (20260418000001). */
const SETOF_CORPUS = `CREATE OR REPLACE FUNCTION public.events_within_distance(p_lat double precision, p_lng double precision)
RETURNS SETOF events AS $$
  SELECT * FROM public.events;
$$ LANGUAGE sql STABLE;`

const pending = [{ version: '20260905000003', file: MIGRATION_FILE, sql: MIGRATION_SQL }]

describe('20260905000003 as the DDL parser sees it', () => {
  it('creates the enum from inside its idempotency DO block', () => {
    expect(parseMigrationDdl(MIGRATION_SQL)).toContainEqual({ kind: 'create-type', name: 'venue_geocode_source' })
  })

  it('changes the type of events.venue_geocode_source', () => {
    expect(parseMigrationDdl(MIGRATION_SQL)).toContainEqual({ kind: 'set-type', table: 'events', column: 'venue_geocode_source' })
  })

  it('NEGATIVE: never adds or drops the column, so it explains nothing in those directions', () => {
    const ddl = parseMigrationDdl(MIGRATION_SQL)
    expect(ddl.some((d) => d.kind === 'add-column' || d.kind === 'drop-column')).toBe(false)
    expect(ddlExplainsDelta({ path: 'public.Tables.events.Row.venue_geocode_source', kind: 'added' }, ddl)).toBe(false)
    expect(ddlExplainsDelta({ path: 'public.Tables.events.Row.venue_geocode_source', kind: 'removed' }, ddl)).toBe(false)
  })
})

describe('the post-migration types against the pre-migration database', () => {
  it('is MIGRATIONS PENDING, with every one of the five deltas attributed to the migration', () => {
    const result = analyse({ committedText: COMMITTED_ENUM, liveText: LIVE_TEXT, pending, corpus: [SETOF_CORPUS] })
    expect(result.status).toBe('pending-migrations')
    expect(result.unexplained).toEqual([])
    expect(result.migrations).toEqual([MIGRATION_FILE])
    expect(result.explained.map((e) => e.delta.path).sort()).toEqual([
      'public.Enums.venue_geocode_source',
      'public.Functions.events_within_distance.Returns.venue_geocode_source',
      'public.Tables.events.Insert.venue_geocode_source',
      'public.Tables.events.Row.venue_geocode_source',
      'public.Tables.events.Update.venue_geocode_source',
    ])
  })

  it('is IN SYNC once production has applied the migration', () => {
    const result = analyse({ committedText: COMMITTED_ENUM, liveText: COMMITTED_ENUM, pending: [], corpus: [SETOF_CORPUS] })
    expect(result.status).toBe('in-sync')
  })

  it('NEGATIVE: the same shapes with the migration NOT in the tree are drift', () => {
    const result = analyse({ committedText: COMMITTED_ENUM, liveText: LIVE_TEXT, pending: [], corpus: [SETOF_CORPUS] })
    expect(result.status).toBe('drift')
    expect(result.unexplained).toHaveLength(5)
  })

  it('NEGATIVE: the migration that ADDED the column as text does not explain the enum', () => {
    const addAsText = {
      version: '20260904000001',
      file: '20260904000001_venue_geocode_provenance.sql',
      sql: readFileSync('supabase/migrations/20260904000001_venue_geocode_provenance.sql', 'utf8'),
    }
    const result = analyse({ committedText: COMMITTED_ENUM, liveText: LIVE_TEXT, pending: [addAsText], corpus: [SETOF_CORPUS] })
    expect(result.status).toBe('drift')
  })

  it('NEGATIVE: the hand-written union in a generated section is NOT what the enum migration produces', () => {
    // The dc71374e defect: the literal union written where the generator writes
    // an Enums reference. Against the enum-bearing live database it is a type
    // change no migration in the tree makes, so it must still fail.
    const handWritten = COMMITTED_ENUM.split('\n            | Database["public"]["Enums"]["venue_geocode_source"]\n            | null').join(" 'places' | 'geocoding' | 'manual' | null")
    const result = analyse({ committedText: handWritten, liveText: COMMITTED_ENUM, pending: [], corpus: [SETOF_CORPUS] })
    expect(result.status).toBe('drift')
  })
})
