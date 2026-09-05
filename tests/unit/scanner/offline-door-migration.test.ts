import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * MIGRATION 20260905000001 (offline door validation), read as text.
 *
 * The live proof is scripts/verify/offline-door-schema-verify.mjs against TEST.
 * These pin the SHAPE of the file so a later edit that returns the secret,
 * drops the compare-and-set, widens a grant or loosens the review CHECK fails
 * here, before it reaches a push.
 */
const ROOT = join(__dirname, '..', '..', '..')
const sql = readFileSync(join(ROOT, 'supabase', 'migrations', '20260905000001_offline_door_validation.sql'), 'utf8')
const access = readFileSync(join(ROOT, 'src', 'lib', 'organisations', 'event-access.ts'), 'utf8')

function fn(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start, `${name} is defined`).toBeGreaterThan(-1)
  const end = sql.indexOf('\n$$;', start)
  return sql.slice(start, end)
}

describe('ticket_scans', () => {
  test('gains the provenance and review columns', () => {
    for (const col of ['client_scan_id    uuid', 'scanned_offline   boolean NOT NULL DEFAULT false', 'device_id         text', 'device_scanned_at timestamptz', "review_status     text NOT NULL DEFAULT 'none'", 'review_note       text', 'reviewed_at       timestamptz', 'reviewed_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL']) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${col}`)
    }
  })
  test('the review CHECK admits exactly three states', () => {
    expect(sql).toMatch(/CHECK \(review_status IN \('none', 'needs_review', 'resolved'\)\)/)
  })
  test('the device scan id is unique where present, and the review list has its partial index', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_scans_client_scan_id\s+ON public\.ticket_scans\(client_scan_id\) WHERE client_scan_id IS NOT NULL/)
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_ticket_scans_needs_review\s+ON public\.ticket_scans\(event_id, scanned_at\) WHERE review_status = 'needs_review'/)
  })
})

describe('door_staff_for_event', () => {
  test('is the same three-way test scan_ticket makes, and its role list is EVENT_MANAGER_ROLES', () => {
    const body = fn('door_staff_for_event')
    expect(body).toMatch(/o\.owner_id = v_uid/)
    expect(body).toMatch(/admin_users a WHERE a\.id = v_uid AND a\.disabled_at IS NULL/)
    const roles = /om\.role IN \(([^)]+)\)/.exec(body)?.[1].replace(/['\s]/g, '').split(',')
    const declared = /EVENT_MANAGER_ROLES = \[([^\]]+)\]/.exec(access)?.[1].replace(/['\s]/g, '').split(',')
    expect(roles).toEqual(declared)
  })
  test('answers false, never raises, for no session', () => {
    expect(fn('door_staff_for_event')).toMatch(/IF v_uid IS NULL THEN\s+RETURN false;/)
  })
})

describe('door_validation_set', () => {
  const body = fn('door_validation_set')
  test('returns the hash of the secret and no column called secret', () => {
    const returns = /RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/.exec(body)?.[1] ?? ''
    expect(returns).toMatch(/secret_hash\s+text/)
    expect(returns).not.toMatch(/\bsecret\s+(text|uuid)/)
    expect(body).toContain("encode(extensions.digest(t.secret::text, 'sha256'), 'hex')")
  })
  test('refuses the unauthenticated and the unauthorised before reading anything', () => {
    expect(body).toMatch(/IF auth\.uid\(\) IS NULL THEN\s+RAISE EXCEPTION 'not_authenticated'/)
    expect(body).toMatch(/IF NOT public\.door_staff_for_event\(p_event_id\) THEN\s+RAISE EXCEPTION 'not_authorised'/)
  })
  test('pages by ticket code and clamps the page to 5000', () => {
    expect(body).toMatch(/AND \(p_after_code IS NULL OR t\.ticket_code > p_after_code\)/)
    expect(body).toMatch(/ORDER BY t\.ticket_code/)
    expect(body).toMatch(/LIMIT LEAST\(GREATEST\(COALESCE\(p_limit, 5000\), 1\), 5000\)/)
  })
})

describe('sync_offline_scans', () => {
  const body = fn('sync_offline_scans')
  test('admits through the same compare-and-set as scan_ticket, keyed by code, hash and event, on a valid ticket only', () => {
    const update = /UPDATE public\.tickets t[\s\S]*?RETURNING/.exec(body)?.[0] ?? ''
    expect(update).toMatch(/SET status\s*=\s*'scanned'/)
    expect(update).toMatch(/WHERE t\.ticket_code = v_code/)
    expect(update).toMatch(/AND encode\(extensions\.digest\(t\.secret::text, 'sha256'\), 'hex'\) = v_hash/)
    expect(update).toMatch(/AND t\.event_id\s+= p_event_id/)
    expect(update).toMatch(/AND t\.status\s+= 'valid'/)
  })
  test('a retried batch is answered from the rows already written', () => {
    expect(body).toMatch(/WHERE ts\.client_scan_id = v_client_id;\s+IF FOUND THEN/)
    expect(body).toMatch(/'replayed', true/)
  })
  test('a device admission the server cannot admit is flagged; a device reject never is', () => {
    expect(body).toMatch(/v_review := CASE WHEN v_offline_result = 'admitted' THEN 'needs_review' ELSE 'none' END/)
  })
  test('the device clock is trusted only inside a sane window', () => {
    expect(body).toMatch(/v_device_at <= now\(\) AND v_device_at >= now\(\) - interval '48 hours'/)
  })
  test('refuses a non-array and more than 500 scans in one call', () => {
    expect(body).toMatch(/jsonb_typeof\(p_scans\) <> 'array'/)
    expect(body).toMatch(/jsonb_array_length\(p_scans\) > 500/)
  })
  test('every recorded row says it was scanned offline and carries the device scan id', () => {
    const inserts = body.match(/INSERT INTO public\.ticket_scans[\s\S]*?VALUES[\s\S]*?\);/g) ?? []
    expect(inserts.length).toBe(3)
    for (const ins of inserts) {
      expect(ins).toContain('client_scan_id, scanned_offline, device_id, device_scanned_at, review_status')
      expect(ins).toMatch(/v_client_id, true, v_device, v_device_at/)
    }
  })
})

describe('resolve_scan_review', () => {
  test('re-checks the caller against the scan\'s own event and closes only a row waiting for review', () => {
    const body = fn('resolve_scan_review')
    expect(body).toMatch(/NOT public\.door_staff_for_event\(v_event\)/)
    expect(body).toMatch(/SET review_status = 'resolved'/)
    expect(body).toMatch(/AND ts\.review_status = 'needs_review'/)
    expect(body).toMatch(/left\(trim\(COALESCE\(p_note, ''\)\), 500\)/)
  })
})

describe('grants and posture', () => {
  test('the three door RPCs are for signed-in staff only, never anon', () => {
    for (const sig of ['door_validation_set(uuid, text, integer)', 'sync_offline_scans(uuid, jsonb)', 'resolve_scan_review(uuid, text)', 'door_staff_for_event(uuid)']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon`)
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated`)
    }
    expect(sql).not.toMatch(/TO anon/)
  })
  test('every SECURITY DEFINER function pins its search_path', () => {
    const definers = sql.match(/SECURITY DEFINER\s+SET search_path = public, pg_temp/g) ?? []
    const declared = sql.match(/SECURITY DEFINER/g) ?? []
    expect(definers.length).toBe(declared.length)
    expect(declared.length).toBe(4)
  })
  test('pgcrypto is asked for in the extensions schema, where this project keeps it', () => {
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;')
  })
  test('no em or en dashes anywhere in the file', () => {
    expect(sql).not.toMatch(/[–—]/)
  })
})
