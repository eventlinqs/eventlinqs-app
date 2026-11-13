import { describe, expect, it } from 'vitest'
import { keyShaped, probeKey } from '../../../scripts/lib/supabase-key-shape.mjs'

/*
 * PROOF 1 PROBES WITH A KEY THAT IS A KEY (14 November 2026). env pull wrote an 11 character stand-in for the sensitive
 * service-role key; the proof sent it and every probe answered 401. The values below are made-up shapes, never keys.
 */
const jwt = `eyJ${'a'.repeat(20)}.${'b'.repeat(40)}.${'c'.repeat(30)}`

describe('the key a read-only probe uses', () => {
  it('takes the public anon key first', () => {
    expect(probeKey({ NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt, SUPABASE_SERVICE_ROLE_KEY: jwt.replace('a', 'z') })).toBe(jwt)
  })

  it('never sends a stand-in for a sensitive variable', () => {
    expect(keyShaped('[sensitive]')).toBe(false)
    expect(probeKey({ NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt, SUPABASE_SERVICE_ROLE_KEY: '[sensitive]' })).toBe(jwt)
    expect(probeKey({ SUPABASE_SERVICE_ROLE_KEY: '[sensitive]' })).toBeNull()
  })

  it('reads the new key types as keys', () => {
    expect(keyShaped(`sb_publishable_${'x'.repeat(24)}`)).toBe(true)
    expect(keyShaped(`sb_secret_${'y'.repeat(24)}`)).toBe(true)
  })

  it('uses a real service-role key when there is no anon key (a run on TEST)', () => {
    expect(probeKey({ SUPABASE_SERVICE_ROLE_KEY: jwt })).toBe(jwt)
    expect(probeKey({})).toBeNull()
  })
})
