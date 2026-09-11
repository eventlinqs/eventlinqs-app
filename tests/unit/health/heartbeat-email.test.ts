import { describe, it, expect } from 'vitest'
import { heartbeatEmail } from '@/lib/health/runner'
import { overallStatus, type HealthResult } from '@/lib/health/result'

/**
 * THE DAILY EMAIL THE OWNER ACTUALLY READS. Close-out S1.
 *
 * S1's whole premise is that a monitor which is wrong about nearly every
 * organiser "trains the owner to ignore the daily email, which destroys the
 * value of every other line in it". So the email itself is worth asserting:
 * that the replaced check reaches it, that the deleted one does not, and that a
 * long line - which the new check produces on purpose, naming organisers and
 * Stripe requirements rather than counting them - cannot push the right-hand
 * edge of the email off a phone.
 *
 * The builder is imported, not copied. A test against a copy of an email is not
 * a test about the email.
 */

const IDENTITY = { deployment: 'https://example.test', environment: 'proof', when: '2026-09-11T00:00:00.000Z' }

function result(over: Partial<HealthResult> = {}): HealthResult {
  return { id: 'connect_health', label: 'Organisers can take money', severity: 'warning', ok: true, detail: 'all good', ...over }
}

describe('heartbeatEmail', () => {
  it('names the check a person can act on', () => {
    const email = heartbeatEmail([result()], IDENTITY)
    expect(email.html).toContain('Organisers can take money')
    expect(email.text).toContain('Organisers can take money')
  })

  it('carries the detail, because a count is not something an owner can act on', () => {
    const detail = '"Basement 45" (acct_1ABC) is past due on 2: external_account, tos_acceptance.date'
    const email = heartbeatEmail([result({ ok: false, severity: 'critical', detail })], IDENTITY)
    expect(email.html).toContain('external_account')
    expect(email.text).toContain('tos_acceptance.date')
  })

  it('headlines the worst thing that is true', () => {
    expect(heartbeatEmail([result()], IDENTITY).subject).toContain('All systems green')
    expect(heartbeatEmail([result({ ok: false })], IDENTITY).subject).toContain('Green with warnings')
    expect(heartbeatEmail([result({ ok: false, severity: 'critical' })], IDENTITY).subject).toContain('CRITICAL')
  })

  it('constrains its own width, so one long requirement list cannot widen the email past a phone', () => {
    const email = heartbeatEmail([result()], IDENTITY)
    expect(email.html).toContain('table-layout:fixed')
    expect(email.html).toContain('width:100%')
    expect(email.html).toContain('overflow-wrap:break-word')
  })

  it('still tells the reader that a missing heartbeat is itself the signal', () => {
    const email = heartbeatEmail([result()], IDENTITY)
    expect(email.text).toContain('MISSING heartbeat')
    expect(email.html).toContain('missing heartbeat')
  })
})

/**
 * The roll-up moved out of checks.ts into result.ts so a plain Node process
 * could import the email builder without pulling `server-only` through the AI
 * check. These assert the move changed no behaviour.
 */
describe('overallStatus after the split', () => {
  it('one critical outranks any number of warnings', () => {
    expect(overallStatus([result({ ok: false }), result({ ok: false, severity: 'critical' })])).toBe('critical')
  })
  it('one warning outranks every green', () => {
    expect(overallStatus([result(), result({ ok: false })])).toBe('warning')
  })
  it('green only when nothing is failing', () => {
    expect(overallStatus([result(), result()])).toBe('green')
  })
  it('an empty set is green rather than an error', () => {
    expect(overallStatus([])).toBe('green')
  })
})
