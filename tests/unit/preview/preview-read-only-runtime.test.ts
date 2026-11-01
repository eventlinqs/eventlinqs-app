import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

/*
 * THE READ-ONLY PREVIEW NEVER USES A SERVICE KEY AT RUNTIME EITHER (2 November 2026, 06:55, WINDOW 6's signed-out sweep
 * of the preview: every organiser profile answered 500 there and 200 on production). The preview reads production by its
 * URL and anon key (PREVIEW_READ_ONLY=1); the preview scope still carries TEST's service key, so every admin-client read
 * sent TEST's key to production and was refused. Under PREVIEW_READ_ONLY=1 the admin client is made with the anon key, so
 * a read is decided by production's own row policies, never by a key of another project; and the organiser profile's
 * status gate reads by slug as anon, where the policy 'Active organisations are publicly browsable' (status = 'active')
 * is the gate itself.
 */
const made: { url: string; key: string }[] = []
vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string) => {
    made.push({ url, key })
    return {}
  },
}))

const KEYS = {
  NEXT_PUBLIC_SUPABASE_URL_PREVIEW: 'https://production.example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW: 'anon-key-of-production',
  SUPABASE_SERVICE_ROLE_KEY_PREVIEW: 'service-key-of-test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key-of-test',
}

afterEach(() => {
  vi.unstubAllEnvs()
  made.length = 0
})

describe('the admin client on the read-only preview', () => {
  it('under PREVIEW_READ_ONLY=1 it is made with the anon key, never a service key', async () => {
    for (const [k, v] of Object.entries(KEYS)) vi.stubEnv(k, v)
    vi.stubEnv('PREVIEW_READ_ONLY', '1')
    const { createAdminClient } = await import('@/lib/supabase/admin')
    createAdminClient()
    expect(made.at(-1)).toEqual({ url: KEYS.NEXT_PUBLIC_SUPABASE_URL_PREVIEW, key: KEYS.NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW })
  })

  it('anywhere else it keeps the service key', async () => {
    for (const [k, v] of Object.entries(KEYS)) vi.stubEnv(k, v)
    vi.stubEnv('PREVIEW_READ_ONLY', '')
    const { createAdminClient } = await import('@/lib/supabase/admin')
    createAdminClient()
    expect(made.at(-1)?.key).toBe('service-key-of-test')
  })

  it('the organiser profile gates by slug as anon on the read-only preview, the active policy deciding', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', 'src', 'app', 'organisers', '[handle]', 'page.tsx'), 'utf8').replace(/\r\n/g, '\n')
    expect(src).toContain('previewReadOnlyOn()')
    expect(src).toMatch(/previewReadOnlyOn\(\)[\s\S]{0,900}createPublicClient\(\)[\s\S]{0,200}\.select\('id'\)[\s\S]{0,80}\.eq\('slug', slug\)/)
  })
})
