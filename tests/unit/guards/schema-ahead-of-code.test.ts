import { describe, expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { interpretProbe, probeSchemaObject, projectRefOf } from '../../../scripts/guards/lib/schema-probe.mjs'
import { SCHEMA_THE_CODE_NAMES } from '../../../scripts/guards/lib/schema-manifest.mjs'

/**
 * SCHEMA-AHEAD-OF-CODE: the guard that refuses a build whose database is
 * behind its code (scripts/guards/schema-ahead-of-code.mjs).
 *
 * The probe's interpretation table was calibrated against the real TEST
 * project on 4 September 2026 (C:\dev\EVIDENCE\A2\schema-probe-calibration.txt),
 * and these tests pin that table so a PostgREST answer that later changes shape
 * fails here, loudly, rather than being read as "the column is missing".
 */
const ROOT = join(__dirname, '..', '..', '..')

type FetchLike = typeof fetch

function answering(status: number, body: unknown): FetchLike {
  return (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as FetchLike
}

describe('interpretProbe: the calibrated PostgREST answers', () => {
  test('200 is PRESENT (the column exists and the key may read it)', () => {
    expect(interpretProbe(200, '')).toBe('present')
  })
  test('206 is PRESENT (a ranged read)', () => {
    expect(interpretProbe(206, '')).toBe('present')
  })
  test('400 with 42703 is ABSENT (the table exists, the column does not)', () => {
    expect(interpretProbe(400, '42703')).toBe('absent')
  })
  test('404 with PGRST205 is ABSENT (the table is not in the schema cache)', () => {
    expect(interpretProbe(404, 'PGRST205')).toBe('absent')
  })
  test('401 with 42501 is PRESENT (the object exists, this key may not read it)', () => {
    expect(interpretProbe(401, '42501')).toBe('present')
    expect(interpretProbe(403, '42501')).toBe('present')
  })
  test('anything else is UNKNOWN, never absent: an outage is not a missing column', () => {
    expect(interpretProbe(500, '')).toBe('unknown')
    expect(interpretProbe(502, '')).toBe('unknown')
    expect(interpretProbe(400, 'PGRST100')).toBe('unknown')
    expect(interpretProbe(404, '')).toBe('unknown')
    expect(interpretProbe(401, 'PGRST301')).toBe('unknown')
    expect(interpretProbe(0, 'FETCH_FAILED')).toBe('unknown')
  })
})

describe('probeSchemaObject: one read-only GET with limit=0, never a row', () => {
  const base = { url: 'https://abcdefghijklmnopqrst.supabase.co/', key: 'k', table: 'ticket_tiers', column: 'access_mode' }

  test('asks for the column with limit=0 and both auth headers, and strips the trailing slash', async () => {
    let seen: { url: string; headers: Record<string, string> } | null = null
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(input), headers: (init?.headers ?? {}) as Record<string, string> }
      return new Response('[]', { status: 200 })
    }) as unknown as FetchLike
    const r = await probeSchemaObject({ ...base, fetchImpl })
    expect(r.state).toBe('present')
    expect(seen!.url).toBe('https://abcdefghijklmnopqrst.supabase.co/rest/v1/ticket_tiers?select=access_mode&limit=0')
    expect(seen!.headers.apikey).toBe('k')
    expect(seen!.headers.authorization).toBe('Bearer k')
  })

  test('a missing column reads as ABSENT with the code carried', async () => {
    const r = await probeSchemaObject({ ...base, fetchImpl: answering(400, { code: '42703', message: 'column ticket_tiers.access_mode does not exist' }) })
    expect(r).toMatchObject({ state: 'absent', status: 400, code: '42703' })
  })

  test('a missing table reads as ABSENT', async () => {
    const r = await probeSchemaObject({ ...base, table: 'stream_messages', column: 'id', fetchImpl: answering(404, { code: 'PGRST205', message: 'Could not find the table' }) })
    expect(r).toMatchObject({ state: 'absent', status: 404, code: 'PGRST205' })
  })

  test('permission denied reads as PRESENT: the table with no anon grant is proof it exists', async () => {
    const r = await probeSchemaObject({ ...base, table: 'event_stream_links', column: 'event_id', fetchImpl: answering(401, { code: '42501', message: 'permission denied for table event_stream_links' }) })
    expect(r).toMatchObject({ state: 'present', status: 401, code: '42501' })
  })

  test('a network failure is UNKNOWN with the reason named, not absent', async () => {
    const fetchImpl = (async () => {
      throw new Error('fetch failed')
    }) as unknown as FetchLike
    const r = await probeSchemaObject({ ...base, fetchImpl })
    expect(r).toMatchObject({ state: 'unknown', status: 0, code: 'FETCH_FAILED', message: 'fetch failed' })
  })

  test('a non-JSON body (a proxy page) is UNKNOWN with its first line kept as the reason', async () => {
    const r = await probeSchemaObject({ ...base, fetchImpl: answering(502, '<html>Bad gateway</html>\nmore') })
    expect(r.state).toBe('unknown')
    expect(r.message).toBe('<html>Bad gateway</html>')
  })
})

describe('the manifest of schema the code names', () => {
  // Normalised to LF: the checkout may carry CRLF and a regex anchored on \n
  // fails silently against \r\n, which is how the first draft of this test
  // reported every table as missing.
  const types = readFileSync(join(ROOT, 'src', 'types', 'database.ts'), 'utf8').replace(/\r\n/g, '\n')

  /** The `Row: { ... }` block of a table in the generated types, or null. */
  function rowBlock(table: string): string | null {
    const start = types.indexOf(`\n      ${table}: {\n        Row: {\n`)
    if (start < 0) return null
    const end = types.indexOf('\n        }\n', start)
    return end < 0 ? null : types.slice(start, end)
  }

  test('names at least the four A2 objects', () => {
    const names = SCHEMA_THE_CODE_NAMES.map((m) => `${m.table}.${m.column}`)
    expect(names).toEqual(
      expect.arrayContaining(['ticket_tiers.access_mode', 'events.stream_geo_allow', 'stream_messages.id', 'event_stream_links.event_id']),
    )
  })

  for (const m of SCHEMA_THE_CODE_NAMES) {
    test(`${m.table}.${m.column}: its migration ${m.migration} exists on disk`, () => {
      expect(existsSync(join(ROOT, 'supabase', 'migrations', m.migration))).toBe(true)
    })

    test(`${m.table}.${m.column}: the generated types know the table and the column`, () => {
      // The types file is regenerated from the applied schema, so an entry that
      // names something the types do not carry is a typo in the manifest, and a
      // typo here would make the guard fail every build for a column that was
      // never meant to exist.
      const block = rowBlock(m.table)
      expect(block, `table ${m.table} not in src/types/database.ts`).not.toBeNull()
      expect(block, `column ${m.column} not in the ${m.table} Row block`).toContain(`\n          ${m.column}:`)
    })
  }

  test('every entry carries the migration and who reads it, for the person reading a failure', () => {
    for (const m of SCHEMA_THE_CODE_NAMES) {
      expect(m.migration).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/)
      expect(m.readBy.length).toBeGreaterThan(10)
    }
  })
})

describe('the guard and the founder script share one manifest and one probe', () => {
  const guard = readFileSync(join(ROOT, 'scripts', 'guards', 'schema-ahead-of-code.mjs'), 'utf8')
  const ops = readFileSync(join(ROOT, 'scripts', 'ops', 'verify-production-schema.mjs'), 'utf8')

  test('both import the manifest rather than carrying their own list', () => {
    expect(guard).toContain("from './lib/schema-manifest.mjs'")
    expect(ops).toContain("from '../guards/lib/schema-manifest.mjs'")
    expect(guard).not.toMatch(/SCHEMA_THE_CODE_NAMES = \[/)
    expect(ops).not.toMatch(/SCHEMA_THE_CODE_NAMES = \[/)
  })

  test('both import the probe rather than re-rolling the interpretation', () => {
    expect(guard).toContain("from './lib/schema-probe.mjs'")
    expect(ops).toContain("from '../guards/lib/schema-probe.mjs'")
  })

  test('the guard falls through an EMPTY service-role key to the anon key', () => {
    // A pulled Vercel env file lists a sensitive variable as an empty string.
    // With `??` the empty string was carried as the credential and the guard
    // reported "no database to check" against production (4 September 2026).
    expect(guard).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
  })

  test('the founder script never interpolates a key or the pulled env into output', () => {
    expect(ops).not.toMatch(/\$\{key\}/)
    expect(ops).not.toMatch(/\$\{env\./)
    expect(ops).not.toMatch(/console\.(log|error)\((key|env)\b/)
  })

  test('the founder script deletes the pulled file in a finally', () => {
    expect(ops).toMatch(/finally \{\s*rmSync\(dir, \{ recursive: true, force: true \}\)/)
  })
})

describe('projectRefOf', () => {
  test('reads the ref out of a Supabase URL and nothing else', () => {
    expect(projectRefOf('https://vkapkibzokmfaxqogypq.supabase.co')).toBe('vkapkibzokmfaxqogypq')
    expect(projectRefOf('https://vkapkibzokmfaxqogypq.supabase.co/')).toBe('vkapkibzokmfaxqogypq')
    expect(projectRefOf('https://example.supabase.co')).toBe('example')
    expect(projectRefOf('http://localhost:54321')).toBeNull()
    expect(projectRefOf(undefined)).toBeNull()
  })
})
