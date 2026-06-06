import { describe, it, expect } from 'vitest'
import { formatMoney, formatMoneyDisplay } from '@/lib/money/format'

describe('formatMoney', () => {
  it('renders CCY 0.00', () => {
    expect(formatMoney(123456, 'aud')).toBe('AUD 1234.56')
    expect(formatMoney(0, 'AUD')).toBe('AUD 0.00')
  })
  it('rounds a stray fractional cent defensively', () => {
    expect(formatMoney(123456.7, 'AUD')).toBe('AUD 1234.57')
  })
})

describe('formatMoneyDisplay (item 9: revenue card rounding fix)', () => {
  it('shows exact cents, never rounded to whole dollars', () => {
    // The bug used maximumFractionDigits: 0, so $1,234.56 rendered as "$1,235".
    expect(formatMoneyDisplay(123456, 'AUD')).toBe('$1,234.56')
    // Sub-dollar amounts must not round up to "$1".
    expect(formatMoneyDisplay(99, 'AUD')).toBe('$0.99')
    expect(formatMoneyDisplay(1, 'AUD')).toBe('$0.01')
    expect(formatMoneyDisplay(0, 'AUD')).toBe('$0.00')
  })

  it('reconciles: shown gross minus shown refunded equals shown net', () => {
    // With whole-dollar rounding these three tiles could disagree by a dollar.
    const grossCents = 100050 // $1,000.50
    const refundedCents = 50 //     $0.50
    const netCents = grossCents - refundedCents // $1,000.00
    expect(formatMoneyDisplay(grossCents, 'AUD')).toBe('$1,000.50')
    expect(formatMoneyDisplay(refundedCents, 'AUD')).toBe('$0.50')
    expect(formatMoneyDisplay(netCents, 'AUD')).toBe('$1,000.00')
    // The displayed cents reconcile exactly.
    const toCents = (s: string) => Math.round(Number(s.replace(/[^0-9.]/g, '')) * 100)
    expect(toCents('$1,000.50') - toCents('$0.50')).toBe(toCents('$1,000.00'))
  })

  it('guards non-finite input to $0.00', () => {
    expect(formatMoneyDisplay(Number.NaN, 'AUD')).toBe('$0.00')
    expect(formatMoneyDisplay(Number.POSITIVE_INFINITY, 'AUD')).toBe('$0.00')
  })

  it('rounds a stray fractional cent to the nearest cent (not the nearest dollar)', () => {
    expect(formatMoneyDisplay(123456.7, 'AUD')).toBe('$1,234.57')
  })
})
