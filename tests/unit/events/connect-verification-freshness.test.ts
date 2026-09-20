/**
 * HOW OLD A CACHED STRIPE VERIFICATION MAY BE (MONEY FIX A3 LAYER TWO).
 *
 * The case that matters is the absent one. A missing stamp must read as "never
 * verified", never as "verified just now": the whole defect this closes is a
 * cached yes nobody can date being treated as a fresh one.
 */
import { describe, expect, it } from 'vitest'
import {
  CONNECT_VERIFICATION_MAX_AGE_MS,
  connectVerificationIsFresh,
} from '@/lib/events/connect-verification-freshness'

const NOW = new Date('2026-09-20T12:00:00.000Z')
const agoMs = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

describe('connectVerificationIsFresh', () => {
  it('a verification taken a minute ago is fresh', () => {
    expect(connectVerificationIsFresh(agoMs(60_000), NOW)).toBe(true)
  })

  it('a verification exactly at the window is still fresh', () => {
    expect(connectVerificationIsFresh(agoMs(CONNECT_VERIFICATION_MAX_AGE_MS), NOW)).toBe(true)
  })

  it('a verification one millisecond past the window is not', () => {
    expect(connectVerificationIsFresh(agoMs(CONNECT_VERIFICATION_MAX_AGE_MS + 1), NOW)).toBe(false)
  })

  it('never verified is NOT fresh, in every shape absence takes', () => {
    expect(connectVerificationIsFresh(null, NOW)).toBe(false)
    expect(connectVerificationIsFresh(undefined, NOW)).toBe(false)
    expect(connectVerificationIsFresh('', NOW)).toBe(false)
    expect(connectVerificationIsFresh('not a date', NOW)).toBe(false)
  })

  it('a stamp from the future is refused rather than trusted', () => {
    // A clock ahead of ours is not evidence about Stripe, and treating it as
    // fresh would make a wrong clock a way to skip the check.
    const future = new Date(NOW.getTime() + 60_000).toISOString()
    expect(connectVerificationIsFresh(future, NOW)).toBe(false)
  })

  it('accepts a Date as readily as an ISO string, because callers hold both', () => {
    expect(connectVerificationIsFresh(new Date(NOW.getTime() - 60_000), NOW)).toBe(true)
  })

  it('honours a caller supplied window, so the rule can be tightened in one place', () => {
    expect(connectVerificationIsFresh(agoMs(5_000), NOW, 1_000)).toBe(false)
    expect(connectVerificationIsFresh(agoMs(500), NOW, 1_000)).toBe(true)
  })

  it('the window is a day', () => {
    expect(CONNECT_VERIFICATION_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000)
  })
})
