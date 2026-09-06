import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decide, ask, RPC, MIGRATIONS, REQUIRED_FLAGS } from '../../../scripts/guards/event-lifecycle-installed.mjs'

const URL = 'https://vkapkibzokmfaxqogypq.supabase.co'
const allTrue: Record<string, unknown> = Object.fromEntries(REQUIRED_FLAGS.map((f: string) => [f, true]))
const good: Record<string, unknown> = { ...allTrue, no_action_fks: [] }

describe('decide', () => {
  test('SKIPs by name without a real project URL, or without a key that may ask', () => {
    expect(decide({ url: '', serviceKey: 'k', answer: { value: good } })).toMatchObject({ verdict: 'SKIP' })
    expect(decide({ url: 'https://placeholder.supabase.co', serviceKey: 'k', answer: { value: good } }).verdict).toBe('SKIP')
    const noKey = decide({ url: URL, serviceKey: '', answer: { value: good } })
    expect(noKey.verdict).toBe('SKIP')
    expect(noKey.reason).toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  test('PASSes only when every flag is true and no foreign key is NO ACTION', () => {
    expect(decide({ url: URL, serviceKey: 'k', answer: { value: good } }).verdict).toBe('PASS')
  })

  test('FAILs naming each missing flag and the migrations', () => {
    const missing = decide({ url: URL, serviceKey: 'k', answer: { value: { ...good, delete_refusal_trigger: false, tombstone_trigger: false } } })
    expect(missing.verdict).toBe('FAIL')
    expect(missing.reason).toContain('delete_refusal_trigger')
    expect(missing.reason).toContain('tombstone_trigger')
    expect(missing.reason).toContain(MIGRATIONS[1])
  })

  test('FAILs on a NO ACTION foreign key by name', () => {
    const fk = decide({ url: URL, serviceKey: 'k', answer: { value: { ...good, no_action_fks: ['events_parent_event_id_fkey'] } } })
    expect(fk.verdict).toBe('FAIL')
    expect(fk.reason).toContain('events_parent_event_id_fkey')
  })

  test('FAILs when the RPC cannot be asked or answers the wrong shape', () => {
    const absent = decide({ url: URL, serviceKey: 'k', answer: { error: 'HTTP 404 function not found' } })
    expect(absent.verdict).toBe('FAIL')
    expect(absent.reason).toMatch(/could not be asked/)
    expect(decide({ url: URL, serviceKey: 'k', answer: { value: true } }).verdict).toBe('FAIL')
    expect(decide({ url: URL, serviceKey: 'k', answer: { value: null } }).verdict).toBe('FAIL')
  })

  test('a flag that is merely absent from the answer is a failure, never a pass', () => {
    const { archived_in_enum: _gone, ...short } = good
    expect(decide({ url: URL, serviceKey: 'k', answer: { value: short } }).reason).toContain('archived_in_enum')
  })
})

describe('ask', () => {
  test('GETs the STABLE RPC with the service key and parses the jsonb', async () => {
    const fetchImpl = vi.fn(async (url: string, init: { method?: string; headers: Record<string, string> }) => {
      expect(url).toBe(`${URL}/rest/v1/rpc/${RPC}`)
      expect(init.method).toBeUndefined()
      expect(init.headers.apikey).toBe('service')
      return new Response(JSON.stringify(good), { status: 200 })
    })
    const got = await ask({ url: URL, serviceKey: 'service', fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(got.value).toEqual(good)
  })

  test('a non-200 answer, unparseable text or a thrown fetch is an error, never a value', async () => {
    const denied = vi.fn(async () => new Response('{"message":"permission denied"}', { status: 401 }))
    expect((await ask({ url: URL, serviceKey: 'k', fetchImpl: denied as unknown as typeof fetch })).error).toMatch(/HTTP 401/)
    const junk = vi.fn(async () => new Response('not json', { status: 200 }))
    expect((await ask({ url: URL, serviceKey: 'k', fetchImpl: junk as unknown as typeof fetch })).error).toMatch(/unparseable/)
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    expect((await ask({ url: URL, serviceKey: 'k', fetchImpl: down as unknown as typeof fetch })).error).toBe('fetch failed')
  })
})

describe('the required flags are the flags the migration answers', () => {
  test('every REQUIRED_FLAG is a key event_lifecycle_guards() builds, and every boolean key it builds is required', () => {
    const sql = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'migrations', MIGRATIONS[1]), 'utf8')
    const fn = sql.slice(sql.indexOf('FUNCTION public.event_lifecycle_guards()'))
    const keys = [...fn.matchAll(/^\s+'([a-z_]+)', /gm)].map((m) => m[1])
    for (const flag of REQUIRED_FLAGS) expect(keys, flag).toContain(flag)
    const booleans = keys.filter((k) => k !== 'no_action_fks')
    expect(booleans.sort()).toEqual([...REQUIRED_FLAGS].sort())
  })
})
