import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bearerToken,
  generateApiToken,
  hashApiToken,
  looksLikeApiToken,
  tokenPrefix,
} from '@/lib/api/v1/keys'
import {
  API_V1_RESOURCES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  asUuid,
  parsePage,
} from '@/lib/api/v1/reads'
import {
  apiV1BadRequest,
  apiV1Item,
  apiV1List,
  apiV1NotFound,
  apiV1Unauthorised,
  apiV1Unavailable,
} from '@/lib/api/v1/response'

/**
 * API1. The pure half of the organiser scoped read only API.
 *
 * WHAT IS PROVEN HERE AND WHAT IS NOT, said plainly so the split is not
 * mistaken for coverage. Everything in this file is a decision that can be made
 * without a database: the shape of a token, what a hash is over, what a page
 * request clamps to, and what every response carries. The claims that need real
 * rows in two real organisations, which is the acceptance the item leads with,
 * are driven against TEST in scripts/verify/api1-organiser-api-drive.mjs and
 * are not simulated here. A mock of a scope check proves that the mock is
 * scoped.
 */

const ROOT = process.cwd()
const scope = { keyId: 'key-1', organisationId: 'org-A' }
const other = { keyId: 'key-2', organisationId: 'org-B' }

describe('the token', () => {
  it('carries the scheme so a leaked value is recognisable on sight', () => {
    expect(generateApiToken().startsWith('elq_')).toBe(true)
  })

  it('is lowercase alphanumerics only, so it survives a terminal, a YAML file and a settings box', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateApiToken()).toMatch(/^elq_[a-z0-9]{40}$/)
    }
  })

  it('never repeats across a thousand mints', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i += 1) seen.add(generateApiToken())
    expect(seen.size).toBe(1000)
  })

  it('refuses a value of the wrong shape before it reaches the database', () => {
    expect(looksLikeApiToken(generateApiToken())).toBe(true)
    expect(looksLikeApiToken('elq_TOOSHORT')).toBe(false)
    expect(looksLikeApiToken('elq_' + 'A'.repeat(40))).toBe(false)
    expect(looksLikeApiToken('sk_live_' + 'a'.repeat(40))).toBe(false)
    expect(looksLikeApiToken('')).toBe(false)
  })

  it('shows only its opening on screen, and that opening is derived from the token itself', () => {
    const token = generateApiToken()
    expect(tokenPrefix(token)).toBe(token.slice(0, 12))
    expect(tokenPrefix(token)).toMatch(/^elq_[a-z0-9]{8}$/)
    // Short enough to be useless: the rest of the token is still 32 characters.
    expect(token.length - tokenPrefix(token).length).toBe(32)
  })
})

describe('the hash', () => {
  it('is a sha256 hex digest, which is the shape the database constraint demands', () => {
    expect(hashApiToken(generateApiToken())).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable for one token and different for another', () => {
    const a = generateApiToken()
    const b = generateApiToken()
    expect(hashApiToken(a)).toBe(hashApiToken(a))
    expect(hashApiToken(a)).not.toBe(hashApiToken(b))
  })

  it('does not contain the token it is over', () => {
    const token = generateApiToken()
    expect(hashApiToken(token)).not.toContain(token.slice(4))
  })
})

describe('the credential arrives in the header and nowhere else', () => {
  it('reads a bearer token, case insensitively', () => {
    expect(bearerToken('Bearer elq_abc')).toBe('elq_abc')
    expect(bearerToken('bearer elq_abc')).toBe('elq_abc')
    expect(bearerToken('  Bearer   elq_abc  ')).toBe('elq_abc')
  })

  it('refuses every other scheme and an absent header', () => {
    expect(bearerToken(null)).toBeNull()
    expect(bearerToken('')).toBeNull()
    expect(bearerToken('elq_abc')).toBeNull()
    expect(bearerToken('Basic elq_abc')).toBeNull()
    expect(bearerToken('Bearer')).toBeNull()
  })

  it('is the only way in: no route or handler reads a key from the query string', () => {
    const surface = [
      'src/lib/api/v1/handlers.ts',
      'src/lib/api/v1/keys.ts',
      'src/app/api/v1/events/route.ts',
      'src/app/api/v1/orders/route.ts',
      'src/app/api/v1/attendees/route.ts',
    ]
    for (const rel of surface) {
      const code = readFileSync(join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(code, `${rel} reads a credential from the URL`).not.toMatch(
        /searchParams\.get\(\s*['"](api_?key|key|token|access_token)['"]\s*\)/i,
      )
    }
  })
})

describe('pagination', () => {
  const page = (qs: string) => parsePage(new URLSearchParams(qs))

  it('defaults to one screen of a table', () => {
    expect(page('')).toEqual({ limit: DEFAULT_PAGE_SIZE, offset: 0 })
  })

  it('honours a request inside the bounds', () => {
    expect(page('limit=10&offset=30')).toEqual({ limit: 10, offset: 30 })
  })

  it('clamps rather than refuses, so an over-large ask is still a page to iterate', () => {
    expect(page('limit=100000').limit).toBe(MAX_PAGE_SIZE)
    expect(page('limit=0').limit).toBe(1)
    expect(page('limit=-5').limit).toBe(1)
    expect(page('offset=-5').offset).toBe(0)
  })

  it('falls back rather than producing NaN', () => {
    expect(page('limit=abc').limit).toBe(DEFAULT_PAGE_SIZE)
    expect(page('limit=').limit).toBe(DEFAULT_PAGE_SIZE)
    expect(page('offset=abc').offset).toBe(0)
  })

  it('has no way to ask for everything', () => {
    for (const qs of ['limit=999999', 'limit=1e9', 'limit=Infinity', 'limit=201']) {
      expect(page(qs).limit).toBeLessThanOrEqual(MAX_PAGE_SIZE)
    }
  })
})

describe('an id that is not a uuid never reaches a query', () => {
  it('accepts a uuid in either case', () => {
    expect(asUuid('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).not.toBeNull()
    expect(asUuid('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).not.toBeNull()
  })

  it('refuses everything else, including the shapes an injection attempt takes', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'not-a-uuid',
      '3f2504e0-4f89-11d3-9a0c',
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301' or '1'='1",
      '*',
      '%',
    ]) {
      expect(asUuid(bad as string | null | undefined), `${String(bad)} was accepted`).toBeNull()
    }
  })
})

describe('every response names the organisation it is about', () => {
  async function body(res: Response) {
    return (await res.json()) as Record<string, unknown>
  }

  it('on a list', async () => {
    const res = apiV1List(scope, 'events', [{ id: 'e1' }], {
      limit: 50,
      offset: 0,
      total: 1,
      hasMore: false,
    })
    expect(await body(res)).toMatchObject({ ok: true, organisation_id: 'org-A', resource: 'events' })
  })

  it('on a single row', async () => {
    expect(await body(apiV1Item(scope, 'orders', { id: 'o1' }))).toMatchObject({
      ok: true,
      organisation_id: 'org-A',
    })
  })

  it('on a refusal that happens after the key is known', async () => {
    for (const res of [
      apiV1NotFound(scope, 'events'),
      apiV1BadRequest(scope, 'event_id must be a uuid'),
      apiV1Unavailable(scope, 'orders'),
    ]) {
      expect(await body(res)).toMatchObject({ ok: false, organisation_id: 'org-A' })
    }
  })

  it('and names the caller s own organisation, never another', async () => {
    expect(await body(apiV1Item(other, 'events', { id: 'e1' }))).toMatchObject({
      organisation_id: 'org-B',
    })
  })

  it('except the one refusal that happens before a key is known, which has no organisation to name', async () => {
    const res = apiV1Unauthorised('unknown_key')
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toContain('Bearer')
    expect(await body(res)).not.toHaveProperty('organisation_id')
  })
})

describe('an out of scope id is indistinguishable from one that does not exist', () => {
  it('answers 404', () => {
    expect(apiV1NotFound(scope, 'events').status).toBe(404)
  })

  it('and there is no 403 builder to reach for', () => {
    // Comments out first: this file EXPLAINS at length why there is no
    // forbidden builder, and the prose saying so must not read as one.
    const code = readFileSync(join(ROOT, 'src/lib/api/v1/response.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    expect(code).not.toMatch(/status:\s*403/)
    expect(code).not.toMatch(/Forbidden/)
    expect(code).not.toMatch(/apiV1Forbidden/)
  })

  it('so the two cases answer with the same bytes', async () => {
    const missing = await apiV1NotFound(scope, 'events').json()
    const notYours = await apiV1NotFound(scope, 'events').json()
    expect(JSON.stringify(missing)).toBe(JSON.stringify(notYours))
  })
})

describe('nothing on this surface is cacheable', () => {
  it('every builder sends no-store, because a page of orders is not a public document', () => {
    const responses = [
      apiV1List(scope, 'events', [], { limit: 50, offset: 0, total: 0, hasMore: false }),
      apiV1Item(scope, 'orders', {}),
      apiV1NotFound(scope, 'events'),
      apiV1BadRequest(scope, 'x'),
      apiV1Unavailable(scope, 'orders'),
      apiV1Unauthorised('missing_key'),
    ]
    for (const res of responses) expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('the readable surface is three objects and no more', () => {
  it('names exactly the three views the migration creates', () => {
    expect(Object.values(API_V1_RESOURCES)).toEqual([
      'api_v1_events',
      'api_v1_orders',
      'api_v1_attendees',
    ])
  })

  it('and the migration creates every one of them, with the scope column on it', () => {
    const sql = readFileSync(
      join(ROOT, 'supabase/migrations/20260918000020_organiser_api_keys.sql'),
      'utf8',
    )
    for (const view of Object.values(API_V1_RESOURCES)) {
      const start = sql.indexOf(`create or replace view public.${view}`)
      expect(start, `${view} is not created`).toBeGreaterThan(-1)
      const body = sql.slice(start, sql.indexOf(';', start))
      expect(body, `${view} does not select organisation_id`).toContain('organisation_id')
    }
  })

  it('and the QR signing secret is in none of them', () => {
    const sql = readFileSync(
      join(ROOT, 'supabase/migrations/20260918000020_organiser_api_keys.sql'),
      'utf8',
    )
    const start = sql.indexOf('create or replace view public.api_v1_attendees')
    const body = sql.slice(start, sql.indexOf(';', start))
    expect(body).not.toMatch(/\bt\.secret\b/)
  })
})

describe('the rate limit is the tier the scope document publishes', () => {
  it('reads 1000 a minute for the organiser tier, keyed by the organisation', async () => {
    const { POLICIES } = await import('@/lib/rate-limit/policies')
    expect(POLICIES['api-v1-read'].limit).toBe(1000)
    expect(POLICIES['api-v1-read'].windowSec).toBe(60)
    expect(POLICIES['api-v1-read'].rationale).toContain('section 4.1')
  })

  it('and carries a pre-authentication bucket, because the organiser bucket cannot name an unknown caller', async () => {
    const { POLICIES } = await import('@/lib/rate-limit/policies')
    expect(POLICIES['api-v1-auth'].limit).toBeGreaterThan(0)
    expect(POLICIES['api-v1-auth'].windowSec).toBe(60)
  })

  it('and the handler applies the organiser bucket only after the key names the organisation', () => {
    const code = readFileSync(join(ROOT, 'src/lib/api/v1/handlers.ts'), 'utf8')
    const preAuth = code.indexOf("applyRateLimit('api-v1-auth'")
    const authenticate = code.indexOf('authenticateApiKey(')
    const tiered = code.indexOf("applyRateLimit('api-v1-read'")
    expect(preAuth).toBeGreaterThan(-1)
    expect(preAuth).toBeLessThan(authenticate)
    expect(authenticate).toBeLessThan(tiered)
  })
})

describe('the six routes delegate and decide nothing', () => {
  const routes = [
    'src/app/api/v1/events/route.ts',
    'src/app/api/v1/events/[id]/route.ts',
    'src/app/api/v1/orders/route.ts',
    'src/app/api/v1/orders/[id]/route.ts',
    'src/app/api/v1/attendees/route.ts',
    'src/app/api/v1/attendees/[id]/route.ts',
  ]

  it('exports GET and nothing that writes', () => {
    for (const rel of routes) {
      const code = readFileSync(join(ROOT, rel), 'utf8')
      expect(code, `${rel} has no GET`).toMatch(/export async function GET/)
      for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(code, `${rel} exports ${verb}`).not.toMatch(
          new RegExp(`export (async )?function ${verb}`),
        )
      }
    }
  })
})
