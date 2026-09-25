import { describe, expect, test } from 'vitest'
import { tableReadCredential } from '../../../scripts/guards/lib/table-read-credential.mjs'

/**
 * PULL REQUEST 159. The CI build carries the TEST URL and the ANON key only, and
 * anon is not granted public.organisations, so a guard that fell back to anon
 * reported HTTP 401 42501 as a FAIL on every CI run. This module hands out the
 * service-role key or says why there is none, and never falls back.
 */
describe('tableReadCredential', () => {
  test('hands back the service-role key when the host carries it', () => {
    expect(tableReadCredential({ SUPABASE_SERVICE_ROLE_KEY: ' svc ' })).toEqual({
      key: 'svc',
      source: 'SUPABASE_SERVICE_ROLE_KEY',
    })
  })

  test('never falls back to the anon key, which is exactly the key that was refused', () => {
    const got = tableReadCredential({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' })
    expect(got.key).toBeNull()
    expect('reason' in got && got.reason).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  test('an empty value is no credential', () => {
    expect(tableReadCredential({ SUPABASE_SERVICE_ROLE_KEY: '   ' }).key).toBeNull()
  })
})
