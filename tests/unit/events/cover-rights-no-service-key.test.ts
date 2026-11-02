import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readCoverRights } from '@/lib/events/featured-with-recorded-rights'

/*
 * NO SERVICE-ROLE KEY, NO ADMIN READ (car 35's red of 2 November 2026, 12:03, run 41369396020: 'Error: supabaseKey is
 * required. at src/lib/supabase/admin.ts:20:10 at r (src/lib/events/discovery-data.ts:54:5) ... Export encountered an
 * error on /city/[slug]/page: /city/gold-coast'). The CI build job carries only NEXT_PUBLIC values on purpose, and
 * /city/[slug] prerenders every city, so the cover-rights read must never make the admin client where no key exists:
 * it is SKIPPED, not guessed (a night with no recorded rights is a row), the rule src/lib/listings/free-week-surface.ts
 * already holds for /sitemap.xml. Wherever the key exists, the read runs as before.
 */
const KEYS = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY_PREVIEW', 'PREVIEW_READ_ONLY'] as const
let saved: Record<string, string | undefined> = {}
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

function recordingClient(rows: { event_id: string; rights_state: string }[]) {
  const q = {
    select: () => q,
    eq: () => q,
    in: () => Promise.resolve({ data: rows, error: null }),
  }
  return { from: () => q }
}

describe('the cover-rights read with no service key (the CI build)', () => {
  it('never makes the admin client and reads nothing', async () => {
    const make = () => {
      throw new Error('supabaseKey is required.')
    }
    const rights = await readCoverRights(make as never, ['a', 'b'])
    expect(rights.size).toBe(0)
  })

  it('with the key, makes the client and reads the rights as before', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test_value_long_enough_for_the_shape'
    const make = () => recordingClient([{ event_id: 'a', rights_state: 'organiser_authorised' }])
    const rights = await readCoverRights(make as never, ['a', 'b'])
    expect(rights.get('a')).toBe('organiser_authorised')
  })

  it('every caller hands over the factory, never a client made before the check', () => {
    for (const file of [
      'src/lib/events/discovery-data.ts',
      'src/lib/events/ledger-data.ts',
      'src/components/features/events/featured-this-week-loader.tsx',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8').replace(/\r\n/g, '\n')
      expect(src, file).toMatch(/readCoverRights\(\s*createAdminClient\s*,/)
      expect(src, file).not.toMatch(/readCoverRights\(\s*createAdminClient\(\)/)
    }
  })
})
