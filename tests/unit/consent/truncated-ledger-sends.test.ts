import { describe, expect, it } from 'vitest'
import { decideSend, type LedgerConsentEvent, type LedgerSuppressionEvent } from '@/lib/consent/decide'
import { PLATFORM_TENANT_SLUG, LOCAL_DIGEST_PURPOSE } from '@/lib/consent/purposes'

/**
 * WHAT A TRUNCATED LEDGER READ ACTUALLY DOES, WRITTEN DOWN AS A TEST.
 *
 * `decideSend` is pure and correct: given the rows, it answers properly. The
 * defect closed on 19 September 2026 was never in this function. It was that
 * the reader handed it FEWER ROWS THAN THE LEDGER HELD, silently, because a
 * Supabase response stops at 1,000 rows with HTTP 200 and no error.
 *
 * These tests exist so the consequence is executable rather than argued. They
 * feed the same person's history twice, once whole and once with the newest row
 * missing, and assert that the second one SENDS. Nothing here can go red from
 * the pager being fixed; it goes red only if somebody decides the rule "the
 * latest event wins" can be relaxed, and it documents the stakes of that.
 */

const now = new Date('2026-09-19T00:00:00.000Z')

const question = {
  tenantSlug: PLATFORM_TENANT_SLUG,
  purpose: LOCAL_DIGEST_PURPOSE,
  channel: 'email' as const,
  now,
  maxAgeMonths: 24,
}

function grant(id: string, occurredAt: string): LedgerConsentEvent {
  return {
    id,
    tenantSlug: PLATFORM_TENANT_SLUG,
    purpose: LOCAL_DIGEST_PURPOSE,
    channelScope: 'both',
    decision: 'granted',
    occurredAt,
    wordingVersion: 'v1',
  }
}

function withdrawal(id: string, occurredAt: string): LedgerConsentEvent {
  return { ...grant(id, occurredAt), decision: 'withdrawn' }
}

function suppression(id: string, occurredAt: string): LedgerSuppressionEvent {
  return {
    id,
    tenantSlug: PLATFORM_TENANT_SLUG,
    channel: 'both',
    scope: 'all_marketing',
    occurredAt,
  }
}

describe('a truncated consent read decides the opposite way', () => {
  it('refuses when the whole history is read', () => {
    const whole = [grant('e1', '2026-01-04T00:00:00.000Z'), withdrawal('e2', '2026-06-01T00:00:00.000Z')]
    const verdict = decideSend(question, whole, [])
    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toMatch(/latest consent event is withdrawn/)
    expect(verdict.decidingEventId).toBe('e2')
  })

  /*
   * THE ONE THAT MATTERS. The row the ceiling removed is the newest, because
   * the read that caused this was ordered oldest first. What is left is a
   * grant, and a grant sends.
   */
  it('PERMITS the same person once the newest row is missing', () => {
    const truncated = [grant('e1', '2026-01-04T00:00:00.000Z')]
    const verdict = decideSend(question, truncated, [])
    expect(verdict.permitted).toBe(true)
    expect(verdict.decidingEventId).toBe('e1')
  })

  it('PERMITS a person whose unsubscribe was the row that fell off', () => {
    const grants = [grant('e1', '2026-01-04T00:00:00.000Z')]
    const withSuppression = decideSend(question, grants, [suppression('s1', '2026-06-01T00:00:00.000Z')])
    expect(withSuppression.permitted).toBe(false)
    expect(withSuppression.reason).toMatch(/all_marketing suppression/)

    const withoutSuppression = decideSend(question, grants, [])
    expect(withoutSuppression.permitted).toBe(true)
  })

  /*
   * THE DIRECTION THAT IS SAFE, asserted so the asymmetry is on the record.
   * `resolveSend` reads the newest 200 events rather than paging, and that is
   * deliberate: losing OLD rows can only ever remove the grant, never the
   * refusal on top of it, so the worst case is a message withheld.
   */
  it('refuses, never sends, when it is the OLDEST rows that are missing', () => {
    const newestOnly = [withdrawal('e2', '2026-06-01T00:00:00.000Z')]
    expect(decideSend(question, newestOnly, []).permitted).toBe(false)

    const nothingLeft = decideSend(question, [], [])
    expect(nothingLeft.permitted).toBe(false)
    expect(nothingLeft.reason).toMatch(/no consent event is recorded/)
  })
})
