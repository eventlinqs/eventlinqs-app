import { describe, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_GRACE_HOURS,
  DEFAULT_LOOKBACK_HOURS,
  classifySettledCharge,
  describeSettlementFindings,
  scanPlatformSettlement,
  settlementWindow,
  type SettledPlatformCharge,
} from '@/lib/payments/platform-settlement-reconcile'

/**
 * MONEY FIX A3 LAYER THREE, the behaviour half.
 *
 * The rule under test is the inverse of the item's literal wording, and the
 * reason is argued in the module header: under funds-holding EVERY ticket
 * charge is on the platform account, so the answerable question is which ones
 * are not recorded as owed onward to an organiser.
 *
 * THE WRITE ASSERTION IS THE IMPORTANT ONE. A reconciliation that repairs what
 * it finds destroys the evidence of how the money came to be adrift, so the
 * Supabase double below throws on every mutating verb rather than recording it.
 * A test that merely counted calls would pass while a write happened.
 */

interface LedgerRow {
  reference_id: string
}

interface OrderRow {
  id: string
  order_number: string | null
  organisation_id: string | null
  organisations: { name: string | null } | null
}

function buildClient(options: {
  ledgerRows?: LedgerRow[]
  ledgerError?: { message: string } | null
  orderRows?: OrderRow[]
  orderError?: { message: string } | null
}): { client: SupabaseClient; ledgerQueries: string[][] } {
  const ledgerQueries: string[][] = []

  const refuseWrite = (verb: string) => () => {
    throw new Error(
      `platform-settlement-reconcile called ${verb}(). This reconciliation must never write.`,
    )
  }

  const from = (table: string) => {
    const mutators = {
      insert: refuseWrite('insert'),
      update: refuseWrite('update'),
      upsert: refuseWrite('upsert'),
      delete: refuseWrite('delete'),
      rpc: refuseWrite('rpc'),
    }

    if (table === 'organiser_balance_ledger') {
      return {
        ...mutators,
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: (_column: string, values: string[]) => {
                ledgerQueries.push(values)
                return Promise.resolve({
                  data: options.ledgerError ? null : (options.ledgerRows ?? []),
                  error: options.ledgerError ?? null,
                })
              },
            }),
          }),
        }),
      }
    }

    if (table === 'orders') {
      return {
        ...mutators,
        select: () => ({
          in: () =>
            Promise.resolve({
              data: options.orderError ? null : (options.orderRows ?? []),
              error: options.orderError ?? null,
            }),
        }),
      }
    }

    throw new Error(`unexpected table ${table}`)
  }

  return { client: { from } as unknown as SupabaseClient, ledgerQueries }
}

function charge(overrides: Partial<SettledPlatformCharge> = {}): SettledPlatformCharge {
  return {
    chargeId: 'ch_test_1',
    balanceTransactionId: 'txn_test_1',
    paymentIntentId: 'pi_test_1',
    transferGroup: 'order-1',
    amountCents: 3600,
    currency: 'AUD',
    createdIso: '2026-09-10T02:00:00.000Z',
    description: 'Afro-Fusion Music Showcase',
    ...overrides,
  }
}

describe('classifySettledCharge', () => {
  test('a_charge_recorded_as_owed_onward_is_not_a_finding', () => {
    const verdict = classifySettledCharge(charge(), new Set(['order-1']))
    expect(verdict).toEqual({ outcome: 'owed_onward', orderId: 'order-1' })
  })

  test('a_ticket_charge_with_no_onward_record_is_unrouted', () => {
    const verdict = classifySettledCharge(charge(), new Set())
    expect(verdict).toEqual({ outcome: 'unrouted_ticket_charge', orderId: 'order-1' })
  })

  test('a_charge_with_no_transfer_group_is_unattributable', () => {
    const verdict = classifySettledCharge(charge({ transferGroup: null }), new Set(['order-1']))
    expect(verdict).toEqual({ outcome: 'unattributable_platform_charge' })
  })

  test('a_blank_transfer_group_is_unattributable_rather_than_an_order_called_nothing', () => {
    const verdict = classifySettledCharge(charge({ transferGroup: '   ' }), new Set(['   ']))
    expect(verdict).toEqual({ outcome: 'unattributable_platform_charge' })
  })
})

describe('settlementWindow', () => {
  test('the_window_ends_a_grace_period_before_now_so_todays_sales_are_not_judged', () => {
    const now = new Date('2026-09-19T12:00:00.000Z')
    const window = settlementWindow(now)
    expect(window.graceHours).toBe(DEFAULT_GRACE_HOURS)
    expect(window.untilIso).toBe('2026-09-19T06:00:00.000Z')
    const spanHours =
      (new Date(window.untilIso).getTime() - new Date(window.sinceIso).getTime()) / 3_600_000
    expect(spanHours).toBe(DEFAULT_LOOKBACK_HOURS)
  })
})

describe('scanPlatformSettlement', () => {
  test('a_healthy_day_produces_no_findings_and_no_review_queue_block', async () => {
    const { client } = buildClient({ ledgerRows: [{ reference_id: 'order-1' }] })
    const report = await scanPlatformSettlement(client, {
      listCharges: async () => [charge()],
      now: new Date('2026-09-19T12:00:00.000Z'),
    })
    expect(report.ok).toBe(true)
    expect(report.checked).toBe(1)
    expect(report.owedOnward).toBe(1)
    expect(report.findings).toEqual([])
    expect(describeSettlementFindings(report, '2026-09-19T12:00:00.000Z')).toBe('')
  })

  test('an_unrouted_ticket_charge_is_a_p0_naming_the_charge_id', async () => {
    const { client } = buildClient({
      ledgerRows: [],
      orderRows: [
        {
          id: 'order-1',
          order_number: 'EL-1001',
          organisation_id: 'org-mkl',
          organisations: { name: 'MKLStudios' },
        },
      ],
    })
    const report = await scanPlatformSettlement(client, {
      listCharges: async () => [charge()],
      now: new Date('2026-09-19T12:00:00.000Z'),
    })

    expect(report.ok).toBe(false)
    expect(report.findings).toHaveLength(1)
    const finding = report.findings[0]!
    expect(finding.kind).toBe('unrouted_ticket_charge')
    expect(finding.chargeId).toBe('ch_test_1')
    expect(finding.orderId).toBe('order-1')
    expect(finding.organisationName).toBe('MKLStudios')
    expect(finding.organisationId).toBe('org-mkl')
    expect(finding.orderNumber).toBe('EL-1001')
    expect(finding.why).toContain('ch_test_1')

    const block = describeSettlementFindings(report, '2026-09-19T12:00:00.000Z')
    expect(block).toContain('ch_test_1')
    expect(block).toContain('MKLStudios')
    expect(block).toContain('P0 MONEY')
    expect(block).toContain('NOTHING WAS REPAIRED')
  })

  test('an_unattributable_platform_charge_is_a_p0_naming_the_charge_id', async () => {
    const { client } = buildClient({ ledgerRows: [] })
    const report = await scanPlatformSettlement(client, {
      listCharges: async () => [
        charge({ chargeId: 'ch_orphan', transferGroup: null, amountCents: 203 }),
      ],
      now: new Date('2026-09-19T12:00:00.000Z'),
    })

    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]!.kind).toBe('unattributable_platform_charge')
    expect(report.findings[0]!.chargeId).toBe('ch_orphan')
    expect(report.findings[0]!.orderId).toBeNull()
    expect(describeSettlementFindings(report, '2026-09-19T12:00:00.000Z')).toContain('ch_orphan')
  })

  test('an_unreadable_ledger_refuses_to_judge_rather_than_calling_every_charge_unrouted', async () => {
    const { client } = buildClient({ ledgerError: { message: 'connection reset' } })
    await expect(
      scanPlatformSettlement(client, {
        listCharges: async () => [charge()],
        now: new Date('2026-09-19T12:00:00.000Z'),
      }),
    ).rejects.toThrow(/could not read organiser_balance_ledger/)
  })

  test('an_unreadable_orders_table_still_reports_the_charge_id', async () => {
    const { client } = buildClient({
      ledgerRows: [],
      orderError: { message: 'permission denied' },
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const report = await scanPlatformSettlement(client, {
      listCharges: async () => [charge()],
      now: new Date('2026-09-19T12:00:00.000Z'),
    })
    spy.mockRestore()

    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]!.chargeId).toBe('ch_test_1')
    expect(report.findings[0]!.organisationName).toBeNull()
  })

  test('the_reconciliation_never_writes', async () => {
    // The double throws on insert, update, upsert, delete and rpc, so a write
    // anywhere in the scan fails this test with the verb that was called.
    const { client } = buildClient({
      ledgerRows: [],
      orderRows: [
        { id: 'order-1', order_number: 'EL-1001', organisation_id: 'org-1', organisations: null },
      ],
    })
    const report = await scanPlatformSettlement(client, {
      listCharges: async () => [charge()],
      now: new Date('2026-09-19T12:00:00.000Z'),
    })
    expect(report.findings).toHaveLength(1)
  })

  test('order_ids_are_read_in_chunks_so_a_busy_day_does_not_exceed_one_query_string', async () => {
    const charges = Array.from({ length: 205 }, (_, i) =>
      charge({ chargeId: `ch_${i}`, transferGroup: `order-${i}` }),
    )
    const { client, ledgerQueries } = buildClient({
      ledgerRows: charges.map((c) => ({ reference_id: c.transferGroup as string })),
    })
    const report = await scanPlatformSettlement(client, {
      listCharges: async () => charges,
      now: new Date('2026-09-19T12:00:00.000Z'),
    })

    expect(report.ok).toBe(true)
    expect(report.owedOnward).toBe(205)
    expect(ledgerQueries.map((q) => q.length)).toEqual([100, 100, 5])
  })

  test('one_unrouted_charge_among_many_healthy_ones_is_still_found', async () => {
    const healthy = Array.from({ length: 9 }, (_, i) =>
      charge({ chargeId: `ch_ok_${i}`, transferGroup: `order-ok-${i}` }),
    )
    const adrift = charge({ chargeId: 'ch_adrift', transferGroup: 'order-adrift' })
    const { client } = buildClient({
      ledgerRows: healthy.map((c) => ({ reference_id: c.transferGroup as string })),
      orderRows: [
        {
          id: 'order-adrift',
          order_number: 'EL-2002',
          organisation_id: 'org-mkl',
          organisations: { name: 'MKLStudios' },
        },
      ],
    })
    const report = await scanPlatformSettlement(client, {
      listCharges: async () => [...healthy, adrift],
      now: new Date('2026-09-19T12:00:00.000Z'),
    })

    expect(report.checked).toBe(10)
    expect(report.owedOnward).toBe(9)
    expect(report.findings.map((f) => f.chargeId)).toEqual(['ch_adrift'])
  })
})
