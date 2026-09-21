import { describe, expect, it, vi } from 'vitest'
import { resolveSend } from '@/lib/consent/resolver'
import { recordCheckoutMarketingAnswer } from '@/lib/consent/checkout-answer'
import { recordPlatformDigestDecline } from '@/lib/consent/record'
import { resolveDigestCityFor } from '@/lib/consent/digest-city'
import {
  FACILITATED_MARKETING_PURPOSE,
  LOCAL_DIGEST_PURPOSE,
  PLATFORM_TENANT_SLUG,
} from '@/lib/consent/purposes'
import { fakeConsentAdmin, PLATFORM_TENANT_ROW, WORDING_ROW } from '../../helpers/consent-ledger-fake'

/**
 * AN OUTAGE IS NOT A WITHDRAWAL, AND AN OUTAGE IS NOT A CHOICE OF NOWHERE.
 *
 * FOUR DEFECTS, ONE ROOT: a read that FAILED was used as a FACT ABOUT A PERSON,
 * and the fact was then written into a ledger that is append only and that this
 * platform's own rule says is never rewritten. That last part is what makes
 * this family worse than an ordinary blink: the row cannot be corrected
 * afterwards, by anybody, ever.
 *
 *   THE UNTOUCHED CHECKBOX. `recordCheckoutMarketingAnswer` asks the resolver
 *   whether an address already holds a live consent, so that a returning buyer
 *   who leaves the marketing box alone is not recorded as declining. Under the
 *   Spam Act a withdrawal is a deliberate act and an untouched checkbox is not
 *   one, and the code says so. But the resolver fails CLOSED, which is the right
 *   answer to "may this message go out" and is not an answer to "does this
 *   person hold a consent", and both refusals were the same `permitted: false`.
 *   So a blinked consent read sent an untouched box down the decline branch and
 *   the ledger's latest-event rule made it a withdrawal nobody performed.
 *
 *   DRIVEN ON TEST before the fix, on a real ledger, with the read failing on
 *   cue (4 requests: one call and three retries):
 *       before   permitted true,  "granted on 14 Sept 2026 under wording v1"
 *       after    permitted false, "the latest consent event is declined"
 *
 *   THE SAME, in `recordPlatformDigestDecline`, the second of exactly two places
 *   on this platform that turn a send verdict into a written fact about a person.
 *
 *   THE TWO CITIES. `resolveDigestCityFor` resolved the city a consent is scoped
 *   to with two reads that discarded their error and had no retry, so one
 *   dropped packet filed somebody who chose Geelong as having chosen nowhere.
 *   The digest is city scoped, so such a consent is in no send list at all: they
 *   said yes, they never hear anything, and the row still reads "granted".
 *
 * WHAT THE FIX IS, so these tests are read as pinning it rather than describing
 * it: `SendVerdict` carries `ledgerWasRead`, and the two writers consult it. The
 * city reads go through `readOrThrow`, the cookie falls back to the city
 * taxonomy in code (which cannot blink), and an unreadable event city is
 * reported as UNRESOLVED rather than as an absence.
 *
 * EVERY CASE BELOW THAT MATTERS WAS DRIVEN RED by planting the defect back:
 * scripts/verify/lb-outagewithdraw-test-drills.mjs.
 */

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('@/lib/flags/broadcast', () => ({ isFeatureEnabled: async () => true }))

const NOW = new Date('2026-09-21T00:00:00.000Z')
const SUBJECT = 'person@example.com'

/** A transient fault: `withBuildRetry` retries these before giving up. */
const TIMEOUT = { message: 'canceling statement due to statement timeout', code: '57014' }

const GRANT = {
  id: 'event-grant',
  tenant_id: PLATFORM_TENANT_ROW.id,
  subject_email: SUBJECT,
  purpose: FACILITATED_MARKETING_PURPOSE,
  channel_scope: 'both',
  decision: 'granted',
  occurred_at: '2026-09-14T00:00:00.000Z',
  wording_version: 'v1',
}

const DIGEST_GRANT = {
  ...GRANT,
  id: 'event-digest-grant',
  purpose: LOCAL_DIGEST_PURPOSE,
  channel_scope: 'email',
}

function ledger(extra: Record<string, unknown[]> = {}) {
  return {
    marketing_tenants: [PLATFORM_TENANT_ROW],
    consent_policy: [{ id: true, max_age_months: 24 }],
    consent_wordings: [WORDING_ROW],
    consent_events: [] as Record<string, unknown>[],
    suppression_events: [] as Record<string, unknown>[],
    cities: [{ slug: 'geelong' }, { slug: 'melbourne' }],
    events: [{ id: 'event-1', city_primary: 'melbourne' }],
    ...extra,
  }
}

const ask = {
  email: SUBJECT,
  purpose: FACILITATED_MARKETING_PURPOSE,
  channel: 'email' as const,
  tenantSlug: PLATFORM_TENANT_SLUG,
  now: NOW,
}

const answer = {
  email: SUBJECT,
  ticked: false,
  captureSurface: 'checkout',
  eventId: 'event-1',
  at: '2026-09-21T00:00:00.000Z',
}

const declinesIn = (admin: ReturnType<typeof fakeConsentAdmin>) =>
  admin.inserts.filter((i) => i.table === 'consent_events').flatMap((i) => i.rows)

describe('a send verdict says whether it is evidence about a person', () => {
  it('reports the ledger as read when every read works', async () => {
    const admin = fakeConsentAdmin(ledger({ consent_events: [GRANT] }))
    const verdict = await resolveSend(admin.client, ask)
    expect(verdict.permitted).toBe(true)
    expect(verdict.ledgerWasRead).toBe(true)
  })

  it('reports the ledger as UNREAD when a read gives up, and still refuses the send', async () => {
    const admin = fakeConsentAdmin(ledger({ consent_events: [GRANT] }), {
      failing: { consent_events: TIMEOUT },
    })
    const verdict = await resolveSend(admin.client, ask)
    // Fail closed is unchanged and deliberate: an unreadable consent record is
    // not evidence of consent, so the message still does not go out.
    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toMatch(/could not be read/)
    expect(verdict.ledgerWasRead).toBe(false)
  })

  it('treats a refusal decided without any rows as decided, not as an outage', async () => {
    const admin = fakeConsentAdmin(ledger())
    const verdict = await resolveSend(admin.client, ask)
    // Nobody has ever consented, which is a fact about this person.
    expect(verdict.permitted).toBe(false)
    expect(verdict.ledgerWasRead).toBe(true)
  })

  it('treats a transactional purpose as decided, even though it reads nothing at all', async () => {
    const admin = fakeConsentAdmin(ledger())
    const verdict = await resolveSend(admin.client, { ...ask, purpose: 'ticket_delivery' })
    expect(verdict.ledgerWasRead).toBe(true)
  })

  it('treats an empty address and an unknown tenant as decided', async () => {
    const admin = fakeConsentAdmin(ledger())
    expect((await resolveSend(admin.client, { ...ask, email: '  ' })).ledgerWasRead).toBe(true)
    expect((await resolveSend(admin.client, { ...ask, tenantSlug: 'nobody' })).ledgerWasRead).toBe(true)
  })
})

describe('the untouched checkbox at checkout', () => {
  it('writes NOTHING when the ledger could not be read', async () => {
    const admin = fakeConsentAdmin(ledger({ consent_events: [GRANT] }), {
      failing: { consent_events: TIMEOUT },
    })
    const result = await recordCheckoutMarketingAnswer(admin.client, answer)
    expect(result.recorded).toBe('none')
    expect(declinesIn(admin)).toHaveLength(0)
  })

  it('and says the outage was the reason, rather than anything about the person', async () => {
    const admin = fakeConsentAdmin(ledger({ consent_events: [GRANT] }), {
      failing: { consent_events: TIMEOUT },
    })
    const result = await recordCheckoutMarketingAnswer(admin.client, answer)
    expect(result.reason).toMatch(/could not be read/)
    expect(result.reason).toMatch(/not a withdrawal/)
  })

  it('still records a genuine decline, so the fix is not the branch switched off', async () => {
    const admin = fakeConsentAdmin(ledger())
    const result = await recordCheckoutMarketingAnswer(admin.client, answer)
    expect(result.recorded).toBe('declined')
    expect(declinesIn(admin)).toHaveLength(1)
    expect(declinesIn(admin)[0]).toMatchObject({ decision: 'declined' })
  })

  it('still protects a live consent from an untouched box when nothing is blinking', async () => {
    const admin = fakeConsentAdmin(ledger({ consent_events: [GRANT] }))
    const result = await recordCheckoutMarketingAnswer(admin.client, answer)
    expect(result.recorded).toBe('none')
    expect(result.reason).toMatch(/already has a live consent/)
    expect(declinesIn(admin)).toHaveLength(0)
  })
})

describe('the same rule at the second call site', () => {
  it('writes NOTHING when the ledger could not be read', async () => {
    const admin = fakeConsentAdmin(ledger({ consent_events: [DIGEST_GRANT] }), {
      failing: { consent_events: TIMEOUT },
    })
    const wrote = await recordPlatformDigestDecline(admin.client, {
      email: SUBJECT,
      at: '2026-09-21T00:00:00.000Z',
    })
    expect(wrote).toBe(false)
    expect(declinesIn(admin)).toHaveLength(0)
  })

  it('writes nothing over a live consent, which is the rule that always held', async () => {
    const admin = fakeConsentAdmin(ledger({ consent_events: [DIGEST_GRANT] }))
    expect(
      await recordPlatformDigestDecline(admin.client, { email: SUBJECT, at: '2026-09-21T00:00:00.000Z' }),
    ).toBe(false)
    expect(declinesIn(admin)).toHaveLength(0)
  })

  it('writes a genuine decline when there is no live consent and the ledger is readable', async () => {
    const admin = fakeConsentAdmin(ledger())
    expect(
      await recordPlatformDigestDecline(admin.client, { email: SUBJECT, at: '2026-09-21T00:00:00.000Z' }),
    ).toBe(true)
    expect(declinesIn(admin)).toHaveLength(1)
  })
})

describe('the city a consent is scoped to', () => {
  it('takes the city the buyer chose', async () => {
    const admin = fakeConsentAdmin(ledger())
    expect(await resolveDigestCityFor(admin.client, { eventId: 'event-1', cookieCity: 'geelong' })).toEqual({
      city: 'geelong',
      unresolved: false,
    })
  })

  it('keeps that city when the cities table cannot be read, because the taxonomy in code can', async () => {
    const admin = fakeConsentAdmin(ledger(), { failing: { cities: TIMEOUT } })
    // The whole defect in one assertion: this used to be null, and a null here
    // is a person on no send list at all, for ever, on a row reading "granted".
    expect(await resolveDigestCityFor(admin.client, { eventId: 'event-1', cookieCity: 'geelong' })).toEqual({
      city: 'geelong',
      unresolved: false,
    })
  })

  it('does not invent a city from a cookie the taxonomy does not hold', async () => {
    const admin = fakeConsentAdmin(ledger(), { failing: { cities: TIMEOUT } })
    // The fallback is a taxonomy lookup, not a shrug. An unknown cookie falls
    // through to the event exactly as it always did, and a slug that is not a
    // city can never reach the consent row's foreign key.
    expect(
      await resolveDigestCityFor(admin.client, { eventId: 'event-1', cookieCity: 'not-a-city' }),
    ).toEqual({ city: 'melbourne', unresolved: false })
  })

  it("falls back to the event's own city", async () => {
    const admin = fakeConsentAdmin(ledger())
    expect(await resolveDigestCityFor(admin.client, { eventId: 'event-1', cookieCity: null })).toEqual({
      city: 'melbourne',
      unresolved: false,
    })
  })

  it('reads the events table ONCE and never re-reads cities to validate what it said', async () => {
    const admin = fakeConsentAdmin(ledger())
    await resolveDigestCityFor(admin.client, { eventId: 'event-1', cookieCity: null })
    // `events.city_primary references public.cities(slug)`, so the row the third
    // read went looking for is the row the foreign key guarantees. It could only
    // return what it was given, or fail, so every null it produced was an outage.
    expect(admin.reads).toEqual(['events'])
  })

  it('calls an unreadable event city UNRESOLVED, which is not the same null as "no city"', async () => {
    const admin = fakeConsentAdmin(ledger(), { failing: { events: TIMEOUT } })
    expect(await resolveDigestCityFor(admin.client, { eventId: 'event-1', cookieCity: null })).toEqual({
      city: null,
      unresolved: true,
    })
  })

  it('still answers an honest null when nothing names a city', async () => {
    const admin = fakeConsentAdmin(ledger())
    expect(await resolveDigestCityFor(admin.client, { eventId: null, cookieCity: null })).toEqual({
      city: null,
      unresolved: false,
    })
  })

  it('answers an honest null for an event that genuinely has no primary city', async () => {
    const admin = fakeConsentAdmin(ledger({ events: [{ id: 'event-1', city_primary: null }] }))
    expect(await resolveDigestCityFor(admin.client, { eventId: 'event-1', cookieCity: null })).toEqual({
      city: null,
      unresolved: false,
    })
  })
})

describe('a consent is never lost to its city', () => {
  it('records the grant even when the city could not be read, and says the city is missing', async () => {
    const admin = fakeConsentAdmin(ledger(), { failing: { events: TIMEOUT } })
    const result = await recordCheckoutMarketingAnswer(admin.client, { ...answer, ticked: true })
    // Losing the grant is the worse mistake: the person said yes and the ledger
    // is the evidence of it. Reporting it as clean is the second worse one.
    expect(result.recorded).toBe('granted')
    expect(result.reason).toMatch(/the city could not be read/)
    const written = declinesIn(admin)
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({ decision: 'granted', city_slug: null })
  })

  it('scopes the grant to the resolved city when the reads work', async () => {
    const admin = fakeConsentAdmin(ledger())
    const result = await recordCheckoutMarketingAnswer(admin.client, { ...answer, ticked: true })
    expect(result.recorded).toBe('granted')
    expect(result.reason).not.toMatch(/could not be read/)
    expect(declinesIn(admin)[0]).toMatchObject({ decision: 'granted', city_slug: 'melbourne' })
  })
})
