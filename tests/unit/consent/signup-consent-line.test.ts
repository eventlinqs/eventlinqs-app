import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIGEST_CONSENT_WORDING, SIGNUP_UPDATES_CONSENT_WORDING, signupConsentLine, signupConsentRecord } from '@/lib/consent/wording'

/*
 * THE CONTROLLER'S 08:50 (4), FROM THE 5 NOVEMBER AUDIT (C:\dev\EVIDENCE\AUDIT-5NOV\flags.txt: broadcast_digest FALSE):
 * /signup offered 'a weekly local digest' that no job sends. The digest line shows only while broadcast_digest is on;
 * otherwise the box reads 'Occasional EventLinqs updates by email', a new versioned wording (consent wording is
 * versioned, never edited), and a tick records exactly what the person was shown.
 */
describe('the signup consent line follows the digest flag (signupConsentLine)', () => {
  it('offers the weekly digest only while it runs', () => {
    expect(signupConsentLine(true)).toEqual({ wording: DIGEST_CONSENT_WORDING, shown: 'digest' })
  })
  it('otherwise offers occasional updates by email, naming who, the channel and how to stop (Spam Act 2003)', () => {
    expect(signupConsentLine(false)).toEqual({ wording: SIGNUP_UPDATES_CONSENT_WORDING, shown: 'updates' })
    expect(SIGNUP_UPDATES_CONSENT_WORDING).toBe('Occasional EventLinqs updates by email. You can unsubscribe at any time.')
    expect(SIGNUP_UPDATES_CONSENT_WORDING).not.toMatch(/digest|weekly/i)
  })
})

describe('a tick records the consent the person was shown (signupConsentRecord)', () => {
  it('records the updates consent for the updates line, never the digest', () => {
    expect(signupConsentRecord(true, 'updates')).toBe('updates')
  })
  it('records the digest for the digest line, and for a form that names none (the form before this change)', () => {
    expect(signupConsentRecord(true, 'digest')).toBe('digest')
    expect(signupConsentRecord(true, undefined)).toBe('digest')
  })
  it('records nothing without a tick, and nothing for a line it does not know', () => {
    expect(signupConsentRecord(false, 'updates')).toBeNull()
    expect(signupConsentRecord(true, 'everything')).toBeNull()
  })
})

describe('the form and the route use the two decisions', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
  it('the form draws its line from the flag and says which line it showed', () => {
    const form = read('src/components/auth/signup-form.tsx')
    expect(form).toMatch(/signupConsentLine\(digestOn\)/)
    expect(form).toMatch(/consentShown/)
    expect(form).not.toMatch(/\{DIGEST_CONSENT_WORDING\}/)
  })
  it('the route records the updates consent for the updates line', () => {
    const route = read('src/app/api/auth/signup/route.ts')
    expect(route).toMatch(/signupConsentRecord\(/)
    expect(route).toMatch(/recordPlatformUpdateConsent\(/)
  })
})
