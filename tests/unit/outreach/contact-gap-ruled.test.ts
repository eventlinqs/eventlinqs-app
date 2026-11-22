import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONTACT_GAP_DAYS, CONTACT_GAP_DAYS_RAISED, CONTACT_GAP_SOURCE, gapDaysFrom } from '@/lib/outreach/contact-policy'

/*
 * THE GAP, RULED AND SOURCED (the PM's 03:47 of 23 November 2026): 30 days, the low end of the cited range (Unify and
 * Outreach, cited in the policy beside the value), and the reversal: any organiser reply or opt out since the ruling that
 * names frequency moves it to 45. Red before this commit: the value was UNSOURCED and no reversal existed.
 */

describe('the contact gap', () => {
  it('is 30 days, its source cited beside it', () => {
    expect(CONTACT_GAP_DAYS).toBe(30)
    expect(CONTACT_GAP_SOURCE).toMatch(/support\.unifygtm\.com\/articles\/9341974144/)
    expect(CONTACT_GAP_SOURCE).toMatch(/support\.outreach\.io\/hc\/en-us\/articles\/217723638/)
    expect(CONTACT_GAP_SOURCE).not.toMatch(/UNSOURCED/)
    const src = readFileSync('src/lib/outreach/contact-policy.ts', 'utf8')
    expect(src).toContain('enabling re-enrollment into different sequences after 30-60 days (to avoid over-contacting prospects)')
  })

  it('moves to 45 once a reply or opt out names frequency, and only then', () => {
    expect(CONTACT_GAP_DAYS_RAISED).toBe(45)
    expect(gapDaysFrom(['Thanks, not for us this time.', null, 'Moved to another venue'])).toBe(30)
    expect(gapDaysFrom(['Please stop emailing me, you send too many emails'])).toBe(45)
    expect(gapDaysFrom([null, 'Way too often.'])).toBe(45)
    expect(gapDaysFrom([])).toBe(30)
  })
})
