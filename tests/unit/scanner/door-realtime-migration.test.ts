import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * MIGRATION 20260905000002 (multi-scanner realtime), read as text. The live
 * proof is scripts/verify/door-realtime-verify.mjs on TEST; these pin the shape
 * so a later edit that drops the publication, loses the device id on an audit
 * row, or returns the secret in the door list fails before it reaches a push.
 */
const ROOT = join(__dirname, '..', '..', '..')
const sql = readFileSync(join(ROOT, 'supabase', 'migrations', '20260905000002_door_realtime.sql'), 'utf8')
const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')

function fn(name: string): string {
  const start = sql.indexOf(`CREATE FUNCTION public.${name}(`)
  const alt = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  const from = start === -1 ? alt : start
  expect(from, `${name} is defined`).toBeGreaterThan(-1)
  return sql.slice(from, sql.indexOf('\n$$;', from))
}

describe('the publication', () => {
  test('adds ticket_scans to supabase_realtime, guarded so a re-run is a no-op', () => {
    expect(sql).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_publication_tables\s+WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ticket_scans'/)
    expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_scans;')
  })
  test("cites Supabase's own page for the SQL and the RLS rule", () => {
    expect(sql).toContain('https://supabase.com/docs/guides/realtime/postgres-changes')
  })
})

describe('door_validation_set', () => {
  test('leads with ticket_id and still never returns a column called secret', () => {
    const body = fn('door_validation_set')
    const returns = /RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/.exec(body)?.[1] ?? ''
    expect(returns.trim()).toMatch(/^ticket_id\s+uuid,/)
    expect(returns).toMatch(/secret_hash\s+text/)
    expect(returns).not.toMatch(/\bsecret\s+(text|uuid)/)
    expect(body).toMatch(/SELECT t\.id,\s+t\.ticket_code,/)
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.door_validation_set(uuid, text, integer);')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.door_validation_set(uuid, text, integer) FROM PUBLIC, anon;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.door_validation_set(uuid, text, integer) TO authenticated;')
  })
})

describe('scan_ticket', () => {
  const body = fn('scan_ticket')
  test('takes an optional device id as its fourth argument and drops the three-argument form', () => {
    expect(body).toMatch(/p_device_id\s+TEXT DEFAULT NULL/)
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.scan_ticket(TEXT, UUID, UUID);')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.scan_ticket(TEXT, UUID, UUID, TEXT) TO authenticated;')
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.scan_ticket(TEXT, UUID, UUID, TEXT) FROM anon;')
  })
  test('records the device on all three audit inserts, capped at 80 characters', () => {
    expect(body).toMatch(/v_device\s+TEXT := left\(p_device_id, 80\)/)
    const inserts = body.match(/INSERT INTO public\.ticket_scans \(ticket_id, event_id, scanned_by, result, device_id\)/g) ?? []
    expect(inserts).toHaveLength(3)
    expect(body.match(/, v_device\);/g) ?? []).toHaveLength(3)
  })
  test('keeps the proven admit-exactly-once compare-and-set untouched', () => {
    const update = /UPDATE public\.tickets t[\s\S]*?RETURNING/.exec(body)?.[0] ?? ''
    expect(update).toMatch(/AND t\.secret\s+= p_secret/)
    expect(update).toMatch(/AND t\.status\s+= 'valid'/)
    expect(body).toMatch(/admin_users a\s+WHERE a\.id = v_uid AND a\.disabled_at IS NULL/)
  })
})

describe('door_realtime_enabled', () => {
  test('reads pg_publication_tables as SECURITY DEFINER, for authenticated and the service role, never anon', () => {
    const body = fn('door_realtime_enabled')
    expect(body).toMatch(/SECURITY DEFINER/)
    expect(body).toMatch(/SET search_path = public, pg_temp/)
    expect(body).toMatch(/FROM pg_publication_tables\s+WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ticket_scans'/)
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.door_realtime_enabled() FROM PUBLIC, anon;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.door_realtime_enabled() TO authenticated, service_role;')
  })
  test('every SECURITY DEFINER function in the file pins its search_path', () => {
    expect((sql.match(/SECURITY DEFINER/g) ?? []).length).toBe(3)
    expect((sql.match(/SECURITY DEFINER\s+(STABLE\s+)?SET search_path = public, pg_temp/g) ?? []).length).toBe(3)
  })
})

describe('the realtime socket in the content security policy', () => {
  test("the report-only connect-src names wss://*.supabase.co beside https://*.supabase.co, with the observed reason", () => {
    const line = /"connect-src [^"]*"/.exec(config)?.[0] ?? ''
    expect(line).toContain('https://*.supabase.co')
    expect(line).toContain('wss://*.supabase.co')
    expect(config).toMatch(/wss:\/\/<ref>\.supabase\.co\/realtime\/v1\/websocket/)
  })
})

test('no em or en dashes anywhere in the migration', () => {
  expect(sql).not.toMatch(/[–—]/)
})
