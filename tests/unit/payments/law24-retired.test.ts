/**
 * LAW 24 IS RETIRED (Lawal, 15 November 2026, 00:19: "every organiser must pay from day one"; 00:37: "The whole website
 * must be in unison"; the PM's rulings of 00:19 item 2 and 00:42 item 4).
 *
 * What these hold, each read from the code or the migration that does it:
 *   1. the switch: the offer is closed, and every surface that could say it reads the switch;
 *   2. the referral extension's dated end, the one thing kept for the organisations registered before the change:
 *      a referral completed on 14 December 2026 still extends, one on 16 December does not (the PM's 00:42 item 4);
 *   3. the badge: only an organisation that holds a window shows it, and any failure shows none;
 *   4. the database: migration 20261115000001 stops the registration window, keeps every earlier window to its date,
 *      lets no window be granted or moved later but that referral, and the order trigger reads the stored window alone.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FEE_FROM_DAY_ONE,
  FOUNDING_OFFER_OPEN,
  REFERRAL_EXTENSION_ENDS_AT,
  referralExtensionOpen,
  type OrganisationReadClient,
} from '@/lib/payments/founding-waiver'
import { FOUNDING_OFFER } from '@/lib/organisers/founding-offer'
import { getFoundingBadge } from '@/lib/organisers/founding-badge'

const ROOT = process.cwd()
const MIGRATION = readFileSync(
  join(ROOT, 'supabase/migrations/20261115000001_law24_retired_the_fee_from_day_one.sql'),
  'utf8',
).replace(/\r\n/g, '\n')

function windowClient(founding_fee_free_until: string | null): OrganisationReadClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { founding_fee_free_until }, error: null }) }),
      }),
    }),
  }
}

describe('the switch', () => {
  it('the offer is closed and its band does not draw', () => {
    expect(FOUNDING_OFFER_OPEN).toBe(false)
    expect(FOUNDING_OFFER.enabled).toBe(false)
  })

  it('the rule that replaced it charges from the first sale and keeps free events free', () => {
    expect(FEE_FROM_DAY_ONE.rule).toContain('from their first sale')
    expect(FEE_FROM_DAY_ONE.rule).toContain('Free events stay free')
  })
})

describe("the referral extension's dated end (the PM's 00:42 item 4)", () => {
  it('a referral on 14 December 2026 still extends', () => {
    expect(referralExtensionOpen(new Date('2026-12-14T12:00:00+11:00'))).toBe(true)
    expect(referralExtensionOpen(new Date('2026-12-15T23:59:00+11:00'))).toBe(true)
  })

  it('a referral on 16 December 2026 does not', () => {
    expect(referralExtensionOpen(new Date('2026-12-16T00:00:00+11:00'))).toBe(false)
    expect(referralExtensionOpen(new Date('2026-12-16T12:00:00+11:00'))).toBe(false)
  })

  it('the app and the database hold the same instant', () => {
    expect(REFERRAL_EXTENSION_ENDS_AT).toBe('2026-12-16T00:00:00+11:00')
    expect(MIGRATION).toContain("select p_at < '2026-12-16 00:00:00+11'::timestamptz")
  })
})

describe('the badge is no longer offered as a perk', () => {
  it('shows only for an organisation that holds a window, active or ended', async () => {
    expect(await getFoundingBadge('org-1', windowClient('2027-02-07T00:00:00Z'))).toEqual({ isFounding: true })
    expect(await getFoundingBadge('org-1', windowClient(null))).toEqual({ isFounding: false })
    expect(await getFoundingBadge(null, windowClient('2027-02-07T00:00:00Z'))).toEqual({ isFounding: false })
  })

  it('a failed read shows no badge', async () => {
    const broken: OrganisationReadClient = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error('down') }) }) }) }),
    }
    expect(await getFoundingBadge('org-1', broken)).toEqual({ isFounding: false })
  })
})

describe('migration 20261115000001 holds the rule at the database', () => {
  it('stops the registration window and keeps the referral triggers', () => {
    expect(MIGRATION).toContain('drop trigger if exists trg_registration_fee_free_window on public.organisations;')
    expect(MIGRATION).not.toMatch(/drop trigger if exists trg_founding_referral_credit\b/)
  })

  it('replaces the six month constraint with the cutover', () => {
    expect(MIGRATION).toContain('(created_at >= %1$L::timestamptz and founding_fee_free_until is null)')
    expect(MIGRATION).toContain('founding_fee_free_until >= public.founding_add_months(created_at, 6)')
  })

  it('changes the two functions in force in place, never from the files (law 14 (z))', () => {
    expect(MIGRATION).toContain("pg_get_functiondef('public.order_fee_respects_law24()'::regprocedure)")
    expect(MIGRATION).toContain("pg_get_functiondef('public.credit_founding_referral(uuid,uuid)'::regprocedure)")
    expect(MIGRATION).toContain("v_new constant text := 'select o.founding_fee_free_until into v_until';")
  })

  it('lets no window be granted or moved later, but a referral credit inside its end', () => {
    expect(MIGRATION).toContain('create trigger trg_fee_free_window_never_moves_later')
    expect(MIGRATION).toContain('and public.referral_extension_open(now()) then')
  })

  it('turns the founding_open switch off', () => {
    expect(MIGRATION).toMatch(/update public\.feature_flags\s+set enabled = false,[\s\S]*where flag = 'founding_open';/)
  })

  it('reads itself back, the 14 and 16 December cases among them', () => {
    expect(MIGRATION).toContain(
      "if not public.referral_extension_open('2026-12-14 12:00:00+11') or public.referral_extension_open('2026-12-16 12:00:00+11') then",
    )
  })
})
