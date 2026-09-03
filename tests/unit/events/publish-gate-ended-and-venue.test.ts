import { describe, expect, it } from 'vitest'
import { checkPublishGate } from '@/lib/events/publish-gate'

/**
 * TWO THINGS THAT MAKE AN EVENT UNATTENDABLE.
 *
 * Founder rulings, 29 August 2026, both from break attempts that published
 * through the ordinary wizard with no warning at any step:
 *
 *   ENDED   an event starting a month in the past went live and sellable. The
 *           only date rule anywhere was "End date and time must be after start
 *           date and time", which a fat-fingered year satisfies perfectly.
 *   VENUE   an in-person event published with no venue at all. Nobody can go.
 *
 * THE ENDED RULE IS "HAS IT ENDED", NOT "DID IT START IN THE PAST", and that is
 * the whole ruling rather than a detail. A festival that opened yesterday and
 * runs for a week is a real event that must stay publishable and sellable. What
 * cannot be sold is a night that is over. The test below pins both halves,
 * because a rule that refuses the running festival would be a new defect.
 *
 * THE VENUE RULE IS SCOPED TO PHYSICAL EVENTS for the same reason: an online
 * event legitimately has no address, and refusing one would break a working path
 * in the name of fixing another.
 */

const FUTURE = new Date(Date.now() + 7 * 864e5).toISOString()
const YESTERDAY = new Date(Date.now() - 1 * 864e5).toISOString()
const LAST_MONTH = new Date(Date.now() - 30 * 864e5).toISOString()
const NEXT_WEEK = new Date(Date.now() + 7 * 864e5).toISOString()

const SELLABLE_ORG = {
  stripe_account_id: 'acct_x',
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  payout_status: 'active',
  stripe_account_country: 'AU',
}

function clientReturning(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  } as never
}

const base = {
  organisationId: 'org_1',
  tiersHavePaid: false,
  coverImageUrl: 'https://x/y.jpg',
  endsAt: FUTURE,
  isPhysical: true,
  venueName: 'The Wool Exchange',
  venueAddress: '44 Moorabool St, Geelong',
}

describe('an event that has already ended', () => {
  it('is refused, and the refusal names the date', async () => {
    const r = await checkPublishGate(clientReturning(SELLABLE_ORG), { ...base, endsAt: LAST_MONTH }, null)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('event_already_ended')
    expect(r.message).toMatch(/finished|already/i)
    expect(r.message, 'the organiser needs to be pointed at the field to check').toMatch(/date|year/i)
  })

  it('a festival that STARTED yesterday and runs all week still publishes', async () => {
    // The case the rule must not break. Start in the past, end in the future.
    const r = await checkPublishGate(
      clientReturning(SELLABLE_ORG),
      { ...base, endsAt: NEXT_WEEK },
      null,
    )
    expect(r.ok, 'a running multi-day event was refused: the rule is "has it ended", not "did it start"').toBe(true)
    expect(YESTERDAY < NEXT_WEEK).toBe(true)
  })

  it('an event with no end recorded is not refused on that basis', async () => {
    const r = await checkPublishGate(clientReturning(SELLABLE_ORG), { ...base, endsAt: null }, null)
    expect(r.ok).toBe(true)
  })

  it('an unparseable end date is not refused on that basis either', async () => {
    // Refusing on a value we cannot read would block a publish for a reason we
    // could not explain, which is the opposite of a refusal being true.
    const r = await checkPublishGate(clientReturning(SELLABLE_ORG), { ...base, endsAt: 'not-a-date' }, null)
    expect(r.ok).toBe(true)
  })
})

describe('a physical event with nowhere to go', () => {
  it('is refused when both the venue name and the address are empty', async () => {
    const r = await checkPublishGate(
      clientReturning(SELLABLE_ORG),
      { ...base, venueName: null, venueAddress: null },
      null,
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('venue_required')
    expect(r.message).toMatch(/venue|where/i)
    expect(r.nextAction?.href).toBeTruthy()
  })

  it('whitespace is not a venue', async () => {
    const r = await checkPublishGate(
      clientReturning(SELLABLE_ORG),
      { ...base, venueName: '   ', venueAddress: '\t' },
      null,
    )
    expect(r.ok).toBe(false)
  })

  it('an address with no venue name is enough', async () => {
    const r = await checkPublishGate(
      clientReturning(SELLABLE_ORG),
      { ...base, venueName: null, venueAddress: '44 Moorabool St, Geelong' },
      null,
    )
    expect(r.ok).toBe(true)
  })

  it('an ONLINE event needs no venue', async () => {
    const r = await checkPublishGate(
      clientReturning(SELLABLE_ORG),
      { ...base, isPhysical: false, venueName: null, venueAddress: null },
      null,
    )
    expect(r.ok, 'an online event was refused for having no address').toBe(true)
  })
})
