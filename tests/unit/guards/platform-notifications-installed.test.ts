// The guard that refuses a build whose database can let a state change go
// unrecorded. Close-out UX3.
//
// The decision is a pure function so every verdict can be exercised without a
// network, and the last block ties REQUIRED_FLAGS to the migration itself, so a
// flag added to the SQL and forgotten here, or listed here and never answered,
// fails rather than passing vacuously.

import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decide,
  ask,
  RPC,
  MIGRATIONS,
  REQUIRED_FLAGS,
  FLAG_MEANING,
} from '../../../scripts/guards/platform-notifications-installed.mjs'

const URL = 'https://vkapkibzokmfaxqogypq.supabase.co'
const good: Record<string, unknown> = Object.fromEntries(
  REQUIRED_FLAGS.map((f: string) => [f, true]),
)

describe('decide', () => {
  test('SKIPs by name without a real project URL, or without a key that may ask', () => {
    expect(decide({ url: '', serviceKey: 'k', answer: { value: good } }).verdict).toBe('SKIP')
    expect(
      decide({ url: 'https://example.supabase.co', serviceKey: 'k', answer: { value: good } }).verdict,
    ).toBe('SKIP')
    const noKey = decide({ url: URL, serviceKey: '', answer: { value: good } })
    expect(noKey.verdict).toBe('SKIP')
    expect(noKey.reason).toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  test('PASSes only when every flag is true', () => {
    expect(decide({ url: URL, serviceKey: 'k', answer: { value: good } }).verdict).toBe('PASS')
  })

  test('names the state change that would go silent, not just the flag', () => {
    const dropped = decide({
      url: URL,
      serviceKey: 'k',
      answer: { value: { ...good, trigger_order_paid: false } },
    })
    expect(dropped.verdict).toBe('FAIL')
    expect(dropped.reason).toContain('trigger_order_paid')
    expect(dropped.reason).toContain('an order can be confirmed with no record written')
    expect(dropped.reason).toContain(MIGRATIONS[0])
  })

  test('a trigger that is present but disabled fails, because it looks installed', () => {
    const disabled = decide({
      url: URL,
      serviceKey: 'k',
      answer: { value: { ...good, triggers_enabled: false } },
    })
    expect(disabled.verdict).toBe('FAIL')
    expect(disabled.reason).toContain('fires nothing')
  })

  test('FAILs when the RPC cannot be asked or answers the wrong shape', () => {
    const absent = decide({ url: URL, serviceKey: 'k', answer: { error: 'HTTP 404 not found' } })
    expect(absent.verdict).toBe('FAIL')
    expect(absent.reason).toMatch(/could not be asked/)
    expect(decide({ url: URL, serviceKey: 'k', answer: { value: true } }).verdict).toBe('FAIL')
    expect(decide({ url: URL, serviceKey: 'k', answer: { value: null } }).verdict).toBe('FAIL')
  })

  test('a flag merely absent from the answer is a failure, never a pass', () => {
    const { trigger_event_published: _gone, ...short } = good
    const verdict = decide({ url: URL, serviceKey: 'k', answer: { value: short } })
    expect(verdict.verdict).toBe('FAIL')
    expect(verdict.reason).toContain('trigger_event_published')
  })

  test('every required flag carries an explanation a reader can act on', () => {
    const meaning = FLAG_MEANING as Record<string, string | undefined>
    for (const flag of REQUIRED_FLAGS as string[]) {
      expect(meaning[flag], flag).toBeTruthy()
    }
  })
})

describe('ask', () => {
  test('GETs the STABLE RPC with the service key and parses the jsonb', async () => {
    const fetchImpl = vi.fn(
      async (url: string, init: { method?: string; headers: Record<string, string> }) => {
        expect(url).toBe(`${URL}/rest/v1/rpc/${RPC}`)
        expect(init.method).toBeUndefined()
        expect(init.headers.apikey).toBe('service')
        return new Response(JSON.stringify(good), { status: 200 })
      },
    )
    const got = await ask({ url: URL, serviceKey: 'service', fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(got.value).toEqual(good)
  })

  test('a non-200 answer, unparseable text or a thrown fetch is an error, never a value', async () => {
    const denied = vi.fn(async () => new Response('{"message":"permission denied"}', { status: 401 }))
    expect((await ask({ url: URL, serviceKey: 'k', fetchImpl: denied as unknown as typeof fetch })).error).toMatch(
      /HTTP 401/,
    )
    const junk = vi.fn(async () => new Response('not json', { status: 200 }))
    expect((await ask({ url: URL, serviceKey: 'k', fetchImpl: junk as unknown as typeof fetch })).error).toMatch(
      /unparseable/,
    )
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    expect((await ask({ url: URL, serviceKey: 'k', fetchImpl: down as unknown as typeof fetch })).error).toBe(
      'fetch failed',
    )
  })
})

describe('the required flags are the flags the migration answers', () => {
  test('every REQUIRED_FLAG is a key platform_notification_guards() builds, and every key it builds is required', () => {
    const sql = readFileSync(
      join(__dirname, '..', '..', '..', 'supabase', 'migrations', MIGRATIONS[1]),
      'utf8',
    )
    const fn = sql.slice(sql.indexOf('function public.platform_notification_guards()'))
    // Exactly four spaces: that is the indentation of a jsonb_build_object KEY.
    // A looser \s+ also matches the enum labels inside the array[...] literals,
    // which sit at eight, and the first draft of this test failed against a
    // perfectly correct migration for that reason.
    const keys = [...fn.matchAll(/^ {4}'([a-z_]+)',/gm)].map((m) => m[1])
    for (const flag of REQUIRED_FLAGS) expect(keys, flag).toContain(flag)
    expect([...new Set(keys)].sort()).toEqual([...REQUIRED_FLAGS].sort())
  })

  test('the migration installs a trigger for every one of the five state changes', () => {
    const sql = readFileSync(
      join(__dirname, '..', '..', '..', 'supabase', 'migrations', MIGRATIONS[0]),
      'utf8',
    )
    for (const trigger of [
      'platform_notify_organiser_created',
      'platform_notify_connect_transitions',
      'platform_notify_event_published',
      'platform_notify_event_published_insert',
      'platform_notify_order_paid',
      'platform_notify_order_paid_insert',
    ]) {
      expect(sql, trigger).toContain(`create trigger ${trigger}`)
    }
  })
})
