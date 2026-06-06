import { afterEach, describe, expect, test, vi } from 'vitest'
import { shouldInitSentry, sentryEnvironment } from '@/lib/observability/sentry-env'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('shouldInitSentry (development kill-switch)', () => {
  test('blocks init when NODE_ENV is development (local next dev)', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(shouldInitSentry()).toBe(false)
  })

  test('blocks init when NODE_ENV is test', () => {
    vi.stubEnv('NODE_ENV', 'test')
    expect(shouldInitSentry()).toBe(false)
  })

  test('allows init only on a production build', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(shouldInitSentry()).toBe(true)
  })
})

describe('sentryEnvironment (environment pin)', () => {
  test('client reads NEXT_PUBLIC_VERCEL_ENV: production deploy reports "production"', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    expect(sentryEnvironment(true)).toBe('production')
  })

  test('client preview deploy reports "preview"', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview')
    expect(sentryEnvironment(true)).toBe('preview')
  })

  test('server reads VERCEL_ENV first: production deploy reports "production"', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '')
    expect(sentryEnvironment(false)).toBe('production')
  })

  test('server preview deploy reports "preview"', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(sentryEnvironment(false)).toBe('preview')
  })

  test('server falls back to NEXT_PUBLIC_VERCEL_ENV when VERCEL_ENV is unset', () => {
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview')
    expect(sentryEnvironment(false)).toBe('preview')
  })

  test('local production build with no Vercel env reports "production", never "development" or "vercel-production"', () => {
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '')
    expect(sentryEnvironment(false)).toBe('production')
    expect(sentryEnvironment(true)).toBe('production')
  })

  test('Vercel "development" env (vercel dev) never yields a development Sentry environment', () => {
    vi.stubEnv('VERCEL_ENV', 'development')
    expect(sentryEnvironment(false)).toBe('production')
  })
})
