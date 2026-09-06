import { describe, expect, test, vi } from 'vitest'
import {
  DELETE_REFUSAL_HINT,
  deleteRefusalSentence,
  isMoneyRefusal,
  judgeDeleteEligibility,
  moneyCountsFromRpc,
  readMoneyRecordCounts,
  readMoneyRecordCountsMany,
  type MoneyRecordCounts,
} from '@/lib/events/delete-eligibility'

const zero: MoneyRecordCounts = {
  orders: 0,
  tickets: 0,
  squad_members_paid: 0,
  discount_code_usages: 0,
  refund_requests: 0,
  refunds: 0,
  total: 0,
}

describe('judgeDeleteEligibility', () => {
  test('deletable exactly when every count is zero', () => {
    expect(judgeDeleteEligibility(zero)).toMatchObject({ deletable: true, reasons: [] })
  })

  test('one free ticket is enough to refuse, as Humanitix treats it', () => {
    const judged = judgeDeleteEligibility({ ...zero, tickets: 1, total: 1 })
    expect(judged.deletable).toBe(false)
    expect(judged.reasons).toEqual(['1 issued ticket'])
    expect(deleteRefusalSentence(judged)).toBe('This event has 1 issued ticket, so it cannot be deleted. Archive it instead.')
  })

  test('every record kind is named, in words, pluralised', () => {
    const judged = judgeDeleteEligibility({
      orders: 2,
      tickets: 3,
      squad_members_paid: 1,
      discount_code_usages: 4,
      refund_requests: 1,
      refunds: 2,
      total: 13,
    })
    expect(judged.reasons).toEqual([
      '2 orders',
      '3 issued tickets',
      '1 paid squad member',
      '4 discount code redemptions',
      '1 refund request',
      '2 refunds',
    ])
  })

  test('a total that disagrees with its parts still refuses', () => {
    expect(judgeDeleteEligibility({ ...zero, total: 1 }).deletable).toBe(false)
  })
})

describe('moneyCountsFromRpc', () => {
  test('accepts the jsonb shape the function returns, numbers or numeric strings', () => {
    expect(moneyCountsFromRpc({ ...zero, orders: '2', total: '2' })).toMatchObject({ orders: 2, total: 2 })
  })

  test('a missing key NEVER reads as zero', () => {
    const { total: _t, ...short } = zero
    expect(() => moneyCountsFromRpc(short)).toThrow(/total is not a count/)
    expect(() => moneyCountsFromRpc(null)).toThrow(/no object/)
    expect(() => moneyCountsFromRpc([])).toThrow(/no object/)
    expect(() => moneyCountsFromRpc({ ...zero, tickets: -1 })).toThrow(/tickets is not a count/)
    expect(() => moneyCountsFromRpc({ ...zero, tickets: 1.5 })).toThrow(/tickets is not a count/)
  })
})

describe('the RPC readers', () => {
  test('readMoneyRecordCounts asks event_money_record_counts and throws on an error rather than guessing', async () => {
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      expect(fn).toBe('event_money_record_counts')
      expect(args).toEqual({ p_event_id: 'ev-1' })
      return { data: { ...zero, orders: 1, total: 1 }, error: null }
    })
    expect(await readMoneyRecordCounts({ rpc }, 'ev-1')).toMatchObject({ orders: 1, total: 1 })
    const failing = vi.fn(async () => ({ data: null, error: { message: 'permission denied' } }))
    await expect(readMoneyRecordCounts({ rpc: failing }, 'ev-1')).rejects.toThrow(/permission denied/)
  })

  test('readMoneyRecordCountsMany keys by id and leaves unknown ids absent, never zero', async () => {
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      expect(fn).toBe('event_money_record_counts_many')
      expect(args).toEqual({ p_event_ids: ['a', 'b'] })
      return { data: { a: zero, b: { ...zero, refunds: 1, total: 1 } }, error: null }
    })
    const out = await readMoneyRecordCountsMany({ rpc }, ['a', 'b'])
    expect(out.get('a')?.total).toBe(0)
    expect(out.get('b')?.refunds).toBe(1)
    expect(out.has('c')).toBe(false)
    expect((await readMoneyRecordCountsMany({ rpc }, [])).size).toBe(0)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('isMoneyRefusal', () => {
  test('recognises the trigger by its hint or its message, and nothing else', () => {
    expect(isMoneyRefusal({ hint: DELETE_REFUSAL_HINT })).toBe(true)
    expect(isMoneyRefusal({ message: 'event has money records and cannot be deleted: 1 orders' })).toBe(true)
    expect(isMoneyRefusal({ message: 'permission denied for table events' })).toBe(false)
    expect(isMoneyRefusal(null)).toBe(false)
  })
})
