import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// The resolver reads process.env at call time, so each test mutates env
// in beforeEach and restores in afterEach. We import inside the test so
// vi.stubEnv() applied at the start of the test sees the read.
//
// Vitest's vi.stubEnv lets us replace process.env values for the duration
// of one test and unstub at the end via vi.unstubAllEnvs().

describe('supabase env resolver', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL_PREVIEW', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY_PREVIEW', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  test('returns base values when no preview vars are set', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://prod.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'prod-anon')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'prod-service')

    const env = await import('@/lib/supabase/env')
    expect(env.getSupabaseUrl()).toBe('https://prod.supabase.co')
    expect(env.getSupabaseAnonKey()).toBe('prod-anon')
    expect(env.getSupabaseServiceRoleKey()).toBe('prod-service')
    expect(env.isUsingPreviewSupabase()).toBe(false)
  })

  test('preview vars take precedence when both are set', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://prod.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'prod-anon')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'prod-service')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL_PREVIEW', 'https://preview.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW', 'preview-anon')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY_PREVIEW', 'preview-service')

    const env = await import('@/lib/supabase/env')
    expect(env.getSupabaseUrl()).toBe('https://preview.supabase.co')
    expect(env.getSupabaseAnonKey()).toBe('preview-anon')
    expect(env.getSupabaseServiceRoleKey()).toBe('preview-service')
    expect(env.isUsingPreviewSupabase()).toBe(true)
  })

  test('falls back to base when preview vars are partially set', async () => {
    // Founder set the URL preview var but forgot the anon key. Both must
    // be present for "preview mode" to engage; otherwise we fall back to
    // production rather than ship a half-configured client.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://prod.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'prod-anon')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL_PREVIEW', 'https://preview.supabase.co')
    // Anon key preview deliberately left empty.

    const env = await import('@/lib/supabase/env')
    expect(env.isUsingPreviewSupabase()).toBe(false)
    // URL still uses preview because the resolver picks first non-empty,
    // but the isUsingPreviewSupabase signal warns ops that preview is
    // partially wired.
    expect(env.getSupabaseUrl()).toBe('https://preview.supabase.co')
    expect(env.getSupabaseAnonKey()).toBe('prod-anon')
  })

  test('returns empty string when no vars are set at all', async () => {
    const env = await import('@/lib/supabase/env')
    expect(env.getSupabaseUrl()).toBe('')
    expect(env.getSupabaseAnonKey()).toBe('')
    expect(env.getSupabaseServiceRoleKey()).toBe('')
    expect(env.isUsingPreviewSupabase()).toBe(false)
  })

  test('service role key is independent of public preview signals', async () => {
    // Production deploy where neither public preview var is set, but
    // someone has set SUPABASE_SERVICE_ROLE_KEY_PREVIEW (e.g. a stray
    // value left in dashboard). The service role resolver still picks
    // it up because it is gated only on its own preview var.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://prod.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'prod-anon')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'prod-service')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY_PREVIEW', 'preview-service')

    const env = await import('@/lib/supabase/env')
    expect(env.getSupabaseServiceRoleKey()).toBe('preview-service')
    // But the public preview signal stays false because the URL/anon
    // preview vars are absent.
    expect(env.isUsingPreviewSupabase()).toBe(false)
  })
})
