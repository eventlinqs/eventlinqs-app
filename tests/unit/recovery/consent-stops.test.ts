import { describe, expect, test, vi, beforeEach } from 'vitest'

const addressesStoppedForFacilitatedMail = vi.fn()
const suppressedAddresses = vi.fn()
const suppress = vi.fn()

vi.mock('@/lib/consent/facilitated-stop', () => ({ addressesStoppedForFacilitatedMail }))
vi.mock('@/lib/fillrate/read', () => ({ suppressedAddresses, suppress }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ marker: 'admin' }) }))

const { syncConsentStopsIntoRecovery } = await import('@/lib/recovery/consent-stops')

/**
 * THE SECOND HALF OF THE ADAPTER: EVENTLINQS TELLS THE ENGINE WHO SAID STOP.
 *
 * The engine reads the ledger and nothing else (close-out D2), so it may not
 * look at `suppression_events`. It kept owning its own list; this is EventLinqs
 * keeping that list true. Measured on TEST on 20 September 2026 before the fix:
 * 147 people carried a suppression event and the engine's list held 19 rows.
 */

beforeEach(() => {
  addressesStoppedForFacilitatedMail.mockReset()
  suppressedAddresses.mockReset()
  suppress.mockReset()
  suppress.mockResolvedValue(true)
})

describe('syncConsentStopsIntoRecovery', () => {
  test('nobody has withdrawn, so the engine is not even asked what it holds', async () => {
    addressesStoppedForFacilitatedMail.mockResolvedValue(new Set())

    await expect(syncConsentStopsIntoRecovery()).resolves.toEqual({ stopped: 0, added: 0, alreadyHeld: 0 })
    expect(suppressedAddresses).not.toHaveBeenCalled()
    expect(suppress).not.toHaveBeenCalled()
  })

  test('THE DEFECT: a withdrawal the engine had never heard of is copied in', async () => {
    addressesStoppedForFacilitatedMail.mockResolvedValue(new Set(['gone@x.test']))
    suppressedAddresses.mockResolvedValue(new Set())

    await expect(syncConsentStopsIntoRecovery()).resolves.toEqual({ stopped: 1, added: 1, alreadyHeld: 0 })
    expect(suppress).toHaveBeenCalledTimes(1)
    expect(suppress.mock.calls[0][0]).toBe('gone@x.test')
  })

  /**
   * `sendingRates` counts `unsubscribed` and `complained` on this table to
   * decide whether the sequence is cut or stopped. A reason of its own would
   * have hidden every consent withdrawal from that brake.
   */
  test('the reason written is unsubscribed, the one the reversal condition counts', async () => {
    addressesStoppedForFacilitatedMail.mockResolvedValue(new Set(['gone@x.test']))
    suppressedAddresses.mockResolvedValue(new Set())

    await syncConsentStopsIntoRecovery()
    expect(suppress.mock.calls[0][1]).toBe('unsubscribed')
  })

  test('it is idempotent: a second run over the same state writes nothing', async () => {
    addressesStoppedForFacilitatedMail.mockResolvedValue(new Set(['gone@x.test']))
    suppressedAddresses.mockResolvedValue(new Set(['gone@x.test']))

    await expect(syncConsentStopsIntoRecovery()).resolves.toEqual({ stopped: 1, added: 0, alreadyHeld: 1 })
    expect(suppress).not.toHaveBeenCalled()
  })

  test('it adds and never removes, so a recovery-only stop survives a sync', async () => {
    addressesStoppedForFacilitatedMail.mockResolvedValue(new Set(['ledger@x.test']))
    suppressedAddresses.mockResolvedValue(new Set(['pressed-the-stop-link@x.test']))

    const result = await syncConsentStopsIntoRecovery()

    expect(result).toEqual({ stopped: 1, added: 1, alreadyHeld: 0 })
    expect(suppress).toHaveBeenCalledTimes(1)
    expect(suppress.mock.calls[0][0]).toBe('ledger@x.test')
  })

  test('a mixed run reports what it did, one line a person can read', async () => {
    addressesStoppedForFacilitatedMail.mockResolvedValue(new Set(['a@x.test', 'b@x.test', 'c@x.test']))
    suppressedAddresses.mockResolvedValue(new Set(['b@x.test']))

    await expect(syncConsentStopsIntoRecovery()).resolves.toEqual({ stopped: 3, added: 2, alreadyHeld: 1 })
  })

  test('a partial read of the ledger throws rather than reporting a successful sync', async () => {
    addressesStoppedForFacilitatedMail.mockRejectedValue(new Error('the suppressions could not be read in full'))

    await expect(syncConsentStopsIntoRecovery()).rejects.toThrow(/could not be read in full/)
    expect(suppress).not.toHaveBeenCalled()
  })

  test('a partial read of the ENGINE list throws too, before anything is written', async () => {
    addressesStoppedForFacilitatedMail.mockResolvedValue(new Set(['gone@x.test']))
    suppressedAddresses.mockRejectedValue(new Error('the suppression list could not be read in full'))

    await expect(syncConsentStopsIntoRecovery()).rejects.toThrow(/could not be read in full/)
    expect(suppress).not.toHaveBeenCalled()
  })

  test('the caller may hand in its own client, and both reads get the same one', async () => {
    addressesStoppedForFacilitatedMail.mockResolvedValue(new Set(['gone@x.test']))
    suppressedAddresses.mockResolvedValue(new Set())
    const db = { marker: 'handed in' } as never

    await syncConsentStopsIntoRecovery(db)

    expect(addressesStoppedForFacilitatedMail.mock.calls[0][0]).toBe(db)
    expect(suppressedAddresses.mock.calls[0][0]).toBe(db)
    expect(suppress.mock.calls[0][2]).toBe(db)
  })
})
