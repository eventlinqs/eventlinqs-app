import { describe, expect, it } from 'vitest'
import { describeScanResult, describeHowLongAgo } from '@/lib/scanner/result'

/**
 * "ALREADY USED" MUST SAY WHEN.
 *
 * Founder ruling 29 August 2026, after journey 6 found the door refusing a second
 * scan correctly and saying only "Already used". At a door that starts an argument
 * nobody present can settle: the person holding the phone cannot tell a
 * double-scan of their own from a ticket that came through two hours ago on
 * somebody else's phone, and there is a queue behind them.
 *
 * first_scanned_at was already returned by the scan_ticket RPC and by the server
 * action. It was simply never shown.
 *
 * RELATIVE, NOT A CLOCK TIME, deliberately. "Two minutes ago" answers the question
 * actually being asked. A timestamp makes someone do arithmetic while a queue
 * builds, and gets it wrong in a different timezone.
 */

const NOW = new Date('2026-08-29T20:00:00Z').getTime()
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('how long ago, in door words', () => {
  it('reads as just now inside the first minute', () => {
    expect(describeHowLongAgo(ago(5_000), NOW)).toBe('just now')
    expect(describeHowLongAgo(ago(59_000), NOW)).toBe('just now')
  })

  it('counts minutes, then hours, then days', () => {
    expect(describeHowLongAgo(ago(2 * 60_000), NOW)).toBe('2 minutes ago')
    expect(describeHowLongAgo(ago(60 * 60_000), NOW)).toBe('1 hour ago')
    expect(describeHowLongAgo(ago(3 * 60 * 60_000), NOW)).toBe('3 hours ago')
    expect(describeHowLongAgo(ago(2 * 24 * 60 * 60_000), NOW)).toBe('2 days ago')
  })

  it('says one minute, not 1 minutes', () => {
    expect(describeHowLongAgo(ago(61_000), NOW)).toBe('1 minute ago')
  })

  it('returns nothing it cannot stand behind', () => {
    expect(describeHowLongAgo(null, NOW)).toBeNull()
    expect(describeHowLongAgo(undefined, NOW)).toBeNull()
    expect(describeHowLongAgo('not-a-date', NOW)).toBeNull()
    // A clock skew that puts the first scan in the future is not something to
    // report as "in 3 minutes" on a door screen.
    expect(describeHowLongAgo(new Date(NOW + 180_000).toISOString(), NOW)).toBeNull()
  })
})

/*
 * describeScanResult reads the REAL clock, so these use a real relative time.
 * The fixed NOW above belongs to describeHowLongAgo, which takes one; using it
 * here put the first scan in the future and the helper correctly returned null.
 */
const realAgo = (ms: number) => new Date(Date.now() - ms).toISOString()

describe('the door verdict', () => {
  it('carries the time on a second scan', () => {
    const v = describeScanResult('already_scanned', realAgo(12 * 60_000))
    expect(v.decision).toBe('reject')
    expect(v.label).toBe('REJECT')
    expect(v.reason).toMatch(/^Already used/)
    expect(v.reason, 'the door still cannot tell a double-scan from a stolen ticket').toMatch(/ago|just now/)
  })

  it('still refuses cleanly when the time is missing', () => {
    // Never withhold the refusal because the timestamp is absent. Admitting on
    // surprise is the one thing a door must never do.
    const v = describeScanResult('already_scanned', null)
    expect(v.decision).toBe('reject')
    expect(v.reason).toBe('Already used')
  })

  it('does not decorate other refusals with a time', () => {
    expect(describeScanResult('refunded', realAgo(60_000)).reason).toBe('Refunded')
    expect(describeScanResult('wrong_event', realAgo(60_000)).reason).toBe('Wrong event')
  })

  it('an admit is still an admit', () => {
    const v = describeScanResult('admitted', null)
    expect(v.decision).toBe('admit')
    expect(v.label).toBe('ADMIT')
  })

  it('an unknown code still fails closed', () => {
    const v = describeScanResult('something-new-from-the-rpc', realAgo(60_000))
    expect(v.decision, 'an unrecognised result admitted somebody').toBe('reject')
  })
})
