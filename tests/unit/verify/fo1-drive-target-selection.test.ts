/**
 * THE RULE THAT STOPS ONE FO1 DRIVE DELETING THE OTHER'S FIXTURE.
 *
 * On 14 September 2026 `fo1-founding-offer-drive` picked the first sellable
 * paid event with no view on whether that organisation already held a founding
 * window. On a machine where `fo1-founding-purchase-drive` had just run and
 * KEPT its fixture, because the orders on it are that drive's evidence, the
 * offer drive picked exactly that fixture. Two things followed:
 *
 *   `fo1.setup.target-starts-standard` failed, which reads as a product fault
 *   and was a collision between two of lane B's own drives; and
 *
 *   the teardown revoked that window and reported `left as found`, which is
 *   the serious half. A harness that can quietly delete another harness's
 *   evidence and then certify that it has not is worse than one that fails.
 *
 * These hold the selection rule in both directions, because the failing
 * direction is the one that was wrong and a test that only proves the happy
 * path would have passed before the fix.
 */
import { describe, it, expect } from 'vitest'
import { chooseFoundingDriveTarget } from '../../../scripts/verify/lib/fo1-founding-admin.mjs'

const standard = (name: string) => ({ organisation: { name, founding_fee_free_until: null } })
const founding = (name: string, until = '2027-03-14T09:33:58.167+00:00') => ({
  organisation: { name, founding_fee_free_until: until },
})

describe('fo1 offer drive: which organisation it may grant a founding window to', () => {
  it('picks a standard organisation when there is one', () => {
    const { target, reason } = chooseFoundingDriveTarget([standard('Alpha'), founding('Beta')])
    expect(reason).toBeNull()
    expect(target?.organisation.name).toBe('Alpha')
  })

  it('SKIPS an organisation that already holds a founding window, even when it is first', () => {
    const { target, reason } = chooseFoundingDriveTarget([founding('Beta'), standard('Alpha')])
    expect(reason).toBeNull()
    expect(target?.organisation.name).toBe('Alpha')
  })

  it('refuses rather than picking a founding organisation when every candidate holds a window', () => {
    const { target, reason } = chooseFoundingDriveTarget([founding('Beta'), founding('Gamma')])
    expect(target).toBeNull()
    expect(reason).toMatch(/ALREADY holds a founding window \(2 candidate\(s\)\)/)
    // The sentence must tell the reader what to do, not only that it stopped.
    expect(reason).toMatch(/before fo1-founding-purchase-drive/)
  })

  it('says the catalogue is empty rather than blaming founding windows when there is nothing at all', () => {
    const { target, reason } = chooseFoundingDriveTarget([])
    expect(target).toBeNull()
    expect(reason).toMatch(/no published, public, sellable PAID event/)
    expect(reason).not.toMatch(/founding window/)
  })

  /*
   * `undefined` and `null` are the same finding here and both arrive in
   * practice: the column is nullable, and a select that does not name it
   * returns the key missing rather than null. Treating one as "standard" and
   * the other as "founding" would put the defect straight back.
   */
  it('treats a missing founding_fee_free_until the same as an explicit null', () => {
    const missing = { organisation: { name: 'Delta' } }
    const { target, reason } = chooseFoundingDriveTarget([missing])
    expect(reason).toBeNull()
    expect(target?.organisation.name).toBe('Delta')
  })

  it('is total when handed nothing at all', () => {
    expect(chooseFoundingDriveTarget(undefined).target).toBeNull()
    expect(chooseFoundingDriveTarget(undefined).reason).toMatch(/sellable PAID event/)
  })
})
