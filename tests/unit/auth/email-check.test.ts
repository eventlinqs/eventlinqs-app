import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ONE_STEP_SIGNUP_FROM, emailCheckedMetadata, emailIsChecked } from '@/lib/auth/email-check'

/*
 * THE EMAIL CHECK, ONLY WHERE MONEY IS PAID OUT (law 50 (b), Lawal, 21 November 2026, 10:06). Signing up signs the person
 * in at once; the address is proved once, before payouts are set up, and never to browse, save, buy or list.
 */

const before = '2026-10-01T00:00:00.000Z'
const after = '2026-11-22T00:00:00.000Z'
const user = (over: Partial<{ app_metadata: Record<string, unknown>; email_confirmed_at: string | undefined; created_at: string }>) => ({
  app_metadata: { provider: 'email', providers: ['email'] },
  email_confirmed_at: after,
  created_at: after,
  ...over,
})

describe('emailIsChecked', () => {
  it('a press on an emailed link is a check, whatever else the account says', () => {
    expect(emailIsChecked(user({ app_metadata: { provider: 'email', email_check: 'pending', email_checked_at: after } }))).toBe(true)
  })

  it('a one step sign up is pending until that press, even on an old unconfirmed account it took over', () => {
    expect(emailIsChecked(user({ app_metadata: { provider: 'email', email_check: 'pending' } }))).toBe(false)
    expect(emailIsChecked(user({ app_metadata: { provider: 'email', email_check: 'pending' }, created_at: before }))).toBe(false)
  })

  it('an email account confirmed by its own link before one step sign up is checked', () => {
    expect(emailIsChecked(user({ created_at: before, email_confirmed_at: before }))).toBe(true)
  })

  it('an email account made after one step began, with no press and no pending mark, is not checked', () => {
    expect(emailIsChecked(user({}))).toBe(false)
  })

  it('an account never confirmed is not checked', () => {
    expect(emailIsChecked(user({ created_at: before, email_confirmed_at: undefined }))).toBe(false)
  })

  it('a Google account had its address checked by Google', () => {
    expect(emailIsChecked(user({ app_metadata: { provider: 'google', providers: ['google'] } }))).toBe(true)
    expect(emailIsChecked(user({ app_metadata: { provider: 'email', providers: ['email', 'google'] } }))).toBe(true)
  })

  it('the boundary is the start of 21 November 2026', () => {
    expect(ONE_STEP_SIGNUP_FROM).toBe('2026-11-21T00:00:00.000Z')
  })

  it('the press writes the time and marks the check done', () => {
    const at = new Date('2026-11-21T01:02:03.000Z')
    expect(emailCheckedMetadata(at)).toEqual({ email_checked_at: '2026-11-21T01:02:03.000Z', email_check: 'done' })
  })
})

describe('where the check is asked, and where it is recorded', () => {
  const onboard = readFileSync('src/app/api/stripe/connect/onboard/route.ts', 'utf8')
  const confirm = readFileSync('src/app/auth/confirm/route.ts', 'utf8')
  const signup = readFileSync('src/app/api/auth/signup/route.ts', 'utf8')

  it('payout set up asks for it before any Stripe account is made', () => {
    const gate = onboard.indexOf('if (!emailIsChecked(user))')
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(onboard.indexOf('createExpressAccount({'))
    expect(gate).toBeLessThan(onboard.indexOf('createAccountLink('))
    expect(onboard).toContain('dispatchPayoutEmailCheck')
  })

  it('a press on any emailed link records the check', () => {
    expect(confirm).toContain('emailCheckedMetadata()')
    expect(confirm.indexOf('emailCheckedMetadata()')).toBeGreaterThan(confirm.indexOf('verifyOtp'))
  })

  it('the sign up marks the address pending, confirms the account, signs in, and emails no confirm link', () => {
    expect(signup).toContain("app_metadata: { email_check: 'pending' }")
    expect(signup).toContain('email_confirm: true')
    expect(signup).toContain('signInWithPassword')
    expect(signup).not.toContain('sendSignupConfirmation')
  })
})
