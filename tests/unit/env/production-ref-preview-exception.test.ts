import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluateProcessEnv } from '@/lib/env/manifest-checks.mjs'

/*
 * THE ONE NAMED, TIME LIMITED EXCEPTION IN SUPABASE_PRODUCTION_REF_ISOLATION (the CONTROLLER's ruling of 1 November
 * 2026, 11:57, (A)): the preview of feat/w5-design-preview may resolve the production URL (and anon key) so Lawal sees
 * real nights, until 8 November 2026 23:59 Melbourne. Never another branch, never after the date, never a production
 * service role key.
 */
const PROD_URL = 'https://gndnldyfudbytbboxesk.supabase.co'
const jwt = (ref: string, role: string) =>
  ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ ref, role })).toString('base64url'), 'sig'].join('.')
const isolation = (env: Record<string, string>) =>
  (evaluateProcessEnv(env).findings as { name: string }[]).filter((f) => f.name === 'SUPABASE_PRODUCTION_REF_ISOLATION')

afterEach(() => vi.useRealTimers())

describe('the design preview exception', () => {
  const base = { VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL_PREVIEW: PROD_URL, SUPABASE_SERVICE_ROLE_KEY_PREVIEW: jwt('vkapkibzokmfaxqogypq', 'service_role') }

  it('excuses the production URL on the named branch before the expiry', () => {
    vi.useFakeTimers({ now: new Date('2026-11-02T00:00:00Z') })
    expect(isolation({ ...base, VERCEL_GIT_COMMIT_REF: 'feat/w5-design-preview' })).toEqual([])
  })

  it('refuses it on any other branch', () => {
    vi.useFakeTimers({ now: new Date('2026-11-02T00:00:00Z') })
    expect(isolation({ ...base, VERCEL_GIT_COMMIT_REF: 'feat/something-else' })).toHaveLength(1)
  })

  it('refuses it after 8 November 23:59 Melbourne, by itself', () => {
    vi.useFakeTimers({ now: new Date('2026-11-08T13:00:00Z') }) // 9 November 00:00 in Melbourne
    expect(isolation({ ...base, VERCEL_GIT_COMMIT_REF: 'feat/w5-design-preview' })).toHaveLength(1)
  })

  it('never excuses a production service role key, even on the branch', () => {
    vi.useFakeTimers({ now: new Date('2026-11-02T00:00:00Z') })
    expect(
      isolation({ ...base, VERCEL_GIT_COMMIT_REF: 'feat/w5-design-preview', SUPABASE_SERVICE_ROLE_KEY_PREVIEW: jwt('gndnldyfudbytbboxesk', 'service_role') }),
    ).toHaveLength(1)
  })
})

describe('the build check SUPABASE_ENV_ISOLATION honours the same exception', () => {
  it('excuses the URL on the branch before the date, refuses it after and elsewhere', async () => {
    const { CRITICAL_ENV_RULES, evalEnvRule } = await import('@/lib/health/critical-env.mjs')
    const rule = CRITICAL_ENV_RULES.find((r: { name: string }) => r.name === 'SUPABASE_ENV_ISOLATION')
    const env = (branch: string) => ({ VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL_PREVIEW: PROD_URL, VERCEL_GIT_COMMIT_REF: branch })
    const ok = (e: Record<string, string>) => (evalEnvRule(rule, e) as { ok: boolean }).ok
    vi.useFakeTimers({ now: new Date('2026-11-02T00:00:00Z') })
    expect(ok(env('feat/w5-design-preview'))).toBe(true)
    expect(ok(env('feat/other'))).toBe(false)
    vi.setSystemTime(new Date('2026-11-08T13:00:00Z'))
    expect(ok(env('feat/w5-design-preview'))).toBe(false)
  })
})
