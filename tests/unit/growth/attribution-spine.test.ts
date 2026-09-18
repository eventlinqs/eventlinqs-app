import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  NONE_REASON,
  NONE_REASON_SENTENCE,
  RUNG,
  RUNG_NAME,
  emailIdentityKey,
  phoneIdentityKey,
  resolveAttribution,
  decisionCouldBeBillable,
  type ResolverClick,
  type ResolverInput,
  type ResolverOrder,
} from '@/lib/attribution/resolve'
import {
  COMPLETED_SALE_STATUSES,
  REVERSAL_REASON,
  REVERSAL_REASON_SENTENCE,
  isBillable,
  isCompletedSale,
  isReversalReason,
  reversalOwedForOrderState,
} from '@/lib/attribution/reversal'
import { SEEDED_ATTRIBUTION_CONFIG } from '@/lib/attribution/config'
import { isValidLinkCode, mintLinkCode } from '@/lib/attribution/codes'
import {
  CLICK_QUERY_KEYS,
  TRACKED_LINK_PREFIX,
  appendClickIdentifiers,
  eventTargetPath,
  readClickIdentifiers,
  trackedLinkPath,
} from '@/lib/attribution/route-config'
import { CLICK_COOKIE, CLICK_QUERY_COOKIE, clickCookieOptions, readClickCookie } from '@/lib/attribution/cookie'
import { BROADCAST_FLAGS, BROADCAST_FLAG_DECISIONS, BROADCAST_FLAG_DEFAULTS } from '@/lib/flags/broadcast'

/**
 * GA3. THE ATTRIBUTION SPINE, HELD TO THE DECISIONS IT STORES.
 *
 * Every rung of the ladder is pure, so it is walked here in both directions and
 * at its boundaries. What is NOT decided here is whether the DATABASE refuses a
 * second record for one order and whether billable flips the instant a reversal
 * lands. Those are the database, and they are proven against it rather than
 * described: scripts/verify/ga3-attribution-drive.mjs asks the database for a
 * second record and asserts the 23505 it answers with, asks it in as many words
 * to set billable true and asserts it comes back false, and drives the whole
 * ladder through the product's own checkout at 390, 768 and 1440. The guard's
 * two clauses are drilled red and green by C:\dev\EVIDENCE\GA3\drill-guard.mjs.
 */

const ROOT = join(__dirname, '..', '..', '..')
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20260913000060_attribution_spine.sql')
const LIB = join(ROOT, 'src', 'lib', 'attribution')

const DAY = 24 * 60 * 60 * 1000
const ORDER_AT = '2026-09-13T10:00:00.000Z'
const at = (daysBefore: number) => new Date(Date.parse(ORDER_AT) - daysBefore * DAY).toISOString()

const BUYER = 'lane-b-ga3-buyer@eventlinqs.test'
const FRIEND = 'lane-b-ga3-friend@eventlinqs.test'

function click(overrides: Partial<ResolverClick> = {}): ResolverClick {
  return {
    id: 'click-one',
    campaignId: 'campaign-one',
    campaignName: 'Lane B spring nights',
    channelCode: 'email',
    channelName: 'Email',
    partnerId: null,
    recipientId: 'recipient-one',
    recipientIdentityKeys: [emailIdentityKey(BUYER)],
    occurredAt: at(2),
    campaignWindowDays: 30,
    ...overrides,
  }
}

function order(overrides: Partial<ResolverOrder> = {}): ResolverOrder {
  return {
    id: 'order-one',
    reference: 'EL-LANEBGA3',
    buyerIdentityKeys: [emailIdentityKey(BUYER)],
    placedAt: ORDER_AT,
    ...overrides,
  }
}

function input(overrides: Partial<ResolverInput> = {}): ResolverInput {
  return {
    order: order(),
    signal: null,
    clicks: [click()],
    config: { modelName: 'last-click-with-identity-ladder', modelVersion: 'v1', rungFourConfidence: 0.5 },
    ...overrides,
  }
}

describe('GA3 acceptance 1: the resolver ladder', () => {
  it('cookie_click_id_wins_as_rung_one', () => {
    const decision = resolveAttribution(
      input({
        signal: { clickIdFromCookie: 'click-one', clickIdFromQuery: null, cookiePresent: true },
      }),
    )
    expect(decision.decision).toBe('attributed')
    expect(decision.rung).toBe(RUNG.COOKIE_CLICK_ID)
    expect(decision.clickId).toBe('click-one')
    expect(decision.campaignId).toBe('campaign-one')
  })

  it('cookie_click_id_wins_as_rung_one even when a newer click exists', () => {
    // Last click is the model, but an identifier the browser RETURNED beats a
    // newer click nothing ties to this buyer. Otherwise the strongest evidence
    // on the page would lose to the most recent noise.
    const decision = resolveAttribution(
      input({
        clicks: [click(), click({ id: 'click-newer', occurredAt: at(0.5), recipientIdentityKeys: [] })],
        signal: { clickIdFromCookie: 'click-one', clickIdFromQuery: null, cookiePresent: true },
      }),
    )
    expect(decision.rung).toBe(RUNG.COOKIE_CLICK_ID)
    expect(decision.clickId).toBe('click-one')
  })

  it('order_signal_click_id_wins_as_rung_two_when_cookie_absent', () => {
    const decision = resolveAttribution(
      input({
        signal: { clickIdFromCookie: null, clickIdFromQuery: 'click-one', cookiePresent: false },
      }),
    )
    expect(decision.decision).toBe('attributed')
    expect(decision.rung).toBe(RUNG.SIGNAL_CLICK_ID)
    expect(decision.clickId).toBe('click-one')
  })

  it('identity_match_resolves_phone_click_then_laptop_purchase_as_rung_three', () => {
    // The phone clicked; the laptop bought. No cookie and no identifier crossed
    // between them, and the only thing that did is the person.
    const decision = resolveAttribution(
      input({
        signal: { clickIdFromCookie: null, clickIdFromQuery: null, cookiePresent: false },
      }),
    )
    expect(decision.decision).toBe('attributed')
    expect(decision.rung).toBe(RUNG.RECIPIENT_IDENTITY)
    expect(decision.forwarded).toBe(false)
    expect(decision.explanation).toContain('change of device')
  })

  it('identity_match works on a hashed phone as well as an address', () => {
    const hash = 'a3f9c1b7e2d48506a3f9c1b7e2d48506a3f9c1b7e2d48506a3f9c1b7e2d48506'
    const decision = resolveAttribution(
      input({
        order: order({ buyerIdentityKeys: [phoneIdentityKey(hash)] }),
        clicks: [click({ recipientIdentityKeys: [phoneIdentityKey(hash)] })],
      }),
    )
    expect(decision.rung).toBe(RUNG.RECIPIENT_IDENTITY)
  })

  it('stripped_query_string_still_resolves_because_code_carries_identifiers', () => {
    /*
     * The messaging app removed every parameter, so the order carries no query
     * identifier at all. The click row still exists, because the CODE was in
     * the path and the redirect booked it, and the cookie it set is what
     * resolves the sale. Nothing about the campaign, channel, partner or
     * recipient came from the query at any point.
     */
    const stripped = readClickIdentifiers(new URLSearchParams(''))
    expect(stripped).toEqual({ clickId: null, campaignId: null, channelCode: null })

    const decision = resolveAttribution(
      input({
        signal: { clickIdFromCookie: 'click-one', clickIdFromQuery: null, cookiePresent: true },
      }),
    )
    expect(decision.rung).toBe(RUNG.COOKIE_CLICK_ID)
    expect(decision.campaignId).toBe('campaign-one')
    expect(decision.channelCode).toBe('email')
    expect(decision.recipientId).toBe('recipient-one')
  })

  it('forwarded_link_attributes_campaign_and_marks_recipient_forwarded', () => {
    const decision = resolveAttribution(
      input({
        order: order({ buyerIdentityKeys: [emailIdentityKey(FRIEND)] }),
        signal: { clickIdFromCookie: 'click-one', clickIdFromQuery: null, cookiePresent: true },
      }),
    )
    expect(decision.decision).toBe('attributed')
    expect(decision.campaignId).toBe('campaign-one')
    expect(decision.channelCode).toBe('email')
    expect(decision.forwarded).toBe(true)
    // The recipient is still recorded, as the person the link was SENT to,
    // never as the person who bought.
    expect(decision.recipientId).toBe('recipient-one')
    expect(decision.explanation).toContain('passed on')
  })

  it('click_outside_configured_window_does_not_attribute', () => {
    const decision = resolveAttribution(
      input({
        clicks: [click({ occurredAt: at(31) })],
        signal: { clickIdFromCookie: 'click-one', clickIdFromQuery: null, cookiePresent: true },
      }),
    )
    expect(decision.decision).toBe('none')
    expect(decision.rung).toBe(RUNG.NONE)
    expect(decision.reason).toBe(NONE_REASON.ONLY_OUTSIDE_WINDOW)
  })

  it('a click in the FUTURE of the order never attributes', () => {
    // Clock skew, a replayed row or a hand edited timestamp. A sale cannot have
    // been caused by something that had not happened yet.
    const decision = resolveAttribution(
      input({
        clicks: [click({ occurredAt: new Date(Date.parse(ORDER_AT) + DAY).toISOString() })],
        signal: { clickIdFromCookie: 'click-one', clickIdFromQuery: null, cookiePresent: true },
      }),
    )
    expect(decision.decision).toBe('none')
  })

  it('no_click_and_no_identity_returns_none_with_reason', () => {
    const decision = resolveAttribution(input({ clicks: [], order: order({ buyerIdentityKeys: [] }) }))
    expect(decision.decision).toBe('none')
    expect(decision.rung).toBe(RUNG.NONE)
    expect(decision.reason).toBe(NONE_REASON.NO_CLICK_AT_ALL)
    expect(decision.explanation).toBe(NONE_REASON_SENTENCE[NONE_REASON.NO_CLICK_AT_ALL])
  })

  it('two_candidate_clicks_resolve_by_chosen_model_deterministically', () => {
    const older = click({ id: 'click-older', occurredAt: at(9) })
    const newer = click({ id: 'click-newer', occurredAt: at(3) })
    const forwards = resolveAttribution(input({ clicks: [older, newer] }))
    const backwards = resolveAttribution(input({ clicks: [newer, older] }))
    // Last click is the chosen model, so the newer one wins, and the order the
    // rows arrived in cannot change the answer.
    expect(forwards.clickId).toBe('click-newer')
    expect(backwards.clickId).toBe('click-newer')
  })

  it('two clicks with the SAME timestamp still resolve the same way every time', () => {
    const a = click({ id: 'click-aaa', occurredAt: at(4) })
    const b = click({ id: 'click-bbb', occurredAt: at(4) })
    expect(resolveAttribution(input({ clicks: [a, b] })).clickId).toBe(
      resolveAttribution(input({ clicks: [b, a] })).clickId,
    )
  })

  it('confidence_below_one_only_on_rung_four', () => {
    const rungFour = resolveAttribution(
      input({
        order: order({ buyerIdentityKeys: [emailIdentityKey('lane-b-ga3-stranger@eventlinqs.test')] }),
        clicks: [click({ recipientId: null, recipientIdentityKeys: [] })],
      }),
    )
    expect(rungFour.rung).toBe(RUNG.CAMPAIGN_WINDOW)
    expect(rungFour.confidence).toBe(0.5)
    expect(rungFour.confidence).toBeLessThan(1)

    for (const decision of [
      resolveAttribution(input({ signal: { clickIdFromCookie: 'click-one', clickIdFromQuery: null, cookiePresent: true } })),
      resolveAttribution(input({ signal: { clickIdFromCookie: null, clickIdFromQuery: 'click-one', cookiePresent: false } })),
      resolveAttribution(input()),
      resolveAttribution(input({ clicks: [] })),
    ]) {
      expect(decision.confidence).toBe(1)
    }
  })

  it('explanation_sentence_names_the_rung_and_the_inputs', () => {
    const decision = resolveAttribution(
      input({ signal: { clickIdFromCookie: 'click-one', clickIdFromQuery: null, cookiePresent: true } }),
    )
    expect(decision.explanation).toContain('Lane B spring nights')
    expect(decision.explanation).toContain('Email')
    // The date of the click, the gap to the order and the window are all in it,
    // because "our model attributed it" is not an answer anybody accepts.
    expect(decision.explanation).toMatch(/\d+ days before/)
    expect(decision.explanation).toContain('30 days window')
    // The click's own date, formatted by the platform's one date helper rather
    // than by this item, so a change to the house format does not fail here.
    expect(decision.explanation).toMatch(/\d{1,2} [A-Z][a-z]+ 2026/)
  })

  it('every rung has a name a person can read', () => {
    for (const rung of Object.values(RUNG)) {
      expect(RUNG_NAME[rung].length).toBeGreaterThan(0)
    }
  })

  it('one_click_backs_one_billable_sale_at_the_identity_rung', () => {
    /*
     * The measurement in scripts/verify/ga3-attribution-model-comparison.mjs
     * found this: a person who buys twice on one event inside the window
     * matches the same click both times, and billing both is a double charge on
     * one message. The first sale takes it; the second falls to rung 4, is
     * recorded, and is not billed.
     */
    const first = resolveAttribution(input())
    expect(first.rung).toBe(RUNG.RECIPIENT_IDENTITY)

    const second = resolveAttribution(input({ spentClickIds: ['click-one'] }))
    expect(second.rung).toBe(RUNG.CAMPAIGN_WINDOW)
    expect(decisionCouldBeBillable(second)).toBe(false)
  })

  it('a spent click does NOT demote rung one or rung two, because those carry evidence', () => {
    // Two orders cannot both hold the same identifier, so "already spent" can
    // never be the right answer for an order that is carrying it.
    const decision = resolveAttribution(
      input({
        spentClickIds: ['click-one'],
        signal: { clickIdFromCookie: 'click-one', clickIdFromQuery: null, cookiePresent: true },
      }),
    )
    expect(decision.rung).toBe(RUNG.COOKIE_CLICK_ID)
  })

  it('the capture switch being off is a recorded reason, never a missing record', () => {
    const decision = resolveAttribution(input({ clicks: [], captureDisabled: true }))
    expect(decision.decision).toBe('none')
    expect(decision.reason).toBe(NONE_REASON.CAPTURE_DISABLED)
    expect(decision.explanation).toContain('switched off')
  })

  it('every candidate click is recorded, including the ones that lost', () => {
    const decision = resolveAttribution(
      input({
        clicks: [click({ id: 'click-in', occurredAt: at(2) }), click({ id: 'click-out', occurredAt: at(40) })],
      }),
    )
    expect(decision.candidateClicks.map(c => c.clickId).sort()).toEqual(['click-in', 'click-out'])
    expect(decision.candidateClicks.find(c => c.clickId === 'click-out')?.insideWindow).toBe(false)
  })

  it('a per campaign window overrides the default', () => {
    const tight = resolveAttribution(input({ clicks: [click({ occurredAt: at(5), campaignWindowDays: 3 })] }))
    expect(tight.decision).toBe('none')
    const wide = resolveAttribution(input({ clicks: [click({ occurredAt: at(5), campaignWindowDays: 60 })] }))
    expect(wide.decision).toBe('attributed')
  })

  it('the resolver is pure: the same input twice gives an identical answer', () => {
    const once = resolveAttribution(input())
    const twice = resolveAttribution(input())
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice))
  })
})

describe('GA3 acceptance 2: reversal and billable', () => {
  const billableAttribution = { decision: 'attributed' as const, rung: RUNG.COOKIE_CLICK_ID }

  it('refund_sets_billable_false', () => {
    expect(isBillable({ ...billableAttribution, reversalCount: 0 })).toBe(true)
    expect(isBillable({ ...billableAttribution, reversalCount: 1 })).toBe(false)
    const owed = reversalOwedForOrderState({ status: 'refunded', refundedCents: 2500, totalCents: 2500 })
    expect(owed).toEqual({ reason: REVERSAL_REASON.REFUND, amountCents: 2500 })
  })

  it('chargeback_sets_billable_false', () => {
    // A chargeback is a reversal like any other as far as billing is concerned:
    // any reversal row at all takes the sale off the invoice.
    expect(isBillable({ ...billableAttribution, reversalCount: 1 })).toBe(false)
    expect(isReversalReason(REVERSAL_REASON.CHARGEBACK)).toBe(true)
    expect(REVERSAL_REASON_SENTENCE[REVERSAL_REASON.CHARGEBACK]).toContain('disputed')
  })

  it('reversal_after_billing_still_flips_billable_at_read_time', () => {
    /*
     * The whole point of computing billable from the reversal table rather than
     * freezing it at resolution: a chargeback that lands three months after the
     * invoice corrects the number with no backfill, because the answer is
     * recomputed from the reversals that exist now.
     */
    const before = isBillable({ ...billableAttribution, reversalCount: 0 })
    const after = isBillable({ ...billableAttribution, reversalCount: 1 })
    expect(before).toBe(true)
    expect(after).toBe(false)
  })

  it('reversal_on_unattributed_order_is_recorded_and_harmless', () => {
    // An order nothing credited cannot become less billable, and a reversal
    // against it must not throw, because refunds do not check our books first.
    expect(isBillable({ decision: 'none', rung: RUNG.NONE, reversalCount: 1 })).toBe(false)
    expect(isBillable({ decision: 'none', rung: RUNG.NONE, reversalCount: 0 })).toBe(false)
  })

  it('multiple_reversals_on_one_order_do_not_duplicate_the_attribution_row', () => {
    // The attribution row is keyed by order id, so there is exactly one no
    // matter how many reversals arrive, and each of them gives the same answer.
    for (const count of [1, 2, 7]) {
      expect(isBillable({ ...billableAttribution, reversalCount: count })).toBe(false)
    }
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain('order_id uuid primary key references public.orders(id)')
    expect(sql).toContain('unique (order_id, reason, source)')
  })

  it('rung four is never billable, which is what the measurement forced', () => {
    expect(isBillable({ decision: 'attributed', rung: RUNG.CAMPAIGN_WINDOW, reversalCount: 0 })).toBe(false)
    expect(isBillable({ decision: 'attributed', rung: RUNG.RECIPIENT_IDENTITY, reversalCount: 0 })).toBe(true)
  })

  it('a partial refund takes the WHOLE sale off the invoice', () => {
    const owed = reversalOwedForOrderState({ status: 'partially_refunded', refundedCents: 500, totalCents: 2500 })
    expect(owed).toEqual({ reason: REVERSAL_REASON.REFUND, amountCents: 500 })
    expect(isBillable({ ...billableAttribution, reversalCount: 1 })).toBe(false)
  })

  it('a fully refunded order with no refund row yet still reverses the full amount', () => {
    const owed = reversalOwedForOrderState({ status: 'refunded', refundedCents: 0, totalCents: 2500 })
    expect(owed?.amountCents).toBe(2500)
  })

  it('an order that never completed owes NO reversal, because nothing was taken back', () => {
    for (const status of ['pending', 'cancelled', 'expired']) {
      expect(reversalOwedForOrderState({ status, refundedCents: 0, totalCents: 2500 })).toBeNull()
    }
    // It is excluded from an invoice by the order state instead, which the
    // invoice view joins.
    expect(isCompletedSale('expired')).toBe(false)
    expect(isCompletedSale('confirmed')).toBe(true)
    expect(isCompletedSale('partially_refunded')).toBe(true)
    expect(isCompletedSale('refunded')).toBe(false)
  })

  it('the billing definition of a sale is NOT the gross sales definition', () => {
    /*
     * src/lib/broadcast/sales-attribution.ts counts a refunded ticket as SOLD,
     * correctly, because it answers how many tickets an event sold. Importing
     * that constant here would have billed every refund.
     */
    const sales = readFileSync(join(ROOT, 'src', 'lib', 'broadcast', 'sales-attribution.ts'), 'utf8')
    expect(sales).toContain("export const SOLD_STATUSES = ['confirmed', 'partially_refunded', 'refunded']")
    expect(COMPLETED_SALE_STATUSES).not.toContain('refunded')
  })

  it('the TypeScript billable rule and the SQL one say the same thing', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    // Same two clauses, in the same order, in the function the trigger calls.
    expect(sql).toContain("select p_decision = 'attributed'")
    expect(sql).toContain('and p_rung <= 3')
    expect(sql).toContain('and not exists (')
    expect(sql).toContain('from public.marketing_attribution_reversal r where r.order_id = p_order_id')
  })
})

describe('GA3 acceptance 3: the database refuses a second record, not the application', () => {
  it('order_id is the PRIMARY KEY of marketing_attribution', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain('order_id uuid primary key references public.orders(id) on delete cascade')
  })

  it('no application code writes billable, because two triggers compute it', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain('before insert or update on public.marketing_attribution')
    expect(sql).toContain('after insert or delete on public.marketing_attribution_reversal')
    for (const file of readdirSync(LIB)) {
      if (!file.endsWith('.ts')) continue
      const source = readFileSync(join(LIB, file), 'utf8')
      /*
       * READING billable is fine and every screen does it. SETTING it is not,
       * so the scan looks only inside what is handed to insert, upsert or
       * update, which is the only place a value can be typed into the column.
       */
      for (const payload of source.matchAll(/\.(insert|upsert|update)\(\s*\{([\s\S]*?)\}/g)) {
        expect(payload[2], `${file} sets billable in a ${payload[1]} payload`).not.toContain('billable')
      }
    }
  })

  it('the unique constraints that stop a sale being credited twice all exist', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain('unique (campaign_id, audience_member_id, channel_code)')
    expect(sql).toContain('unique (order_id, reason, source)')
    expect(sql).toContain('foreign key (recipient_id, campaign_id)')
  })
})

describe('GA3 acceptance 9: nothing this item adds writes a forbidden literal', () => {
  const addedFiles = [
    ...readdirSync(LIB).filter(f => f.endsWith('.ts')).map(f => join(LIB, f)),
    join(ROOT, 'src', 'components', 'growth', 'click-identifier-relay.tsx'),
    join(ROOT, 'src', 'app', 'm', '[code]', 'route.ts'),
  ]

  it('every file this item adds exists where the test says it does', () => {
    for (const file of addedFiles) expect(existsSync(file), file).toBe(true)
  })

  it('no channel code is written as a literal anywhere in the item', () => {
    /*
     * The five channel codes are seeded by the migration and read from
     * marketing_channel. A literal here is how a sixth channel comes to exist
     * in code and not in the database.
     */
    const CHANNEL_CODES = ['email', 'sms', 'partner', 'social', 'direct']
    for (const file of addedFiles) {
      const source = readFileSync(file, 'utf8')
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(String.fromCharCode(10))
        .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
        .join(String.fromCharCode(10))
      for (const channel of CHANNEL_CODES) {
        expect(code, `${file} names the channel code ${channel} as a literal`).not.toContain(`'${channel}'`)
      }
    }
  })

  it('no window length, cookie lifetime or confidence is written as a literal', () => {
    // Read from marketing_attribution_config. The ONE exception is config.ts,
    // which carries the seeded fallback and is asserted against the migration
    // below, so the two can never say different things.
    for (const file of addedFiles) {
      if (file.endsWith(join('attribution', 'config.ts'))) continue
      const source = readFileSync(file, 'utf8')
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(String.fromCharCode(10))
        .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
        .join(String.fromCharCode(10))
      expect(code, `${file} writes the attribution window as a literal`).not.toMatch(/attributionWindowDays\s*[=:]\s*\d/)
      expect(code, `${file} writes the cookie lifetime as a literal`).not.toMatch(/clickCookieDays\s*[=:]\s*\d/)
      // An assignment or an object property, never a ternary's own colon:
      // `config.rungFourConfidence : 1` is a READ of the configured value.
      expect(code, `${file} writes the rung four confidence as a literal`).not.toMatch(
        /(?<!\.)\brungFourConfidence\s*[=:]\s*[\d.]/,
      )
    }
  })

  it('no fee, rate or percentage is named anywhere in the item', () => {
    for (const file of addedFiles) {
      const source = readFileSync(file, 'utf8')
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(String.fromCharCode(10))
        .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
        .join(String.fromCharCode(10))
      expect(code, `${file} names a fee`).not.toMatch(/fee_?[Pp]ercent|percentage|\d+(\.\d+)?%/)
    }
  })

  it('the tracked link route is written down in EXACTLY one file', () => {
    /*
     * A Next.js route is the one thing that cannot be read from configuration,
     * because the folder name IS the address. So it is written once, in
     * route-config.ts, and this proves nothing else in the item repeats it.
     */
    const holders = addedFiles.filter(file => {
      if (file.endsWith(join('attribution', 'route-config.ts'))) return false
      return readFileSync(file, 'utf8').includes(`'${TRACKED_LINK_PREFIX}/`)
    })
    expect(holders).toEqual([])
    expect(trackedLinkPath('abcdefgh1234')).toBe(`${TRACKED_LINK_PREFIX}/abcdefgh1234`)
  })

  it('the event path is composed in one place and only at mint time', () => {
    expect(eventTargetPath('lane-b-ga3-event')).toBe('/events/lane-b-ga3-event')
    expect(() => eventTargetPath('   ')).toThrow()
    const record = readFileSync(join(LIB, 'record.ts'), 'utf8')
    expect(record).toContain('eventTargetPath(params.eventSlug)')
    // The redirect reads the STORED path, so a poster already on a wall keeps
    // pointing where it pointed when it was printed.
    const route = readFileSync(join(ROOT, 'src', 'app', 'm', '[code]', 'route.ts'), 'utf8')
    expect(route).toContain('booked.targetPath')
    expect(route).not.toContain('eventTargetPath')
  })

  it('the seeded fallback config equals what the migration actually seeds', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain(
      `(true, '${SEEDED_ATTRIBUTION_CONFIG.modelName}', '${SEEDED_ATTRIBUTION_CONFIG.modelVersion}', ` +
        `${SEEDED_ATTRIBUTION_CONFIG.attributionWindowDays}, ${SEEDED_ATTRIBUTION_CONFIG.clickCookieDays}, ` +
        `${SEEDED_ATTRIBUTION_CONFIG.rungFourConfidence}, ${SEEDED_ATTRIBUTION_CONFIG.linkCodeLength})`,
    )
  })

  it('the chosen model in configuration is the one the comparison chose', () => {
    const comparison = readFileSync(
      join(ROOT, 'scripts', 'verify', 'ga3-attribution-model-comparison.mjs'),
      'utf8',
    )
    expect(comparison).toContain(`chosen: '${SEEDED_ATTRIBUTION_CONFIG.modelName}'`)
    expect(comparison).toContain(`version: '${SEEDED_ATTRIBUTION_CONFIG.modelVersion}'`)
  })
})

describe('GA3: the link code, the cookies and the query copy', () => {
  it('a minted code is opaque, lowercase and the configured length', () => {
    const code = mintLinkCode(SEEDED_ATTRIBUTION_CONFIG.linkCodeLength)
    expect(code).toHaveLength(SEEDED_ATTRIBUTION_CONFIG.linkCodeLength)
    expect(isValidLinkCode(code)).toBe(true)
    expect(code).toBe(code.toLowerCase())
  })

  it('a thousand codes are all distinct and all valid', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i += 1) {
      const code = mintLinkCode(12)
      expect(isValidLinkCode(code)).toBe(true)
      seen.add(code)
    }
    expect(seen.size).toBe(1000)
  })

  it('a code length the database would refuse is refused before the write', () => {
    for (const length of [0, 7, 33, 4.5, Number.NaN]) {
      expect(() => mintLinkCode(length)).toThrow()
    }
  })

  it('an invalid code shape never resolves', () => {
    for (const bad of ['', 'short', 'HASUPPER1234', 'has-a-dash-1', 'a'.repeat(33), '../../etc']) {
      expect(isValidLinkCode(bad), bad).toBe(false)
    }
  })

  it('the click cookie only ever accepts a uuid', () => {
    expect(readClickCookie('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('3f2504e0-4f89-11d3-9a0c-0305e82c3301')
    expect(readClickCookie('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBe('3f2504e0-4f89-11d3-9a0c-0305e82c3301')
    for (const bad of ['', null, undefined, 'not-a-uuid', "'; drop table orders; --", 'a'.repeat(200)]) {
      expect(readClickCookie(bad)).toBeNull()
    }
  })

  it('the two cookies are different names, because rungs one and two are different evidence', () => {
    expect(CLICK_COOKIE).not.toBe(CLICK_QUERY_COOKIE)
  })

  it('the cookie is set on the same terms as the three the platform already sets', () => {
    const options = clickCookieOptions(30)
    expect(options).toEqual({
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
    })
    expect(() => clickCookieOptions(0)).toThrow()
  })

  it('the query copy round trips and is only ever a convenience', () => {
    const target = appendClickIdentifiers('/events/lane-b-ga3-event', {
      clickId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      campaignId: 'campaign-one',
      channelCode: 'email',
    })
    const read = readClickIdentifiers(new URL(target, 'https://example.test').searchParams)
    expect(read.clickId).toBe('3f2504e0-4f89-11d3-9a0c-0305e82c3301')
    expect(read.campaignId).toBe('campaign-one')
    expect(read.channelCode).toBe('email')
    expect(Object.values(CLICK_QUERY_KEYS)).toHaveLength(3)
  })

  it('an existing query string on the target is preserved rather than replaced', () => {
    const target = appendClickIdentifiers('/events/lane-b-ga3-event?tier=early', {
      clickId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      campaignId: 'campaign-one',
      channelCode: 'email',
    })
    expect(target).toContain('tier=early')
    expect(target).toContain(`${CLICK_QUERY_KEYS.click}=`)
  })

  it('a crafted query value is bounded and never trusted', () => {
    const q = new URLSearchParams({ [CLICK_QUERY_KEYS.click]: 'x'.repeat(500) })
    expect(readClickIdentifiers(q).clickId).toBeNull()
  })
})

describe('GA3: the reversal switch is one governed flag with a dated decision', () => {
  const FLAG = 'marketing_attribution_capture_enabled'

  it('the switch is registered, defaulted and dated', () => {
    expect(BROADCAST_FLAGS).toContain(FLAG)
    expect(BROADCAST_FLAG_DEFAULTS[FLAG]).toBe(true)
    expect(BROADCAST_FLAG_DECISIONS[FLAG]).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('the decision says what stays working when it is switched off', () => {
    const decision = BROADCAST_FLAG_DECISIONS[FLAG]
    expect(decision).toContain('redirecting')
    expect(decision).toContain('intact')
  })
})

describe('GA3 acceptance 8: the copy gate laws hold in every sentence this item can print', () => {
  const sentences = [
    ...Object.values(NONE_REASON_SENTENCE),
    ...Object.values(REVERSAL_REASON_SENTENCE),
    ...Object.values(RUNG_NAME),
    resolveAttribution(input({ signal: { clickIdFromCookie: 'click-one', clickIdFromQuery: null, cookiePresent: true } }))
      .explanation,
    resolveAttribution(input({ signal: { clickIdFromCookie: null, clickIdFromQuery: 'click-one', cookiePresent: false } }))
      .explanation,
    resolveAttribution(input()).explanation,
    resolveAttribution(
      input({ order: order({ buyerIdentityKeys: [emailIdentityKey('lane-b-ga3-stranger@eventlinqs.test')] }), clicks: [click({ recipientId: null, recipientIdentityKeys: [] })] }),
    ).explanation,
    resolveAttribution(input({ order: order({ buyerIdentityKeys: [emailIdentityKey(FRIEND)] }), signal: { clickIdFromCookie: 'click-one', clickIdFromQuery: null, cookiePresent: true } }))
      .explanation,
  ]

  it('no em dash, no en dash and no hyphen with spaces around it', () => {
    for (const sentence of sentences) {
      expect(sentence, sentence).not.toContain(String.fromCharCode(8212))
      expect(sentence, sentence).not.toContain(String.fromCharCode(8211))
      expect(sentence, sentence).not.toMatch(/ - /)
    }
  })

  it('no exclamation mark, and no American spelling of the words this item uses', () => {
    for (const sentence of sentences) {
      expect(sentence, sentence).not.toContain('!')
      expect(sentence, sentence).not.toMatch(/\b(organiz|recogniz|personaliz|analyz)/i)
      expect(sentence, sentence).not.toMatch(/\bcolor\b|\bcenter\b/i)
    }
  })

  it('the banned word "culture" appears in nothing this item prints', () => {
    for (const sentence of sentences) {
      expect(sentence.toLowerCase(), sentence).not.toContain('cultur')
    }
  })
})
