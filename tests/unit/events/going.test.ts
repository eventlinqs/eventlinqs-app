import { describe, it, expect } from 'vitest'
import {
  GOING_THRESHOLD,
  resolveGoingCount,
  formatGoingLabel,
} from '@/lib/events/going'

describe('resolveGoingCount', () => {
  it('hides below the threshold (would read weak)', () => {
    expect(resolveGoingCount(GOING_THRESHOLD - 1)).toBeNull()
    expect(resolveGoingCount(2)).toBeNull()
  })

  it('hides at zero sales', () => {
    expect(resolveGoingCount(0)).toBeNull()
  })

  it('shows the real count at the threshold', () => {
    expect(resolveGoingCount(GOING_THRESHOLD)).toBe(GOING_THRESHOLD)
  })

  it('shows the real count above the threshold (never inflated)', () => {
    expect(resolveGoingCount(42)).toBe(42)
    expect(resolveGoingCount(1280)).toBe(1280)
  })

  it('floors a non-integer sold count and never rounds up', () => {
    expect(resolveGoingCount(10.9)).toBe(10)
    expect(resolveGoingCount(9.9)).toBeNull()
  })

  it('hides on non-finite input', () => {
    expect(resolveGoingCount(Number.NaN)).toBeNull()
    expect(resolveGoingCount(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('formatGoingLabel', () => {
  it('formats a plural count with the en-AU thousands separator', () => {
    expect(formatGoingLabel(42)).toBe('42 people going')
    expect(formatGoingLabel(1280)).toBe('1,280 people going')
  })

  it('uses the singular form for one person', () => {
    expect(formatGoingLabel(1)).toBe('1 person going')
  })

  it('produces clean copy with no banned punctuation', () => {
    const label = formatGoingLabel(250)
    expect(label).not.toMatch(/[!–—]/)
  })
})
