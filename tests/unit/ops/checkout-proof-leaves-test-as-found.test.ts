import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE GATE'S CHECKOUT DRIVE MUST NOT EAT THE INVENTORY IT DRIVES.
 *
 * Twice on 12 September 2026 the checkout-viewport step refused a push with
 * "no published, unseated, sellable PAID event with room for two on this
 * database", and both times the product was fine: the step's own earlier runs
 * had left the only sellable paid event's places in `active` reservations that
 * nothing on TEST ever expires (the sweep is a production cron). Session 91 ran
 * the sweep by hand once; Session 93 lost a full gate run to it.
 *
 * These pins hold that the drive sweeps before it picks, remembers what it
 * reserves, and expires its own reservations through the product's own sweep
 * when it ends, so the next run finds the database as this one found it.
 */
const source = readFileSync(join(process.cwd(), 'scripts/verify/ux6-checkout-viewport-proof.mjs'), 'utf8')

describe('the checkout-viewport drive leaves TEST as it found it', () => {
  it('runs the product\'s own expiry sweep, both halves, in the cron\'s order', () => {
    expect(source).toContain("db.rpc('expire_stale_reservations')")
    expect(source).toContain("db.rpc('release_expired_seat_reservations')")
    expect(source.indexOf("db.rpc('expire_stale_reservations')")).toBeLessThan(
      source.indexOf("db.rpc('release_expired_seat_reservations')"),
    )
  })

  it('sweeps BEFORE it picks the events', () => {
    const sweepBefore = source.indexOf("await sweep('before the pick')")
    const pick = source.indexOf('const paid = await pickEvent({ free: false })')
    expect(sweepBefore).toBeGreaterThan(-1)
    expect(pick).toBeGreaterThan(-1)
    expect(sweepBefore).toBeLessThan(pick)
  })

  it('remembers every reservation a walk makes, from the checkout URL it lands on', () => {
    expect(source).toContain('madeReservations.add(reservationId)')
    expect(source).toMatch(/\/checkout\\\/\(\[0-9a-f-\]\{36\}\)/)
  })

  it('expires its own reservations and sweeps again in the finally, whatever happened', () => {
    const finallyBlock = /finally \{\s*await browser\.close\(\)\s*[^}]*await releaseOwnReservations\(\)/
    expect(source).toMatch(finallyBlock)
    expect(source).toContain(".update({ expires_at: new Date(Date.now() - 1000).toISOString() })")
    expect(source).toContain(".eq('status', 'active')")
    expect(source).toContain("await sweep('after the drive')")
  })

  it('never deletes a reservation and still refuses production first', () => {
    expect(source).not.toMatch(/from\('reservations'\)\s*\.delete\(/)
    expect(source.indexOf('refusing to run against production')).toBeLessThan(source.indexOf('async function sweep('))
  })

  it('reports what it swept', () => {
    expect(source).toContain('sweep: sweepCounts,')
  })
})
