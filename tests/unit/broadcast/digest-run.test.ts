import { describe, it, expect } from 'vitest'
import { planDigestRun, DIGEST_MAX_RECIPIENTS_PER_RUN } from '@/lib/broadcast/digest-run'

/**
 * THE WINDOW A SINGLE DIGEST INVOCATION MAY WRITE TO.
 *
 * The defect this pins: the cron sent `recipients.slice(0, 500)` and then wrote
 * the period's idempotence row, so the 501st lawful recipient never received
 * that week's email and nothing anywhere recorded that they had been dropped.
 * The cron fires once a week, so "next time" was never.
 */

const audienceOf = (n: number) => Array.from({ length: n }, (_, i) => `person-${i}@example.test`)

describe('planDigestRun', () => {
  it('sends the whole audience and completes when it fits under the cap', () => {
    const plan = planDigestRun({ audience: audienceOf(12), alreadySent: 0, cap: 500 })
    expect(plan.toSend).toHaveLength(12)
    expect(plan.remaining).toBe(0)
    expect(plan.complete).toBe(true)
    expect(plan.audience).toBe(12)
  })

  it('an empty audience is complete, not a run that owes somebody an email', () => {
    const plan = planDigestRun({ audience: [], alreadySent: 0, cap: 500 })
    expect(plan.toSend).toEqual([])
    expect(plan.complete).toBe(true)
    expect(plan.remaining).toBe(0)
  })

  it('THE DEFECT: a 900 person city does not lose 400 people to the cap', () => {
    const audience = audienceOf(900)

    const first = planDigestRun({ audience, alreadySent: 0, cap: 500 })
    expect(first.toSend).toHaveLength(500)
    expect(first.toSend[0]).toBe('person-0@example.test')
    expect(first.remaining).toBe(400)
    expect(first.complete).toBe(false)

    // The next invocation resumes rather than skipping the period.
    const second = planDigestRun({ audience, alreadySent: 500, cap: 500 })
    expect(second.toSend).toHaveLength(400)
    expect(second.toSend[0]).toBe('person-500@example.test')
    expect(second.remaining).toBe(0)
    expect(second.complete).toBe(true)
  })

  it('writes to nobody twice across the whole of a three invocation run', () => {
    const audience = audienceOf(1100)
    const written: string[] = []
    let sent = 0
    let runs = 0
    for (;;) {
      const plan = planDigestRun({ audience, alreadySent: sent, cap: 500 })
      written.push(...plan.toSend)
      sent += plan.toSend.length
      runs += 1
      if (plan.complete) break
      if (runs > 10) throw new Error('planDigestRun did not converge')
    }
    expect(runs).toBe(3)
    expect(written).toHaveLength(1100)
    expect(new Set(written).size).toBe(1100)
    expect(written).toEqual(audience)
  })

  it('an audience that SHRANK below the resume point is finished, never re-sent from the top', () => {
    // People unsubscribed between two invocations, so the list is shorter than
    // the number already written to. Resuming from the top would mail all of
    // them a second time.
    const plan = planDigestRun({ audience: audienceOf(300), alreadySent: 500, cap: 500 })
    expect(plan.toSend).toEqual([])
    expect(plan.complete).toBe(true)
    expect(plan.remaining).toBe(0)
    expect(plan.alreadySent).toBe(300)
  })

  it('a negative or fractional resume point is refused rather than quietly floored', () => {
    expect(() => planDigestRun({ audience: audienceOf(5), alreadySent: -1, cap: 500 })).toThrow(
      /alreadySent/,
    )
    expect(() => planDigestRun({ audience: audienceOf(5), alreadySent: 1.5, cap: 500 })).toThrow(
      /alreadySent/,
    )
  })

  it('a cap of zero is refused, because a run that writes to nobody never completes', () => {
    expect(() => planDigestRun({ audience: audienceOf(5), alreadySent: 0, cap: 0 })).toThrow(/cap/)
    expect(() => planDigestRun({ audience: audienceOf(5), alreadySent: 0, cap: -3 })).toThrow(/cap/)
  })

  it('the shipped cap is a positive integer, so the shipped configuration converges', () => {
    expect(Number.isInteger(DIGEST_MAX_RECIPIENTS_PER_RUN)).toBe(true)
    expect(DIGEST_MAX_RECIPIENTS_PER_RUN).toBeGreaterThan(0)
  })
})
