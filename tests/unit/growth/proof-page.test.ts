import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  FIGURE,
  LEDGER_BORDER,
  UNAVAILABLE,
  UNAVAILABLE_SENTENCE,
  composeProof,
  everyFigureIsSourced,
  snapshotPayload,
  type ProofInput,
  type ProofOrder,
} from '@/lib/proof/compose'
import { feeBasisSentence, presentAll, producedByUsLines } from '@/lib/proof/present'

/**
 * GA5. THE PROOF PAGE, HELD TO THE ONE RULE IT EXISTS FOR.
 *
 * The aggregation is pure, so every figure is walked here at its boundary. What
 * is NOT decided here is whether the page changes when a row on TEST changes,
 * whether a snapshot survives a later reversal, and how the three states look at
 * three widths: those are driven, by name, in
 * scripts/verify/ga5-proof-page-drive.mjs.
 */

const ROOT = join(__dirname, '..', '..', '..')
const LIB = join(ROOT, 'src', 'lib', 'proof')
const PAGE = join(ROOT, 'src', 'app', 'admin', '(authed)', 'campaigns', '[id]', 'proof', 'page.tsx')
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20260913000080_proof_page.sql')

const CAMPAIGN = 'campaign-lane-b-ga5'
const OTHER_CAMPAIGN = 'campaign-lane-b-other'

function order(overrides: Partial<ProofOrder> = {}): ProofOrder {
  return {
    id: `order-${Math.random().toString(36).slice(2, 10)}`,
    reference: 'EL-LANEBGA5',
    totalCents: 4500,
    status: 'confirmed',
    attribution: { campaignId: CAMPAIGN, decision: 'attributed', billable: true, rung: 1, explanation: 'Credited to the lane B campaign.' },
    reversals: [],
    ...overrides,
  }
}

function input(overrides: Partial<ProofInput> = {}): ProofInput {
  return {
    campaignId: CAMPAIGN,
    orders: [order()],
    sends: [{ id: 'send-one', channelCode: 'email', state: 'sent' }],
    channelCostCents: { email: 2, sms: 6 },
    commissionPercent: 10,
    ledgerNetCents: 4500,
    ledgerEntryIds: ['1'],
    ...overrides,
  }
}

describe('GA5 acceptance 1: the aggregation', () => {
  it('produced_by_us_counts_only_billable_attributed_orders', () => {
    const result = composeProof(
      input({
        orders: [
          order({ id: 'ours-billable', totalCents: 4500 }),
          // Attributed to us but on a rung we do not charge on, so not billable.
          order({
            id: 'ours-rung-four',
            totalCents: 9900,
            attribution: { campaignId: CAMPAIGN, decision: 'attributed', billable: false, rung: 4, explanation: 'An observation.' },
          }),
          // Somebody else's campaign.
          order({
            id: 'theirs',
            totalCents: 7700,
            attribution: { campaignId: OTHER_CAMPAIGN, decision: 'attributed', billable: true, rung: 1, explanation: 'Theirs.' },
          }),
          // No campaign produced it.
          order({
            id: 'organic',
            totalCents: 3300,
            attribution: { campaignId: null, decision: 'none', billable: false, rung: 5, explanation: 'Nothing credited.' },
          }),
          // No attribution record at all, which should be impossible and is
          // still counted as not ours rather than crashing.
          order({ id: 'unrecorded', totalCents: 1100, attribution: null }),
        ],
      }),
    )
    expect(result.figures[FIGURE.PRODUCED_BY_US].value).toBe(4500)
    expect(result.figures[FIGURE.PRODUCED_BY_US_ORDERS].value).toBe(1)
    expect(result.figures[FIGURE.PRODUCED_BY_US].source?.rowIds).toEqual(['ours-billable'])
  })

  it('reversed_order_is_removed_from_produced_by_us_and_counted_under_reversals', () => {
    /*
     * GA3 makes a reversed order not billable at the database, so it leaves
     * produced by us by the same rule that put it there. What this asserts is
     * that it does not simply VANISH: it appears under reversals, valued, which
     * is what stops a fee line silently ignoring a refund.
     */
    const result = composeProof(
      input({
        orders: [
          order({ id: 'kept', totalCents: 4500 }),
          order({
            id: 'given-back',
            totalCents: 6000,
            attribution: { campaignId: CAMPAIGN, decision: 'attributed', billable: false, rung: 1, explanation: 'Credited then refunded.' },
            reversals: [{ id: 'rev-one', amountCents: 6000, reason: 'refund' }],
          }),
        ],
      }),
    )
    expect(result.figures[FIGURE.PRODUCED_BY_US].value).toBe(4500)
    expect(result.figures[FIGURE.REVERSED].value).toBe(6000)
    expect(result.figures[FIGURE.REVERSED_ORDERS].value).toBe(1)
    expect(result.figures[FIGURE.REVERSED].source?.rowIds).toEqual(['rev-one'])
    expect(result.reversalRows[0].reason).toBe('refund')
  })

  it('produced_elsewhere_counts_none_and_other_campaign_orders_in_the_window', () => {
    const result = composeProof(
      input({
        orders: [
          order({ id: 'ours', totalCents: 4500 }),
          order({
            id: 'theirs',
            totalCents: 7700,
            attribution: { campaignId: OTHER_CAMPAIGN, decision: 'attributed', billable: true, rung: 1, explanation: 'Theirs.' },
          }),
          order({
            id: 'organic',
            totalCents: 3300,
            attribution: { campaignId: null, decision: 'none', billable: false, rung: 5, explanation: 'Nothing credited.' },
          }),
        ],
      }),
    )
    expect(result.figures[FIGURE.PRODUCED_ELSEWHERE].value).toBe(7700 + 3300)
    expect(result.figures[FIGURE.PRODUCED_ELSEWHERE_ORDERS].value).toBe(2)
  })

  it('fee_due_equals_fee_configuration_applied_to_billable_revenue', () => {
    const result = composeProof(input({ orders: [order({ totalCents: 10000 })], commissionPercent: 10 }))
    expect(result.figures[FIGURE.PRODUCED_BY_US].value).toBe(10000)
    expect(result.figures[FIGURE.FEE_DUE].value).toBe(1000)
  })

  it('fee_due_changes_when_fee_configuration_changes_with_no_deploy', () => {
    const orders = [order({ totalCents: 10000 })]
    const at10 = composeProof(input({ orders, commissionPercent: 10 }))
    const at15 = composeProof(input({ orders, commissionPercent: 15 }))
    expect(at10.figures[FIGURE.FEE_DUE].value).toBe(1000)
    expect(at15.figures[FIGURE.FEE_DUE].value).toBe(1500)
    // And a campaign with no configured rate is told so rather than defaulted.
    const none = composeProof(input({ orders, commissionPercent: null }))
    expect(none.figures[FIGURE.FEE_DUE].value).toBeNull()
    expect(none.figures[FIGURE.FEE_DUE].unavailable?.reason).toBe(UNAVAILABLE.NO_COMMISSION_RULE)
  })

  it('cost_per_sale_equals_recorded_send_cost_divided_by_billable_sales', () => {
    const result = composeProof(
      input({
        orders: [order({ id: 'a' }), order({ id: 'b' })],
        // Ten emails at two cents and five messages on a channel at six cents.
        sends: [
          ...Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, channelCode: 'email', state: 'sent' })),
          ...Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, channelCode: 'sms', state: 'delivered' })),
        ],
      }),
    )
    // (10 * 2 + 5 * 6) / 2 sales = 25 cents a sale.
    expect(result.figures[FIGURE.COST_PER_SALE].value).toBe(25)
    expect(result.figures[FIGURE.SENDS_DISPATCHED].value).toBe(15)
  })

  it('a message that never left is not counted as a cost', () => {
    const result = composeProof(
      input({
        orders: [order()],
        sends: [
          { id: 'left', channelCode: 'email', state: 'sent' },
          { id: 'still-draft', channelCode: 'email', state: 'draft' },
          { id: 'skipped', channelCode: 'email', state: 'skipped' },
        ],
      }),
    )
    expect(result.figures[FIGURE.SENDS_DISPATCHED].value).toBe(1)
    expect(result.figures[FIGURE.COST_PER_SALE].value).toBe(2)
  })

  it('zero_billable_sales_yields_no_division_and_a_named_state', () => {
    const result = composeProof(
      input({
        orders: [
          order({
            attribution: { campaignId: null, decision: 'none', billable: false, rung: 5, explanation: 'Nothing credited.' },
          }),
        ],
      }),
    )
    expect(result.figures[FIGURE.COST_PER_SALE].value).toBeNull()
    expect(result.figures[FIGURE.COST_PER_SALE].unavailable?.reason).toBe(UNAVAILABLE.NO_BILLABLE_SALES)
    // The fee is still a number: nothing produced means a fee of nothing, which
    // is a fact rather than a gap.
    expect(result.figures[FIGURE.FEE_DUE].value).toBe(0)
  })

  it('a channel with no recorded cost per send withholds cost per sale by name', () => {
    const result = composeProof(input({ channelCostCents: { email: null } }))
    expect(result.figures[FIGURE.COST_PER_SALE].value).toBeNull()
    expect(result.figures[FIGURE.COST_PER_SALE].unavailable?.reason).toBe(UNAVAILABLE.NO_SEND_COST)
  })

  it('missing_ledger_figure_withholds_fee_due_and_names_the_border', () => {
    const result = composeProof(input({ ledgerNetCents: null, ledgerEntryIds: [] }))
    expect(result.figures[FIGURE.LEDGER_NET].value).toBeNull()
    expect(result.figures[FIGURE.LEDGER_NET].unavailable?.reason).toBe(UNAVAILABLE.NO_LEDGER_SLOT)
    expect(result.figures[FIGURE.LEDGER_NET].unavailable?.border).toBe(LEDGER_BORDER)

    // And the fee is WITHHELD, not shown partial, naming the same border.
    expect(result.figures[FIGURE.FEE_DUE].value).toBeNull()
    expect(result.figures[FIGURE.FEE_DUE].unavailable?.reason).toBe(UNAVAILABLE.FEE_WITHHELD)
    expect(result.figures[FIGURE.FEE_DUE].unavailable?.border).toBe(LEDGER_BORDER)
    // The revenue itself is still shown: it is sourced, it is just not billed on.
    expect(result.figures[FIGURE.PRODUCED_BY_US].value).toBe(4500)
  })
})

describe('GA5 acceptance 4: every displayed figure carries its source', () => {
  it('every figure is either sourced or a stated absence, never a bare value', () => {
    for (const variant of [
      input(),
      input({ ledgerNetCents: null, ledgerEntryIds: [] }),
      input({ commissionPercent: null }),
      input({ orders: [] }),
      input({ sends: [] }),
      input({ channelCostCents: {} }),
    ]) {
      const result = composeProof(variant)
      const { ok, unsourced } = everyFigureIsSourced(result)
      expect(ok, `unsourced: ${unsourced.join(', ')}`).toBe(true)
    }
  })

  it('a figure with a value always names the rows or the query behind it', () => {
    const result = composeProof(input())
    for (const key of Object.keys(result.figures) as (keyof typeof result.figures)[]) {
      const figure = result.figures[key]
      if (figure.unavailable) continue
      expect(figure.source, String(key)).not.toBeNull()
      expect(figure.source?.query.length, String(key)).toBeGreaterThan(0)
    }
  })

  it('every registered figure key is actually produced', () => {
    const result = composeProof(input())
    for (const key of Object.values(FIGURE)) {
      expect(result.figures[key], key).toBeDefined()
    }
  })

  it('the snapshot payload carries a source for every figure, including the absent ones', () => {
    const payload = snapshotPayload(composeProof(input({ ledgerNetCents: null, ledgerEntryIds: [] })))
    for (const key of Object.keys(payload.figures)) {
      expect(payload.sources[key], key).toBeDefined()
    }
  })

  it('the evidence behind produced by us is one line per order with its own reason', () => {
    const result = composeProof(input({ orders: [order({ id: 'a', reference: 'EL-AAA' }), order({ id: 'b', reference: 'EL-BBB' })] }))
    const lines = producedByUsLines(result, 'AUD')
    expect(lines.map(l => l.reference)).toEqual(['EL-AAA', 'EL-BBB'])
    expect(lines[0].why.length).toBeGreaterThan(0)
    expect(lines[0].amount).toContain('45.00')
  })
})

describe('GA5: how the figures read', () => {
  it('money is written the Australian way, grouped and to the cent', () => {
    const figures = presentAll(composeProof(input({ orders: [order({ totalCents: 123456 })] })), 'AUD')
    expect(figures[FIGURE.PRODUCED_BY_US].display).toBe('$1,234.56')
  })

  it('an unavailable figure reads as a sentence, never as a zero or a dash', () => {
    const figures = presentAll(composeProof(input({ ledgerNetCents: null, ledgerEntryIds: [] })), 'AUD')
    expect(figures[FIGURE.FEE_DUE].unavailable).toBe(true)
    expect(figures[FIGURE.FEE_DUE].display).toBe(UNAVAILABLE_SENTENCE[UNAVAILABLE.FEE_WITHHELD])
    expect(figures[FIGURE.FEE_DUE].display).not.toMatch(/^[$\d-]/)
  })

  it('the fee basis is a sentence built from the configured rate, never a typed one', () => {
    expect(feeBasisSentence(10)).toContain('10 per cent')
    expect(feeBasisSentence(12.5)).toContain('12.5 per cent')
    expect(feeBasisSentence(null)).toContain('No commission rate is configured')
  })
})

describe('GA5 acceptance 3: nothing on this page is typed', () => {
  const codeOf = (file: string) =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split(String.fromCharCode(10))
      .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join(String.fromCharCode(10))

  it('the rendering path exists where this test says it does', () => {
    expect(existsSync(PAGE)).toBe(true)
    for (const file of ['compose.ts', 'present.ts', 'read.ts']) {
      expect(existsSync(join(LIB, file)), file).toBe(true)
    }
  })

  it('no currency and no percentage is written into the rendering path', () => {
    /*
     * THE ALLOWED EXCEPTIONS, LISTED HERE BY NAME as GA5 requires:
     *   - Tailwind class names, which are stripped before the scan, because a
     *     padding scale is not a figure.
     *   - `100` in compose.ts, which is the definition of "per cent" and not a
     *     rate: the RATE arrives from pricing_rules.
     *   - `0` and `1`, which are array and count arithmetic.
     * Nothing else may be a number in this path, and the registered guard
     * scripts/guards/proof-page-every-number-sourced.mjs fails the build on it.
     */
    for (const file of [PAGE, join(LIB, 'present.ts')]) {
      const code = codeOf(file)
      expect(code, `${file} names a currency`).not.toMatch(/['"`](?:AUD|USD|GBP|NZD|EUR)['"`]/)
      expect(code, `${file} writes a percentage`).not.toMatch(/\d+(?:\.\d+)?\s*%/)
    }
  })

  it('the page formats nothing itself: every string it shows comes from present.ts', () => {
    const page = codeOf(PAGE)
    expect(page).not.toContain('formatMoney')
    expect(page).not.toContain('toFixed')
    expect(page).not.toContain('Intl.NumberFormat')
  })

  it('the registered guard covers the same ground and is registered', () => {
    const guard = readFileSync(join(ROOT, 'scripts', 'guards', 'proof-page-every-number-sourced.mjs'), 'utf8')
    expect(guard).toContain('ALLOWED_NUMBERS')
    const registry = readFileSync(join(ROOT, 'scripts', 'guards', 'run-guards.mjs'), 'utf8')
    expect(registry).toContain("'scripts/guards/proof-page-every-number-sourced.mjs'")
  })

  it('the database refuses a snapshot holding a figure nothing sources', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain('create or replace function public.marketing_proof_every_figure_is_sourced')
    expect(sql).toContain('constraint marketing_proof_snapshot_every_figure_is_sourced')
    expect(sql).toContain('check (public.marketing_proof_every_figure_is_sourced(figures, sources))')
  })

  it('the commission is a pricing rule and not a second fee table', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain("'marketing_commission_percentage'")
    expect(sql).toContain('insert into public.pricing_rules')
    // And nothing in this item creates a table with a rate on it.
    for (const file of readdirSync(LIB)) {
      if (!file.endsWith('.ts')) continue
      const source = readFileSync(join(LIB, file), 'utf8')
      expect(source, `${file} resolves a rate itself`).not.toMatch(/commissionPercent\s*=\s*\d/)
    }
  })

  it('nothing in this item edits a lane A ledger, refund, webhook or payment file', () => {
    for (const file of readdirSync(LIB)) {
      if (!file.endsWith('.ts')) continue
      const source = readFileSync(join(LIB, file), 'utf8')
      // Reading the ledger is the whole point; writing to it is not.
      expect(source, `${file} writes to the ledger`).not.toMatch(/from\('ledger_(slots|entries)'\)[\s\S]{0,40}\.(insert|update|delete|upsert)/)
      expect(source, `${file} writes to orders`).not.toMatch(/from\('orders'\)[\s\S]{0,40}\.(insert|update|delete|upsert)/)
      expect(source, `${file} imports the lane C digest`).not.toContain('@/lib/notifications/')
    }
  })
})

describe('GA5 acceptance 7: the copy gate laws hold in every sentence this page can print', () => {
  const sentences = [
    ...Object.values(UNAVAILABLE_SENTENCE),
    feeBasisSentence(10),
    feeBasisSentence(null),
  ]

  it('no em dash, no en dash and no hyphen with spaces around it', () => {
    for (const sentence of sentences) {
      expect(sentence, sentence).not.toContain(String.fromCharCode(8212))
      expect(sentence, sentence).not.toContain(String.fromCharCode(8211))
      expect(sentence, sentence).not.toMatch(/ - /)
    }
  })

  it('no exclamation mark, and no American spelling', () => {
    for (const sentence of sentences) {
      expect(sentence, sentence).not.toContain('!')
      expect(sentence, sentence).not.toMatch(/\b(organiz|recogniz|personaliz|analyz)/i)
      expect(sentence, sentence).not.toMatch(/\bcolor\b|\bcenter\b/i)
    }
  })

  it('the banned word appears in nothing this page prints', () => {
    for (const sentence of sentences) {
      expect(sentence.toLowerCase(), sentence).not.toContain('cultur')
    }
  })
})
