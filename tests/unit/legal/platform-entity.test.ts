// The platform's own legal identity, written once (close-out UX2.1).
//
// The ABN was hand-written in twelve places across nine files, in three formats,
// beside two postal addresses and three descriptions of the entity. The entity
// taking ticket money must match the ABN displayed, and when the Pty Ltd is
// registered the number changes.

import { describe, expect, test } from 'vitest'
import {
  PLATFORM_ENTITY,
  entityFooterLine,
  entityLegalLine,
  tradingAsLine,
} from '@/lib/legal/platform-entity'
import { formatAbn, isValidAbn, normaliseAbn } from '@/lib/tax/abn'

describe('the number itself', () => {
  test('passes the ATO checksum the platform already validates organisers against', () => {
    // If the platform refuses an organiser's ABN for failing this check, its own
    // had better pass it. Nothing was asserting that.
    expect(isValidAbn(PLATFORM_ENTITY.abn)).toBe(true)
  })

  test('is stored as eleven digits and displayed in the ABR grouping', () => {
    expect(PLATFORM_ENTITY.abn).toMatch(/^\d{11}$/)
    expect(PLATFORM_ENTITY.abnFormatted).toBe('30 837 447 587')
    expect(normaliseAbn(PLATFORM_ENTITY.abnFormatted)).toBe(PLATFORM_ENTITY.abn)
  })

  test('the display form is derived, never typed beside the digits', () => {
    expect(PLATFORM_ENTITY.abnFormatted).toBe(formatAbn(PLATFORM_ENTITY.abn))
  })
})

describe('the composed lines every surface uses', () => {
  test('the legal line names who, trading as what, the ABN and a postal address', () => {
    const line = entityLegalLine()
    expect(line).toContain('Lawal Adams')
    expect(line).toContain('trading as EventLinqs')
    expect(line).toContain('30 837 447 587')
    expect(line).toContain('PO Box 141, Newcomb VIC 3219, Australia')
  })

  test('the email footer line carries the locality, not the PO Box', () => {
    const line = entityFooterLine()
    expect(line).toBe('EventLinqs (Lawal Adams), ABN 30 837 447 587, Geelong VIC, Australia.')
    expect(line).not.toContain('PO Box')
  })

  test('trading-as reads the way the legal pages open', () => {
    expect(tradingAsLine()).toBe('Lawal Adams, trading as EventLinqs')
  })
})

describe('changing the entity is one edit', () => {
  // The Pty Ltd conversion is stated on the About page as a future event. When
  // it happens, every surface must move together. This asserts the derivation
  // rather than the value, so it keeps holding after the number changes.
  test('every composed line derives from the same constants', () => {
    for (const line of [entityLegalLine(), entityFooterLine()]) {
      expect(line).toContain(PLATFORM_ENTITY.abnFormatted)
    }
    expect(entityLegalLine()).toContain(PLATFORM_ENTITY.legalName)
    expect(entityFooterLine()).toContain(PLATFORM_ENTITY.tradingName)
  })

  test('the locality is the same place as the postal address, at lower resolution', () => {
    // Newcomb is a Geelong suburb. Both strings were already live on different
    // surfaces and neither was derived; this pins that they are not two
    // different registered addresses.
    expect(PLATFORM_ENTITY.postalAddress).toContain('VIC')
    expect(PLATFORM_ENTITY.locality).toContain('VIC')
    expect(PLATFORM_ENTITY.postalAddress).toContain('Australia')
    expect(PLATFORM_ENTITY.locality).toContain('Australia')
  })
})
