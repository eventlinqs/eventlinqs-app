import { describe, expect, test } from 'vitest'
import {
  hammingHex,
  judgeAssignments,
  judgeSchema,
  NEAR_DUPLICATE_BITS,
} from '../../../scripts/guards/one-photo-one-event.mjs'

/**
 * The photo system's gate guard (P1 and P2, Lawal's ruling of 31 October 2026
 * 00:14), driven over synthetic migrations and rows. Each fault is one way the
 * same photo could reach two events.
 */
const FILE = '20261031000001_photo_assignments.sql'
const TABLE =
  'create table public.photo_assignments (id uuid primary key default gen_random_uuid(), ' +
  'photo_sha256 text not null, photo_phash text not null, ' +
  'event_id uuid not null references public.events(id), source text not null, ' +
  'assigned_at timestamptz not null default now()); '
const INDEX = 'create unique index photo_assignments_sha256_one on public.photo_assignments (photo_sha256);'
const m = (sql: string, file = FILE) => ({ file, sql: sql.toLowerCase() })

describe('clause A, the schema', () => {
  test('no migration creates the table: not built, and that fails', () => {
    const r = judgeSchema([m('create table public.events (id uuid primary key);')])
    expect(r.built).toBe(false)
    expect(r.faults[0]).toContain('NOT BUILT')
  })

  test('a unique index on the hash alone holds', () => {
    expect(judgeSchema([m(TABLE + INDEX)]).faults).toEqual([])
  })

  test('a unique column constraint holds', () => {
    const sql = TABLE.replace('photo_sha256 text not null,', 'photo_sha256 text not null unique,')
    expect(judgeSchema([m(sql)]).faults).toEqual([])
  })

  test('unique on (hash, event) lets one photo onto two events', () => {
    const sql = TABLE + 'alter table public.photo_assignments add constraint pa_pair unique (photo_sha256, event_id);'
    expect(judgeSchema([m(sql)]).faults[0]).toContain('not unique on its own')
  })

  test('a nullable hash, a missing perceptual hash and a nullable event each fail', () => {
    expect(judgeSchema([m(TABLE.replace('photo_sha256 text not null', 'photo_sha256 text') + INDEX)]).faults[0]).toContain('may be null')
    expect(judgeSchema([m(TABLE.replace('photo_phash text not null,', '') + INDEX)]).faults[0]).toContain('no photo_phash')
    expect(judgeSchema([m(TABLE.replace('event_id uuid not null', 'event_id uuid') + INDEX)]).faults[0]).toContain('event_id may be null')
  })

  test('a later migration that drops the index or the column constraint undoes it', () => {
    const dropIndex = m('drop index public.photo_assignments_sha256_one;', '20261101000001_later.sql')
    expect(judgeSchema([m(TABLE + INDEX), dropIndex]).faults[0]).toContain('later migration drops it')
    const col = TABLE.replace('photo_sha256 text not null,', 'photo_sha256 text not null unique,')
    const dropKey = m('alter table public.photo_assignments drop constraint photo_assignments_photo_sha256_key;', '20261101000001_later.sql')
    expect(judgeSchema([m(col), dropKey]).faults[0]).toContain('later migration drops it')
  })

  test('comments are not SQL', () => {
    expect(judgeSchema([m(TABLE + '-- ' + INDEX)]).faults[0]).toContain('not unique on its own')
  })
})

describe('clause B, the rows', () => {
  test('hamming distance over 64-bit hex hashes', () => {
    expect(hammingHex('ffffffffffffffff', 'fffffffffffffff0')).toBe(4)
    expect(hammingHex('0000000000000000', 'ffffffffffffffff')).toBe(64)
    expect(hammingHex('abc', 'ffffffffffffffff')).toBeNull()
  })

  test('the same bytes twice, and a near copy on another event, both fail', () => {
    const r = judgeAssignments([
      { photo_sha256: 'a', photo_phash: 'ffffffffffffffff', event_id: 'e1' },
      { photo_sha256: 'b', photo_phash: 'fffffffffffffff0', event_id: 'e2' },
      { photo_sha256: 'a', photo_phash: '00000000ffffffff', event_id: 'e3' },
    ])
    expect(r.twice).toHaveLength(1)
    expect(r.near).toHaveLength(1)
  })

  test('near copies on ONE event (its own gallery, P7) and distant photos pass', () => {
    const r = judgeAssignments([
      { photo_sha256: 'a', photo_phash: 'ffffffffffffffff', event_id: 'e1' },
      { photo_sha256: 'b', photo_phash: 'fffffffffffffff0', event_id: 'e1' },
      { photo_sha256: 'c', photo_phash: '0000000000000000', event_id: 'e2' },
    ])
    expect(r).toEqual({ twice: [], near: [], unreadable: 0 })
  })

  test('the line is NEAR_DUPLICATE_BITS, inclusive', () => {
    const base = '0000000000000000'
    const within = '00000000000000ff' // 8 bits
    const beyond = '00000000000001ff' // 9 bits
    expect(NEAR_DUPLICATE_BITS).toBe(8)
    expect(judgeAssignments([{ photo_sha256: 'a', photo_phash: base, event_id: 'e1' }, { photo_sha256: 'b', photo_phash: within, event_id: 'e2' }]).near).toHaveLength(1)
    expect(judgeAssignments([{ photo_sha256: 'a', photo_phash: base, event_id: 'e1' }, { photo_sha256: 'b', photo_phash: beyond, event_id: 'e2' }]).near).toHaveLength(0)
  })

  test('a row with no readable perceptual hash is counted, never skipped silently', () => {
    expect(judgeAssignments([{ photo_sha256: 'a', photo_phash: null, event_id: 'e1' }]).unreadable).toBe(1)
  })
})
