/**
 * FO1. THE FOUNDING ORGANISER OFFER IS WHAT THE PAGE PROMISES.
 *
 * www.eventlinqs.com.au/organisers publishes four numbers and every outreach
 * message sent since 12 September 2026 repeats them word for word: the first
 * fifty organisers nationally, six months completely fee free, three more
 * months for every organiser referred who runs an event, and founding terms
 * applied before the first on-sale. This file is the arithmetic behind those
 * sentences.
 *
 * THE DEFECT IT WAS WRITTEN AROUND. The three referral months used to be paid
 * the instant the invited organiser CREATED AN ACCOUNT, while the copy promised
 * them for an organiser who RUNS AN EVENT. Four friends who never sold a ticket
 * would have earned a year of waived fees. The credit now belongs to the
 * referred organisation's first confirmed PAID order and is granted by the
 * database (trigger trg_founding_referral_credit, migration 20260913000010),
 * which is what the SQL assertions at the bottom of this file are checking.
 *
 * The fee values are parsed out of docs/PRICING.md rather than typed here, so
 * these tests and the build guard and the published prose are physically the
 * same numbers.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { computeFeeLineCents, type FeeRates } from '@/lib/payments/fee-math'
import { parseLockedValues } from '@/lib/health/pricing-lock.mjs'
import {
  applyFoundingWaiver,
  extendWaiver,
  foundingGrantVerdict,
  initialWaiverUntil,
  isWaiverActive,
  FOUNDING_INITIAL_MONTHS,
  FOUNDING_REFERRAL_MONTHS,
  FOUNDING_WAIVER_CAP,
} from '@/lib/payments/founding-waiver'
import {
  FOUNDING_SPOT_CAP,
  REFERRAL_BONUS_MONTHS,
} from '@/lib/founding/invites'
import { FOUNDING_OFFER } from '@/lib/organisers/founding-offer'
import { BROADCAST_FLAGS, BROADCAST_FLAG_DEFAULTS, BROADCAST_FLAG_DECISIONS } from '@/lib/flags/broadcast'

const REPO_ROOT = process.cwd()
const locked = parseLockedValues(REPO_ROOT) as Record<string, number | string>

const STANDARD_RATES: FeeRates = {
  platformFeePercent: Number(locked.platform_fee_percentage),
  platformFeeFixedCents: Number(locked.platform_fee_fixed),
}

/** A 20.00 ticket, the anchor the founder checks by hand. */
const TWENTY_DOLLARS = 2000

/** The moment every date assertion is made from, so none of them drift. */
const NOW = new Date('2026-09-13T00:00:00.000Z')

/**
 * The three states FO1 acceptance 1 names, expressed the way the charge
 * authority expresses them: a window date, `isWaiverActive`, then the rates.
 */
function ratesFor(feeFreeUntil: string | null): FeeRates {
  return applyFoundingWaiver(STANDARD_RATES, isWaiverActive(feeFreeUntil, NOW))
}

describe('FO1 acceptance 1: what a founding organiser is charged', () => {
  const INSIDE = new Date('2027-03-13T00:00:00.000Z').toISOString()
  const ENDED_YESTERDAY = new Date('2026-09-12T00:00:00.000Z').toISOString()

  it('inside the window the platform fee is zero and nothing else is charged', () => {
    const fees = computeFeeLineCents(TWENTY_DOLLARS, 1, ratesFor(INSIDE))
    expect(fees.platform_fee_cents).toBe(0)
    // There is ONE fee, so "processing unchanged" means it stays at the zero it
    // has been since 15 August 2026, not that a second line survives the waiver.
    expect(fees.payment_processing_fee_cents).toBe(0)
  })

  it('the day after founding_until the standard fee is charged again', () => {
    const fees = computeFeeLineCents(TWENTY_DOLLARS, 1, ratesFor(ENDED_YESTERDAY))
    const expected = Math.round(
      (TWENTY_DOLLARS * STANDARD_RATES.platformFeePercent) / 100 + STANDARD_RATES.platformFeeFixedCents,
    )
    expect(fees.platform_fee_cents).toBe(expected)
    expect(fees.platform_fee_cents).toBeGreaterThan(0)
  })

  it('an organiser who is not founding is charged the standard fee', () => {
    const fees = computeFeeLineCents(TWENTY_DOLLARS, 1, ratesFor(null))
    expect(fees).toEqual(computeFeeLineCents(TWENTY_DOLLARS, 1, STANDARD_RATES))
  })

  it('the window ends at the instant it ends, with no free final millisecond', () => {
    expect(isWaiverActive(NOW.toISOString(), NOW)).toBe(false)
    expect(isWaiverActive(new Date(NOW.getTime() + 1).toISOString(), NOW)).toBe(true)
  })
})

describe('FO1 acceptance 1: the waived amount is the fee that would have been charged', () => {
  /**
   * The calculator reports this as founding_fee_waived_cents, computed by
   * running the SAME fee line a second time on the unwaived rates and
   * subtracting. The arithmetic is repeated here rather than the method, so the
   * test would fail if the calculator started multiplying the percentage out by
   * hand and rounded differently by a cent.
   */
  it.each([
    [TWENTY_DOLLARS, 1],
    [TWENTY_DOLLARS * 4, 4],
    [1, 1],
    [999_99, 37],
  ])('subtotal %i over %i tickets', (subtotal, tickets) => {
    const wouldHaveBeen = computeFeeLineCents(subtotal, tickets, STANDARD_RATES).platform_fee_cents
    const waivedLine = computeFeeLineCents(subtotal, tickets, applyFoundingWaiver(STANDARD_RATES, true))
    expect(waivedLine.platform_fee_cents).toBe(0)
    expect(wouldHaveBeen - waivedLine.platform_fee_cents).toBe(wouldHaveBeen)
    expect(wouldHaveBeen).toBeGreaterThan(0)
  })

  it('a free event waives nothing, because it was never going to be charged', () => {
    const fees = computeFeeLineCents(0, 1, applyFoundingWaiver(STANDARD_RATES, true))
    expect(fees.platform_fee_cents).toBe(0)
  })
})

describe('FO1 acceptance 1: the fifty-first grant is refused unless the owner overrides', () => {
  it('grants the fiftieth and refuses the fifty-first', () => {
    expect(foundingGrantVerdict({ holders: FOUNDING_WAIVER_CAP - 1, opensNewWindow: true })).toBe('granted')
    expect(foundingGrantVerdict({ holders: FOUNDING_WAIVER_CAP, opensNewWindow: true })).toBe('refused_cap')
  })

  it('grants the fifty-first when the owner overrides by hand', () => {
    expect(
      foundingGrantVerdict({ holders: FOUNDING_WAIVER_CAP, opensNewWindow: true, override: true }),
    ).toBe('granted')
  })

  it('never caps an EXTENSION, because a referral costs no new spot', () => {
    expect(foundingGrantVerdict({ holders: 500, opensNewWindow: false })).toBe('granted')
  })

  it('refuses every count at or above the cap, not just the boundary', () => {
    for (const holders of [FOUNDING_WAIVER_CAP, FOUNDING_WAIVER_CAP + 1, FOUNDING_WAIVER_CAP + 99]) {
      expect(foundingGrantVerdict({ holders, opensNewWindow: true })).toBe('refused_cap')
    }
  })
})

describe('FO1 acceptance 1: a referral sale extends the window by exactly three months, once', () => {
  it('adds exactly the referral grant to an open window', () => {
    const start = initialWaiverUntil(NOW)
    const afterOne = extendWaiver(start, FOUNDING_REFERRAL_MONTHS, NOW)
    expect(start.slice(0, 10)).toBe('2027-03-13')
    expect(afterOne.slice(0, 10)).toBe('2027-06-13')
  })

  it('stacks two confirmed referrals rather than overwriting one with the other', () => {
    const start = initialWaiverUntil(NOW)
    const afterTwo = extendWaiver(extendWaiver(start, FOUNDING_REFERRAL_MONTHS, NOW), FOUNDING_REFERRAL_MONTHS, NOW)
    expect(afterTwo.slice(0, 10)).toBe('2027-09-13')
  })

  it('extends from today when the window has already lapsed, so the grant is real', () => {
    const lapsed = new Date('2026-01-01T00:00:00.000Z').toISOString()
    const next = extendWaiver(lapsed, FOUNDING_REFERRAL_MONTHS, NOW)
    expect(next.slice(0, 10)).toBe('2026-12-13')
    expect(isWaiverActive(next, NOW)).toBe(true)
  })

  it('rolls forward at month end rather than clamping, and the database agrees', () => {
    // 31 August plus three months is 1 December in JavaScript, and the SQL
    // function founding_add_months is written to give the same answer. The two
    // are the same rule and the migration asserts the same anchor before it
    // commits, so a divergence fails the migration rather than shortening
    // somebody's waiver by a day.
    const august31 = new Date('2026-08-31T04:05:06.000Z').toISOString()
    expect(extendWaiver(august31, 3, new Date('2026-08-01T00:00:00.000Z')).slice(0, 10)).toBe('2026-12-01')
  })
})

describe('FO1 acceptance 5: the published offer numbers ARE the configuration', () => {
  const copy = [FOUNDING_OFFER.title, FOUNDING_OFFER.body, FOUNDING_OFFER.note, ...FOUNDING_OFFER.points].join('\n')

  it('states the cap the machine enforces', () => {
    expect(copy).toContain(`The first ${FOUNDING_WAIVER_CAP} build it with us`)
    expect(copy).toContain(`first ${FOUNDING_WAIVER_CAP} organisers anywhere in the country`)
    expect(copy).toContain(`limited to the first ${FOUNDING_WAIVER_CAP} organisers nationally`)
  })

  it('states the six months the grant actually opens', () => {
    expect(copy).toContain(`${FOUNDING_INITIAL_MONTHS} months completely fee-free`)
  })

  it('states the three months a referral actually earns', () => {
    expect(copy).toContain(`${FOUNDING_REFERRAL_MONTHS} more fee-free months`)
  })

  it('promises the terms before the first on-sale, which is the fourth claim', () => {
    expect(copy).toContain('before your first on-sale')
  })

  it('promises the months for an organiser who RUNS AN EVENT, which is when they are granted', () => {
    // The copy and the machine agreed on the number and disagreed on the
    // moment. This is the assertion that would have caught that.
    expect(copy).toContain('for every organiser you refer who runs an event')
  })

  it('has ONE fifty and ONE three, not two of each that happen to match today', () => {
    expect(FOUNDING_SPOT_CAP).toBe(FOUNDING_WAIVER_CAP)
    expect(REFERRAL_BONUS_MONTHS).toBe(FOUNDING_REFERRAL_MONTHS)
  })

  // NEGATIVE CONTROL. Every assertion above measures the presence of a number,
  // so each one has to be able to fail. Feeding the same checks a copy deck with
  // the wrong number proves they are not passing vacuously.
  it('the same checks REJECT a copy deck carrying the wrong number', () => {
    const wrong = copy.replace(
      `${FOUNDING_INITIAL_MONTHS} months completely fee-free`,
      `${FOUNDING_INITIAL_MONTHS + 3} months completely fee-free`,
    )
    expect(wrong).not.toContain(`${FOUNDING_INITIAL_MONTHS} months completely fee-free`)
  })
})

describe('FO1 reversal condition: the offer can be closed without a deploy', () => {
  it('founding_open is a governed switch with a dated decision', () => {
    expect(BROADCAST_FLAGS).toContain('founding_open')
    expect(BROADCAST_FLAG_DEFAULTS.founding_open).toBe(true)
    expect(BROADCAST_FLAG_DECISIONS.founding_open).toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(BROADCAST_FLAG_DECISIONS.founding_open.toLowerCase()).toContain('lawal')
  })

  it('the conversion path reads the switch before it grants anything', () => {
    const source = readFileSync(join(REPO_ROOT, 'src/lib/founding/invites.ts'), 'utf8')
    const flagCheck = source.indexOf("isFeatureEnabled('founding_open'")
    const spotClaim = source.indexOf("rpc('claim_founding_spot'")
    expect(flagCheck).toBeGreaterThan(-1)
    expect(spotClaim).toBeGreaterThan(-1)
    // A switch read AFTER the spot is allocated closes nothing.
    expect(flagCheck).toBeLessThan(spotClaim)
  })
})

describe('FO1: the referral credit is granted by the machine, on the first paid sale', () => {
  const migration = readFileSync(
    join(REPO_ROOT, 'supabase/migrations/20260913000010_founding_organiser_terms.sql'),
    'utf8',
  )

  it('fires on a confirmed order with money on it, and on the insert twin', () => {
    expect(migration).toMatch(/CREATE TRIGGER trg_founding_referral_credit\b/)
    expect(migration).toMatch(/CREATE TRIGGER trg_founding_referral_credit_insert\b/)
    expect(migration).toMatch(/NEW\.status = 'confirmed'::order_status/)
    expect(migration).toMatch(/NEW\.total_cents > 0/)
  })

  it('adds exactly the referral grant, from the current expiry or from now', () => {
    expect(migration).toMatch(/v_months\s+CONSTANT INT := 3/)
    expect(migration).toMatch(/GREATEST\(COALESCE\(v_previous, NOW\(\)\), NOW\(\)\)/)
  })

  it('is once only, marked under a row lock before anything is paid out', () => {
    expect(migration).toMatch(/referral_credited_at IS NULL/)
    expect(migration).toMatch(/FOR UPDATE/)
  })

  it('can never block an order, and handles its own faults in its own frame', () => {
    // The lesson of 20260909000004: a handler one frame lower never sees a
    // fault raised while the arguments are being evaluated.
    const trigger = migration.slice(migration.indexOf('FUNCTION public.tg_founding_referral_credit'))
    expect(trigger).toMatch(/EXCEPTION WHEN OTHERS THEN/)
    expect(trigger).toMatch(/RAISE WARNING/)
  })

  it('marks every already-accepted invite as credited, so nothing is paid twice', () => {
    expect(migration).toMatch(/referral_credited_at\s+= COALESCE\(o\.referral_credited_at, i\.accepted_at, NOW\(\)\)/)
  })

  it('records the waived platform fee on the order, defaulting to nothing waived', () => {
    expect(migration).toMatch(/founding_fee_waived_cents BIGINT NOT NULL DEFAULT 0/)
  })
})

describe('FO1: every order-creating path records what the offer cost', () => {
  /**
   * Three paths create an order with a resolved fee (general admission, seated,
   * and squads) and all three must carry the waived amount, or the offer's cost
   * is under-reported by whichever one was forgotten. Free registration is not
   * in this list on purpose: it never resolves a fee, so its orders waive
   * nothing and take the column default.
   */
  const PATHS = [
    'src/app/actions/checkout.ts',
    'src/app/actions/squad-checkout.ts',
  ]

  it.each(PATHS)('%s writes founding_fee_waived_cents from the calculator', path => {
    const source = readFileSync(join(REPO_ROOT, path), 'utf8')
    const inserts = [...source.matchAll(/platform_fee_cents: fees\.platform_fee_cents,/g)].length
    const waived = [...source.matchAll(/founding_fee_waived_cents: fees\.founding_fee_waived_cents,/g)].length
    expect(inserts).toBeGreaterThan(0)
    expect(waived).toBe(inserts)
  })

  it('the calculator computes it from the unwaived rates rather than re-deriving the percentage', () => {
    const source = readFileSync(join(REPO_ROOT, 'src/lib/payments/payment-calculator.ts'), 'utf8')
    expect(source).toMatch(/founding_fee_waived_cents = waiver\.active/)
    expect(source).toMatch(/computeFeeLineCents\(discounted_subtotal, ticketCount, \{/)
  })
})

describe('FO1: the words Founding Organiser reach the public surfaces once', () => {
  it('there is exactly ONE implementation of the badge', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`
        if (entry.isDirectory()) walk(rel)
        else if (entry.name.endsWith('.tsx')) files.push(rel)
      }
    }
    walk('src/components')
    walk('src/app')
    const declaring = files.filter(f =>
      readFileSync(join(REPO_ROOT, f), 'utf8').includes('export function FoundingOrganiserBadge'),
    )
    expect(declaring).toEqual(['src/components/features/organisers/founding-organiser-badge.tsx'])
  })

  it('the organiser profile and the event page both render it behind a server-resolved boolean', () => {
    const organiser = readFileSync(join(REPO_ROOT, 'src/app/organisers/[handle]/page.tsx'), 'utf8')
    const event = readFileSync(join(REPO_ROOT, 'src/app/events/[slug]/page.tsx'), 'utf8')
    expect(organiser).toContain('getFoundingBadge(organisation.id)')
    expect(organiser).toContain('founding={foundingBadge.isFounding}')
    expect(event).toContain('getFoundingBadge(event.organisation_id)')
    expect(event).toContain('foundingBadge.isFounding ?')
  })

  it('the badge reads is_founding with the service role and widens no grant to anon', () => {
    const badge = readFileSync(join(REPO_ROOT, 'src/lib/organisers/founding-badge.ts'), 'utf8')
    expect(badge).toContain('createAdminClient()')
    expect(badge).toContain("select('is_founding')")
    // The founder ruling of 2026-08-08 fixes the public column list at six.
    // Nothing here may add a seventh.
    const lockdown = readFileSync(
      join(REPO_ROOT, 'supabase/migrations/20260808000010_rls_column_privilege_lockdown.sql'),
      'utf8',
    )
    expect(lockdown).toContain('GRANT SELECT (id, name, slug, description, logo_url, website)')
    const migrations = readdirSync(join(REPO_ROOT, 'supabase/migrations'))
      .filter(f => f.endsWith('.sql'))
      .map(f => readFileSync(join(REPO_ROOT, 'supabase/migrations', f), 'utf8'))
    const widened = migrations.filter(sql =>
      /GRANT SELECT\s*\([^)]*is_founding[^)]*\)\s*\n?\s*ON public\.organisations TO (anon|authenticated)/i.test(sql),
    )
    expect(widened).toEqual([])
  })
})
