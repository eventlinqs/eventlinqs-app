import { describe, expect, it } from 'vitest'
import { missingGuardDatabase } from '../../../scripts/lib/guard-database-env.mjs'

/*
 * THE GUARDS NEED A DATABASE TO LOOK AT (the guard audit of 14 November 2026, C:\dev\START-16OCT\GUARD-AUDIT-14NOV.md).
 * Eighteen of the week's 79 guard stops were six database guards failing 'could not look' on runs with no database
 * environment. The gate now says that once, before any guard runs.
 */
describe('the guard step asks for a database before it runs', () => {
  it('runs when the URL and a key are there (service role or anon)', () => {
    expect(missingGuardDatabase({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' })).toBeNull()
    expect(missingGuardDatabase({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k' })).toBeNull()
  })

  it('stops at once, naming what is missing, when the run has no database environment', () => {
    expect(missingGuardDatabase({})).toMatch(/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY not set/)
    expect(missingGuardDatabase({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toMatch(/^the guards would run with no database \(SUPABASE_SERVICE_ROLE_KEY/)
    expect(missingGuardDatabase({ SUPABASE_SERVICE_ROLE_KEY: 'k' })).toMatch(/\(NEXT_PUBLIC_SUPABASE_URL not set/)
  })

  it('reads a blank value as missing', () => {
    expect(missingGuardDatabase({ NEXT_PUBLIC_SUPABASE_URL: '  ', SUPABASE_SERVICE_ROLE_KEY: 'k' })).not.toBeNull()
  })
})
