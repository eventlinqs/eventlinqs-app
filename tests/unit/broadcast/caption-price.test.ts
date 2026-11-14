/**
 * A CAPTION'S PRICE READS "FROM $25", NEVER "FROM AUD $25" (the PM's score of 15 November 2026, S5: a double currency
 * mark in every caption and the email). Only the caption engine's view changes; the cards keep the shared label.
 */
import { describe, it, expect } from 'vitest'
import { captionPrice } from '@/lib/broadcast/kit-artefacts'

describe('captionPrice', () => {
  it('drops the currency code from an Australian dollar price', () => {
    expect(captionPrice('From AUD $25')).toBe('From $25')
    expect(captionPrice('From AUD $25.50')).toBe('From $25.50')
  })

  it('keeps any other currency and every other line as it is', () => {
    expect(captionPrice('From USD $25')).toBe('From USD $25')
    expect(captionPrice('Free entry')).toBe('Free entry')
    expect(captionPrice('Tickets on Humanitix')).toBe('Tickets on Humanitix')
    expect(captionPrice('')).toBe('')
  })
})
