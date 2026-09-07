import { describe, expect, test } from 'vitest'
import { ENV_MANIFEST, policyFor, storePolicyFor } from '@/lib/env/manifest.mjs'

/**
 * THE SERVER KEY'S SCOPES (close-out C9, 7 September 2026): GOOGLE_MAPS_API_KEY
 * is REQUIRED on production, and FORBIDDEN on the Development store. The second
 * half is ruling R3 (docs/ENV-DOCTRINE.md 3.2): a billable key with no test
 * mode may never sit readable on a scope Vercel cannot mark sensitive, so the
 * store policy forbids it there while a local checkout may still hold it in a
 * gitignored file (doctrine 3.3), which is why the PROCESS policy on
 * development stays optional. These pins hold both halves apart on purpose.
 */
const entry = ENV_MANIFEST.find((e: { name: string }) => e.name === 'GOOGLE_MAPS_API_KEY')

describe('GOOGLE_MAPS_API_KEY scopes', () => {
  test('is declared, sensitive, and required on production and preview', () => {
    expect(entry).toBeDefined()
    expect(entry!.mustBeSensitive).toBe(true)
    expect(policyFor(entry, 'production')).toBe('required')
    expect(policyFor(entry, 'preview')).toBe('required')
  })

  test('is FORBIDDEN on the Development store, where it could only sit in plain text', () => {
    expect(storePolicyFor(entry, 'development')).toBe('forbidden')
  })

  test('a local checkout may still hold it in a gitignored file: the process policy on development is optional, never required', () => {
    expect(policyFor(entry, 'development')).toBe('optional')
  })
})
