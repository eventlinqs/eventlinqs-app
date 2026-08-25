/**
 * NO AUTH FORM MAY REACH A FAILED RESPONSE AND RENDER NOTHING.
 *
 * WHY THIS EXISTS, including a correction to the claim that prompted it.
 * A previous pass reported "the login form fails silently" as a blocking
 * finding. That was WRONG, and the way it was wrong is worth keeping: the
 * evidence was a page-text capture truncated at 300 characters, which cut off
 * exactly where the error renders. Captured properly from the wire, a wrong
 * password returns GoTrue `400 {"code":"invalid_credentials"}` and the page
 * renders "That email address and password combination did not match. Check
 * them and try again." The credentials path was never silent.
 *
 * What remains true and worth guarding is the SHAPE: a submit handler that
 * awaits a call, receives a failure, and returns without putting anything on the
 * screen. That is invisible in review because the happy path looks identical,
 * and it is the difference between a form that refuses and a form that appears
 * to be broken.
 *
 * WHAT THIS CANNOT SEE, stated plainly. It reads source, not behaviour. It
 * cannot tell whether the message is TRUE, only that one is set. It cannot catch
 * a handler that sets an error into state the JSX never renders. The live
 * capture in the header above is what covers that, and it has to be redone by
 * hand when these forms change.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')
const FORMS = [
  'src/components/auth/login-form.tsx',
  'src/components/auth/signup-form.tsx',
  'src/components/auth/forgot-password-form.tsx',
  'src/components/auth/reset-password-form.tsx',
]

const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

describe('auth forms never fail silently', () => {
  it('finds every form, so this cannot pass vacuously', () => {
    for (const f of FORMS) {
      expect(existsSync(path.join(ROOT, f)), `${f} is missing; this test is pinned to the wrong paths`).toBe(true)
    }
  })

  it.each(FORMS)('%s puts a message on screen for a failure', (form) => {
    const src = read(form)
    expect(
      /setError\(/.test(src),
      `${form} never calls setError, so a failed response would render nothing`,
    ).toBe(true)
  })

  it.each(FORMS)('%s maps the failure through the shared copy, not a raw provider string', (form) => {
    const src = read(form)
    // Raw provider strings vary by version, leak implementation detail, and in
    // the credential case would let "no such user" and "wrong password" read
    // differently, which is the discrepancy OWASP exists to remove.
    expect(
      /authErrorMessage\(|authMessage\(/.test(src),
      `${form} must map failures through src/lib/auth/auth-errors`,
    ).toBe(true)
    expect(
      /setError\(\s*error\.message\s*\)/.test(src),
      `${form} renders the raw provider message`,
    ).toBe(false)
  })

  it.each(FORMS)('%s renders the error it sets', (form) => {
    const src = read(form)
    // The state must reach the DOM. A form that sets an error into a variable
    // the JSX never reads is exactly as silent as one that sets nothing.
    expect(
      /\{error\s*&&|\{!!error|error\s*\?\s*\(/.test(src),
      `${form} sets an error but never renders it`,
    ).toBe(true)
  })

  it.each(FORMS)('%s has no catch block that swallows the failure', (form) => {
    const src = read(form)
    /*
     * A catch that only logs is the silent shape. Matching is deliberately
     * narrow: a catch whose body contains neither setError nor a rethrow.
     *
     * `failLocally(` earns its place here rather than widening the rule: it is
     * signup-form.tsx's own one-line helper and its whole body is
     * `setError({...}); setLoading(false)`. Before the silent-catch sweep of
     * 25 August 2026 that catch was `catch {`, with no binding, so this pattern
     * did not match it AT ALL and the form passed vacuously. Adding a binding
     * made it visible for the first time, which is the test working, not
     * breaking.
     */
    const catches = [...src.matchAll(/catch\s*\([^)]*\)\s*\{([\s\S]{0,400}?)\n\s{4}\}/g)]
    const swallowed = catches
      .map(m => m[1] ?? '')
      .filter(body => !/setError\(|throw\b|setStatus\(|setMessage\(|failLocally\(/.test(body))
    expect(
      swallowed,
      `${form} has a catch block that neither reports to the user nor rethrows`,
    ).toEqual([])
  })
})
