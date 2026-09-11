import { describe, expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { parseGeneratedTypes } from '../../../scripts/ci/types-drift-analyse.mjs'
import {
  describeFault,
  judgeTypesCoverage,
  migrationSchemaObjects,
  stripSqlComments,
} from '../../../scripts/guards/lib/types-coverage.mjs'

/**
 * THE GUARD THAT WOULD HAVE REFUSED THE STALE TYPES ON THE DAY THEY WERE COMMITTED.
 *
 * On 11 September 2026 the first push after the founder applied ten migrations
 * to production was refused with 285 unexplained type differences, every one an
 * object the tree's own migrations create. The types-drift guard could not see
 * it while production was behind; this one reads only the repository, so it can.
 * These tests drive the replay and the judgement on small SQL, then run the
 * judgement over the real migrations and the real committed types, which must
 * agree with each other or the push is refused on the way to Vercel anyway.
 */

const ROOT = join(__dirname, '..', '..', '..')

const leavesFor = (body: string) =>
  parseGeneratedTypes(
    ['export type Database = {', '  public: {', body, '  }', '}'].join(String.fromCharCode(10)),
  )

const migration = (name: string, sql: string) => ({ name, sql })

describe('replaying the migrations', () => {
  test('a created table is recorded under the public schema whatever its spelling', () => {
    const { tables } = migrationSchemaObjects([
      migration('001.sql', 'CREATE TABLE IF NOT EXISTS public."ledger_entries" (id uuid);'),
      migration('002.sql', 'create table recovery_holds (id uuid);'),
      migration('003.sql', 'create unlogged table public.scratch (id uuid);'),
    ])
    expect([...tables.keys()]).toEqual(['public.ledger_entries', 'public.recovery_holds', 'public.scratch'])
    expect(tables.get('public.ledger_entries')).toBe('001.sql')
  })

  test('a temporary table inside a function body is not a schema object', () => {
    const { tables } = migrationSchemaObjects([
      migration('001.sql', 'create temp table work (id int); create temporary table more (id int);'),
    ])
    expect(tables.size).toBe(0)
  })

  test('a renamed table moves its entry and its added columns to the new name', () => {
    const { tables, columns } = migrationSchemaObjects([
      migration('001.sql', 'create table public.cultures (id uuid);'),
      migration('002.sql', 'alter table public.cultures add column hero_photo text;'),
      migration('003.sql', 'alter table public.cultures rename to communities;'),
    ])
    expect([...tables.keys()]).toEqual(['public.communities'])
    expect([...columns.keys()]).toEqual(['public.communities.hero_photo'])
  })

  test('a dropped table is no longer demanded, nor are its columns', () => {
    const { tables, columns } = migrationSchemaObjects([
      migration('001.sql', 'create table public.old (id uuid); alter table public.old add column x text;'),
      migration('002.sql', 'drop table if exists public.old;'),
    ])
    expect(tables.size).toBe(0)
    expect(columns.size).toBe(0)
  })

  test('an enum is recorded, renamed and dropped; a composite type is not an enum', () => {
    const { enums } = migrationSchemaObjects([
      migration('001.sql', "create type public.ledger_entry_kind as enum ('sale', 'refund');"),
      migration('002.sql', "create type public.pair as (a int, b int);"),
      migration('003.sql', 'alter type public.ledger_entry_kind rename to entry_kind;'),
      migration('004.sql', "create type public.gone as enum ('x'); drop type public.gone;"),
    ])
    expect([...enums.keys()]).toEqual(['public.entry_kind'])
  })

  test('a trigger function is never demanded, a callable one is, and a default with parentheses does not confuse the return type', () => {
    const { functions } = migrationSchemaObjects([
      migration(
        '001.sql',
        [
          'create or replace function public.ledger_entries_are_append_only() returns trigger language plpgsql as $$ begin return null; end $$;',
          'create function public.record_ledger_entry(p_entry jsonb, p_at timestamptz default now()) returns bigint language sql as $$ select 1 $$;',
          'create or replace function public.ledger_guards() returns setof public.guard_row language sql as $$ select 1 $$;',
        ].join(String.fromCharCode(10)),
      ),
    ])
    expect([...functions.keys()].sort()).toEqual(['public.ledger_guards', 'public.record_ledger_entry'])
  })

  test('a dropped function is no longer demanded', () => {
    const { functions } = migrationSchemaObjects([
      migration('001.sql', 'create function public.f() returns int language sql as $$ select 1 $$;'),
      migration('002.sql', 'drop function if exists public.f();'),
    ])
    expect(functions.size).toBe(0)
  })

  test('an added column is recorded with or without the COLUMN keyword, and a constraint is not a column', () => {
    const { columns } = migrationSchemaObjects([
      migration('001.sql', 'create table public.events (id uuid);'),
      migration(
        '002.sql',
        'alter table public.events add column if not exists venue_geocoded_at timestamptz, add venue_place_id text, add constraint events_pk primary key (id);',
      ),
    ])
    expect([...columns.keys()].sort()).toEqual(['public.events.venue_geocoded_at', 'public.events.venue_place_id'])
  })

  test('a dropped or renamed column follows the schema', () => {
    const { columns } = migrationSchemaObjects([
      migration('001.sql', 'create table public.events (id uuid);'),
      migration('002.sql', 'alter table public.events add column city text, add column region text;'),
      migration('003.sql', 'alter table public.events rename column city to venue_city; alter table public.events drop column region;'),
    ])
    expect([...columns.keys()]).toEqual(['public.events.venue_city'])
  })

  test('a name built at runtime is skipped and reported, never guessed at', () => {
    const { tables, columns, dynamic } = migrationSchemaObjects([
      migration(
        '001.sql',
        "do $$ begin execute format('ALTER TABLE public.%I ADD COLUMN %I bigint', 'orders', 'total'); end $$;",
      ),
    ])
    expect(tables.size).toBe(0)
    expect(columns.size).toBe(0)
    expect(dynamic).toEqual(['001.sql: alter table %I'])
  })

  test('comments are stripped before anything is read, so a commented-out CREATE creates nothing', () => {
    expect(stripSqlComments('-- create table public.nope (id int);\n/* create table public.also (id int); */ select 1')).not.toMatch(
      /create/i,
    )
    const { tables } = migrationSchemaObjects([
      migration('001.sql', '-- create table public.nope (id int);\n/* create table public.also (id int); */'),
    ])
    expect(tables.size).toBe(0)
  })
})

describe('judging the replay against the committed types', () => {
  const leaves = leavesFor(
    [
      '    Tables: {',
      '      events: {',
      '        Row: {',
      '          id: string',
      '          venue_city: string | null',
      '        }',
      '      }',
      '    }',
      '    Views: {',
      '      [_ in never]: never',
      '    }',
      '    Functions: {',
      '      record_ledger_entry: {',
      '        Args: { p_entry: Json }',
      '        Returns: number',
      '      }',
      '      platform_notification_guards: { Args: never; Returns: Json }',
      '    }',
      '    Enums: {',
      '      waitlist_status:',
      '        | "waiting"',
      '        | "notified"',
      '    }',
    ].join(String.fromCharCode(10)),
  )

  test('a table the migrations create and the types do not carry is a fault naming the migration', () => {
    const objects = migrationSchemaObjects([
      migration('20260910000002_slot_ledger.sql', 'create table public.ledger_entries (id bigint);'),
    ])
    const { faults, judged } = judgeTypesCoverage(objects, leaves)
    expect(judged.table).toBe(1)
    expect(faults).toEqual([
      {
        kind: 'table',
        name: 'public.ledger_entries',
        migration: '20260910000002_slot_ledger.sql',
        path: 'public.Tables.ledger_entries',
      },
    ])
    expect(describeFault(faults[0])).toBe(
      'table public.ledger_entries is created by 20260910000002_slot_ledger.sql and public.Tables.ledger_entries is not in src/types/database.ts',
    )
  })

  test('everything the types carry passes, including a function written on one line and a wrapped enum', () => {
    const objects = migrationSchemaObjects([
      migration(
        '001.sql',
        [
          'create table public.events (id uuid);',
          'alter table public.events add column venue_city text;',
          'create function public.record_ledger_entry(p_entry jsonb) returns bigint language sql as $$ select 1 $$;',
          'create function public.platform_notification_guards() returns jsonb language sql as $$ select 1 $$;',
          "create type public.waitlist_status as enum ('waiting', 'notified');",
        ].join(String.fromCharCode(10)),
      ),
    ])
    const { faults, judged } = judgeTypesCoverage(objects, leaves)
    expect(faults).toEqual([])
    expect(judged).toEqual({ table: 1, view: 0, enum: 1, function: 2, column: 1 })
  })

  test('a column on a table that is itself absent is reported once, through the table', () => {
    const objects = migrationSchemaObjects([
      migration('001.sql', 'create table public.ledger_slots (id uuid); alter table public.ledger_slots add column pace numeric;'),
    ])
    const { faults } = judgeTypesCoverage(objects, leaves)
    expect(faults.map((f) => f.kind)).toEqual(['table'])
  })

  test('a missing column on a table the types do carry is a fault naming the column path', () => {
    const objects = migrationSchemaObjects([
      migration('001.sql', 'alter table public.events add column venue_geocode_source text;'),
    ])
    const { faults } = judgeTypesCoverage(objects, leaves)
    expect(faults).toEqual([
      {
        kind: 'column',
        name: 'public.events.venue_geocode_source',
        migration: '001.sql',
        path: 'public.Tables.events.Row.venue_geocode_source',
      },
    ])
  })

  test('an object outside the public schema is skipped by name rather than passed silently', () => {
    const objects = migrationSchemaObjects([
      migration('001.sql', 'create table auth.sessions_shadow (id uuid); create table private.secrets (id uuid);'),
    ])
    const { faults, skipped, judged } = judgeTypesCoverage(objects, leaves)
    expect(faults).toEqual([])
    expect(judged.table).toBe(0)
    expect(skipped.some((s) => s.includes('auth.sessions_shadow'))).toBe(true)
    expect(skipped.some((s) => s.includes('private.secrets'))).toBe(true)
  })
})

describe('the real repository', () => {
  const dir = join(ROOT, 'supabase', 'migrations')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }))
  const committed = readFileSync(join(ROOT, 'src', 'types', 'database.ts'), 'utf8')
  const leaves = parseGeneratedTypes(committed.slice(0, committed.indexOf('// BEGIN LEGACY ALIASES')))

  test('the committed types carry every object the migrations create', () => {
    const { faults, judged } = judgeTypesCoverage(migrationSchemaObjects(files), leaves)
    expect(faults.map(describeFault), 'regenerate src/types/database.ts').toEqual([])
    // The replay must actually be reading the migrations: a regex that matched
    // nothing would pass the assertion above with nothing judged.
    expect(judged.table).toBeGreaterThan(80)
    expect(judged.function).toBeGreaterThan(50)
    expect(judged.enum).toBeGreaterThan(10)
    expect(judged.column).toBeGreaterThan(100)
  })

  test('the slot ledger, the recovery engine and the connect watch are among what is demanded', () => {
    const { tables, functions, enums } = migrationSchemaObjects(files)
    for (const t of ['public.ledger_entries', 'public.ledger_slots', 'public.recovery_holds', 'public.connect_requirement_watch']) {
      expect(tables.has(t), t).toBe(true)
    }
    expect(functions.has('public.record_ledger_entry')).toBe(true)
    expect(enums.has('public.ledger_entry_kind')).toBe(true)
  })
})
