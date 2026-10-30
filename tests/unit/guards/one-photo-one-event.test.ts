import { describe, expect, test } from 'vitest'
import { dhashBits, hamming, judgeAssignments, judgeSchema } from '../../../scripts/guards/one-photo-one-event.mjs'

/**
 * The photo system's gate guard (P1 and P2, Lawal's ruling of 31 October 2026
 * 00:14), driven over synthetic migrations and rows in the shape of window 3's
 * 20261031010001_photo_assignments. Each fault is one way the same photo could
 * reach two events.
 */
const FILE = '20261031010001_photo_assignments.sql'
const TABLE =
  'create table if not exists public.photo_assignments (id uuid primary key default gen_random_uuid(), ' +
  "photo_sha256 text not null check (photo_sha256 ~ '^[0-9a-f]{64}$'), photo_dhash bigint, " +
  'event_id uuid references public.events (id) on delete set null, ' +
  'listing_series_id uuid references public.event_series (id) on delete set null, ' +
  'constraint photo_assignments_one_target check (num_nonnulls(event_id, listing_series_id) <= 1)); '
const INDEX = 'create unique index if not exists photo_assignments_one_event_per_photo on public.photo_assignments (photo_sha256); '
const NEAR =
  'create function public.photo_assignments_made_once() returns trigger language plpgsql as $$ begin ' +
  'if new.photo_dhash is not null and exists (select 1 from public.photo_assignments a where a.photo_dhash is not null ' +
  "and bit_count((a.photo_dhash # new.photo_dhash)::bit(64)) <= 6) then raise exception 'near copy'; end if; return new; end; $$;"
const m = (sql: string, file = FILE) => ({ file, sql })
const later = (sql: string) => m(sql, '20261101000001_later.sql')

describe('clause A, the schema', () => {
  test('no migration creates the table: not built, and that fails', () => {
    const r = judgeSchema([m('create table public.events (id uuid primary key);')])
    expect(r.built).toBe(false)
    expect(r.faults[0]).toContain('NOT BUILT')
  })

  test('the hash unique on its own and a near-copy line hold, and the line is read from the SQL', () => {
    const r = judgeSchema([m(TABLE + INDEX + NEAR)])
    expect(r.faults).toEqual([])
    expect(r.bits).toBe(6)
  })

  test('a unique column constraint holds', () => {
    const sql = TABLE.replace('photo_sha256 text not null', 'photo_sha256 text not null unique') + NEAR
    expect(judgeSchema([m(sql)]).faults).toEqual([])
  })

  test('unique on (hash, night) lets one photo onto two nights', () => {
    const sql = TABLE + NEAR + 'alter table public.photo_assignments add constraint pa_pair unique (photo_sha256, event_id);'
    expect(judgeSchema([m(sql)]).faults[0]).toContain('not unique on its own')
  })

  test('a partial unique index lets a retired photo be dealt again', () => {
    const sql = TABLE + INDEX.replace('(photo_sha256);', '(photo_sha256) where retired_at is null;') + NEAR
    expect(judgeSchema([m(sql)]).faults[0]).toContain('is partial')
  })

  test('a nullable hash, no difference hash and no near-copy refusal each fail', () => {
    expect(judgeSchema([m(TABLE.replace('photo_sha256 text not null', 'photo_sha256 text') + INDEX + NEAR)]).faults[0]).toContain('may be null')
    expect(judgeSchema([m(TABLE.replace('photo_dhash bigint,', '') + INDEX + NEAR)]).faults[0]).toContain('no photo_dhash')
    expect(judgeSchema([m(TABLE + INDEX)]).faults[0]).toContain('no migration refuses a near copy')
  })

  test('a later migration that drops the index or the column constraint undoes it', () => {
    const dropIndex = later('drop index if exists public.photo_assignments_one_event_per_photo;')
    expect(judgeSchema([m(TABLE + INDEX + NEAR), dropIndex]).faults[0]).toContain('later migration drops it')
    const col = TABLE.replace('photo_sha256 text not null', 'photo_sha256 text not null unique') + NEAR
    const dropKey = later('alter table public.photo_assignments drop constraint photo_assignments_photo_sha256_key;')
    expect(judgeSchema([m(col), dropKey]).faults[0]).toContain('later migration drops it')
  })

  test('comments are not SQL', () => {
    expect(judgeSchema([m(TABLE + '-- ' + INDEX + '\n' + NEAR)]).faults[0]).toContain('not unique on its own')
  })
})

describe('clause B, the rows', () => {
  test('difference hashes are signed bigints, compared as 64 bits, never as rounded numbers', () => {
    expect(hamming('0', '-1')).toBe(64)
    expect(hamming('-1', '9223372036854775807')).toBe(1)
    // 2^63 - 1 and 2^63 - 2 are one number apart in JSON's doubles too, but not in all pairs: the text is exact.
    expect(hamming('9223372036854775807', '9223372036854775806')).toBe(1)
    expect(dhashBits('9223372036854775808')).toBeNull()
    expect(dhashBits(null)).toBeNull()
  })

  test('the same bytes twice, and a near copy held by another night or series, both fail', () => {
    const r = judgeAssignments(
      [
        { photo_sha256: 'a', photo_dhash: '-1', event_id: 'e1', listing_series_id: null },
        { photo_sha256: 'b', photo_dhash: '-2', event_id: null, listing_series_id: 's1' },
        { photo_sha256: 'a', photo_dhash: '0', event_id: 'e2', listing_series_id: null },
      ],
      6,
    )
    expect(r.twice).toHaveLength(1)
    expect(r.near).toEqual(['one photo on two events: night e1 and series s1 hold photos 1 bit(s) apart, within 6'])
  })

  test('near copies on ONE night (its own set, P8) and distant photos pass', () => {
    const r = judgeAssignments(
      [
        { photo_sha256: 'a', photo_dhash: '-1', event_id: 'e1', listing_series_id: null },
        { photo_sha256: 'b', photo_dhash: '-2', event_id: 'e1', listing_series_id: null },
        { photo_sha256: 'c', photo_dhash: '0', event_id: 'e2', listing_series_id: null },
      ],
      6,
    )
    expect(r).toEqual({ twice: [], near: [], unhashed: 0 })
  })

  test('the line is inclusive, and a row with no difference hash is counted', () => {
    const at = (d: string) => [
      { photo_sha256: 'a', photo_dhash: '0', event_id: 'e1', listing_series_id: null },
      { photo_sha256: 'b', photo_dhash: d, event_id: 'e2', listing_series_id: null },
    ]
    expect(judgeAssignments(at('63'), 6).near).toHaveLength(1) // 6 bits
    expect(judgeAssignments(at('127'), 6).near).toHaveLength(0) // 7 bits
    expect(judgeAssignments(at('x'), 6).unhashed).toBe(1)
  })
})
