import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findDirectWrites, checkMigration, checkDoorList, checkDeviceShapes, checkWorker, runGuard, MIGRATION_FILE, DOOR_LIST_REDEFINITIONS, TYPES_FILE, STORE_FILE, WORKER_FILE } from '../../../scripts/guards/offline-door-integrity.mjs'

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('findDirectWrites', () => {
  test('finds an insert on ticket_scans and ignores a read', () => {
    expect(findDirectWrites("await supabase.from('ticket_scans').insert({ result: 'admitted' })")).toEqual([{ line: 1, method: 'insert' }])
    expect(findDirectWrites("await supabase\n  .from('ticket_scans')\n  .select('id')\n  .eq('event_id', id)")).toEqual([])
  })
})

describe('checkMigration', () => {
  const sql = read(MIGRATION_FILE)
  test('the committed migration is clean', () => {
    expect(checkMigration(sql)).toEqual([])
  })
  test("dropping the status = 'valid' clause from the sync is named", () => {
    const broken = sql.replace(/\s+AND t\.status\s+= 'valid'\n(\s+RETURNING t\.id, t\.holder_name, t\.first_scanned_at\n\s+INTO v_ticket;)/, '\n$1')
    expect(broken).not.toBe(sql)
    expect(checkMigration(broken).join('\n')).toMatch(/without `t\.status = 'valid'`/)
  })
  test('returning the secret in the door list is named', () => {
    const broken = sql.replace('secret_hash      text,', 'secret_hash      text,\n  secret           uuid,')
    expect(checkMigration(broken).join('\n')).toMatch(/returns a column called secret/)
  })
  test('widening a grant to anon is named', () => {
    const broken = sql.replace('REVOKE ALL ON FUNCTION public.sync_offline_scans(uuid, jsonb) FROM PUBLIC, anon;', '')
    expect(checkMigration(broken).join('\n')).toMatch(/sync_offline_scans is not revoked from anon/)
  })
})

describe('checkDoorList on every later re-definition', () => {
  test('the B2 re-definition (ticket_id first) still carries the hash and never the secret', () => {
    expect(DOOR_LIST_REDEFINITIONS).toContain('supabase/migrations/20260905000002_door_realtime.sql')
    for (const rel of DOOR_LIST_REDEFINITIONS) {
      const sql = read(rel)
      expect(checkDoorList(sql), rel).toEqual([])
      expect(checkDoorList(sql.replace('secret_hash      text,', 'secret_hash      text,\n  secret           uuid,')).join('\n')).toMatch(/column called secret/)
    }
  })
})

describe('checkDeviceShapes and checkWorker', () => {
  const types = read(TYPES_FILE)
  const store = read(STORE_FILE)
  const worker = read(WORKER_FILE)
  test('the committed shapes are clean', () => {
    expect(checkDeviceShapes(types, store)).toEqual([])
    expect(checkWorker(worker, types)).toEqual([])
  })
  test('a record field called secret is named', () => {
    expect(checkDeviceShapes(types.replace('secretHash: string', 'secretHash: string\n  secret: string'), store).join('\n')).toMatch(/field called secret/)
  })
  test('a worker that answers a third kind of request, or a different cache name, is named', () => {
    expect(checkWorker(worker + "\nself.addEventListener('fetch', function (e) { e.respondWith(fetch(e.request)) })", types).join('\n')).toMatch(/respondWith 3 time/)
    expect(checkWorker(worker.replace("SHELL_CACHE = 'eventlinqs-door-shell-v1'", "SHELL_CACHE = 'eventlinqs-door-shell-v2'"), types).join('\n')).toMatch(/cache name differs/)
    expect(checkWorker(worker.replace("if (request.method !== 'GET') return", ''), types).join('\n')).toMatch(/non-GET/)
  })
})

describe('the tree', () => {
  test('passes the guard as committed', () => {
    const { scanned, failures } = runGuard()
    expect(scanned).toBeGreaterThan(500)
    expect(failures).toEqual([])
  })
})
