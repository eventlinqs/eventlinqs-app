import { describe, expect, it } from 'vitest'
import { resolveSend, filterPermittedRecipients } from '@/lib/consent/resolver'
import {
  CONSENT_MAX_AGE_MONTHS_FALLBACK,
  FACILITATED_MARKETING_PURPOSE,
  PLATFORM_TENANT_SLUG,
} from '@/lib/consent/purposes'
import { fakeConsentAdmin, PLATFORM_TENANT_ROW } from '../../helpers/consent-ledger-fake'

/**
 * A BLINK IN THE ONE DOOR MAY NOT SEND A MESSAGE, AND MAY NOT INVENT A REASON.
 *
 * `src/lib/consent/resolver.ts` calls itself THE ONE DOOR every message this
 * platform sends to a person goes through, and its catch block says in its own
 * words that a ledger it cannot read REFUSES the send. Until 21 September 2026
 * that was true only of a read that THROWS, and none of its three reads did:
 * supabase-js resolves a PostgREST failure as `{ data: null, error }`, and each
 * of the three was written `result.data ?? []`.
 *
 * THE THREE CONSEQUENCES, in descending order of how much they cost:
 *
 *   the SUPPRESSION read failing   PERMITTED somebody who had unsubscribed,
 *                                  and recorded their grant as the reason
 *   the POLICY read failing        silently restored a tightened ageing window
 *                                  to the twenty four month fallback
 *   the CONSENT read failing       refused with "no consent event is recorded
 *                                  for this tenant, purpose and subject",
 *                                  which is stored in marketing_send_skip and
 *                                  read back by an organiser as evidence that
 *                                  a person never agreed to anything
 *
 * EVERY CASE HERE WAS DRIVEN RED against the resolver as it stood before the
 * fix, and each of the first two came back `permitted: true`.
 *
 * `decideSend` is pure and was never wrong. These tests are about the half that
 * READS, which is why they go through `resolveSend` rather than the decision
 * function: no argument to a pure function could have shown any of this.
 */

const NOW = new Date('2026-09-21T00:00:00.000Z')
const SUBJECT = 'person@example.com'

/** A transient fault: `withBuildRetry` retries these before giving up. */
const TIMEOUT = { message: 'canceling statement due to statement timeout', code: '57014' }
/** A permanent fault: returned on the first pass, untouched. */
const REFUSED = { message: 'permission denied for table', code: '42501' }

const GRANT = {
  id: 'event-grant',
  tenant_id: PLATFORM_TENANT_ROW.id,
  subject_email: SUBJECT,
  purpose: FACILITATED_MARKETING_PURPOSE,
  channel_scope: 'both',
  decision: 'granted',
  occurred_at: '2026-01-10T00:00:00.000Z',
  wording_version: 'v1',
}

const UNSUBSCRIBE = {
  id: 'suppression-1',
  tenant_id: PLATFORM_TENANT_ROW.id,
  subject_email: SUBJECT,
  channel: 'both',
  scope: 'all_marketing',
  occurred_at: '2026-02-01T00:00:00.000Z',
}

function ledger(overrides: { policyMonths?: number; withoutPolicyRow?: boolean } = {}) {
  return {
    marketing_tenants: [PLATFORM_TENANT_ROW],
    consent_policy: overrides.withoutPolicyRow
      ? []
      : [{ id: true, max_age_months: overrides.policyMonths ?? 24 }],
    consent_events: [GRANT],
    suppression_events: [UNSUBSCRIBE],
  }
}

const ask = {
  email: SUBJECT,
  purpose: FACILITATED_MARKETING_PURPOSE,
  channel: 'email' as const,
  tenantSlug: PLATFORM_TENANT_SLUG,
  now: NOW,
}

const UNREADABLE = /the consent ledger could not be read/

describe('the one door, when a read blinks', () => {
  it('refuses an unsubscribed person when every read works, which is the baseline the rest is measured against', async () => {
    const admin = fakeConsentAdmin(ledger())
    const verdict = await resolveSend(admin.client, ask)
    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toMatch(/an unsubscribe from all EventLinqs marketing, recorded on/)
    expect(verdict.reason).not.toMatch(/all_marketing/)
    expect(verdict.decidingEventId).toBe('event-grant')
  })

  /*
   * THE ONE THAT MATTERS. Before the fix this returned
   * `{ permitted: true, reason: 'granted on 10 Jan 2026 under wording v1' }`.
   */
  it('REFUSES when the suppression read fails, rather than sending to somebody who unsubscribed', async () => {
    const admin = fakeConsentAdmin(ledger(), { failing: { suppression_events: REFUSED } })
    const verdict = await resolveSend(admin.client, ask)
    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toMatch(UNREADABLE)
  })

  it('names the read failure rather than the person when the consent read fails', async () => {
    const admin = fakeConsentAdmin(ledger(), { failing: { consent_events: REFUSED } })
    const verdict = await resolveSend(admin.client, ask)
    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toMatch(UNREADABLE)
    /*
     * The sentence this replaces is the reason this assertion is written the
     * long way round: it is stored as the detail of a marketing_send_skip row,
     * and an organiser who reads "no consent event is recorded" goes and asks
     * for a consent the person has already given.
     */
    expect(verdict.reason).not.toMatch(/no consent event is recorded/)
  })

  it('refuses rather than widening the window when the policy read fails', async () => {
    const tight = { policyMonths: 2 }
    const working = await resolveSend(
      fakeConsentAdmin({ ...ledger(tight), suppression_events: [] }).client,
      ask,
    )
    expect(working.permitted).toBe(false)
    expect(working.reason).toMatch(/older than the 2 month threshold/)

    const blinked = await resolveSend(
      fakeConsentAdmin(
        { ...ledger(tight), suppression_events: [] },
        { failing: { consent_policy: REFUSED } },
      ).client,
      ask,
    )
    expect(blinked.permitted).toBe(false)
    expect(blinked.reason).toMatch(UNREADABLE)
  })

  /*
   * THE OTHER HALF OF THE POLICY RULE, AND IT IS NOT THE SAME CASE. A missing
   * configuration row is a fact, not a fault, and the SQL twin in
   * public.consent_permits coalesces it to the same number. Losing this
   * distinction is how a fix for the blink turns into a platform that cannot
   * send anything on a tenant nobody has configured.
   */
  it('falls back to the shared default when the policy ROW is genuinely absent', async () => {
    const admin = fakeConsentAdmin({ ...ledger({ withoutPolicyRow: true }), suppression_events: [] })
    const verdict = await resolveSend(admin.client, ask)
    expect(CONSENT_MAX_AGE_MONTHS_FALLBACK).toBe(24)
    // Granted January 2026, asked September 2026: inside 24 months, outside 2.
    expect(verdict.permitted).toBe(true)
    expect(verdict.reason).toMatch(/granted on 10 Jan 2026/)
  })

  it('refuses after the retries are exhausted on a transient fault, not before them', async () => {
    const admin = fakeConsentAdmin(ledger(), { failing: { suppression_events: TIMEOUT } })
    const verdict = await resolveSend(admin.client, ask)
    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toMatch(UNREADABLE)
  })

  it('still refuses an unknown tenant by name, which is a different answer from a failed read', async () => {
    const admin = fakeConsentAdmin({ ...ledger(), marketing_tenants: [] })
    const verdict = await resolveSend(admin.client, ask)
    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toBe(`unknown tenant ${PLATFORM_TENANT_SLUG}`)
  })
})

describe('the send LIST, when a read blinks', () => {
  const listAsk = { purpose: FACILITATED_MARKETING_PURPOSE, channel: 'email' as const, now: NOW }

  it('permits a consented address when every read works', async () => {
    const admin = fakeConsentAdmin({ ...ledger(), suppression_events: [] })
    const { permitted, refused } = await filterPermittedRecipients(admin.client, [SUBJECT], listAsk)
    expect(permitted).toEqual([SUBJECT])
    expect(refused).toEqual([])
  })

  /*
   * THE WHOLE LIST FAILS TOGETHER, deliberately. Reading half a ledger and
   * treating the missing half as "no consent recorded" refuses real people for
   * a network blip while quietly sending to the rest, and a partial send is the
   * one outcome nobody can explain afterwards.
   */
  it('refuses the whole list, with the true reason, when the policy read fails', async () => {
    const admin = fakeConsentAdmin(
      { ...ledger(), suppression_events: [] },
      { failing: { consent_policy: REFUSED } },
    )
    const { permitted, refused } = await filterPermittedRecipients(
      admin.client,
      [SUBJECT, 'second@example.com'],
      listAsk,
    )
    expect(permitted).toEqual([])
    expect(refused.map((r) => r.email)).toEqual([SUBJECT, 'second@example.com'])
    for (const entry of refused) expect(entry.reason).toMatch(UNREADABLE)
  })

  it('refuses the whole list when the consent ledger itself cannot be paged', async () => {
    const admin = fakeConsentAdmin(
      { ...ledger(), suppression_events: [] },
      { failing: { consent_events: REFUSED } },
    )
    const { permitted, refused } = await filterPermittedRecipients(admin.client, [SUBJECT], listAsk)
    expect(permitted).toEqual([])
    expect(refused[0]?.reason).toMatch(UNREADABLE)
  })
})
