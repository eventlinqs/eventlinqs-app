import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  FIXTURE_SLUG,
  FIXTURE_TITLE,
  MIN_DAYS_OUT,
  MIN_ROOM,
  PUBLIC_SURFACES,
  REFILL_ROOM,
  ROLL_TO_DAYS,
  TEST_REF,
  namesFixture,
  planFixture,
  rollStart,
} from '../../../scripts/ops/checkout-gate-fixture.mjs'

/**
 * THE CHECKOUT GATE'S OWN PAID EVENT (project manager, 22 October 2026, 18:50).
 * The gate's checkout-viewport step stopped every push on 22 October because
 * TEST held no paid event it could buy: they had all started, or were
 * unpublished or seated. The gate now keeps one event of its own, and these
 * cases pin the rule that keeps it fit, so the step never again depends on
 * whatever TEST happens to hold.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 22, 8, 0, 0)

const fitEvent = {
  status: 'published',
  visibility: 'unlisted',
  seat_map_id: null,
  external_ticket_url: null,
  start_date: new Date(NOW + 45 * DAY).toISOString(),
}
const fitTier = {
  price: 3000,
  total_capacity: 1200,
  sold_count: 6,
  reserved_count: 0,
  max_per_order: 10,
  is_active: true,
  is_visible: true,
  sale_start: null,
  sale_end: null,
}

describe('what the fixture is', () => {
  test('it says it is a gate fixture in its slug and its title, so nobody mistakes it for a real event', () => {
    expect(FIXTURE_SLUG.startsWith('gate-fixture-')).toBe(true)
    expect(FIXTURE_TITLE).toMatch(/Gate fixture/)
    expect(FIXTURE_TITLE).toMatch(/not a real event/)
  })

  test('the rule holds the floors the project manager set: 30 days out, room for well over one run', () => {
    expect(MIN_DAYS_OUT).toBeGreaterThanOrEqual(30)
    expect(ROLL_TO_DAYS).toBeGreaterThan(MIN_DAYS_OUT)
    // One run of the drive takes six places (three widths, two each).
    expect(MIN_ROOM).toBeGreaterThan(6 * 10)
    expect(REFILL_ROOM).toBeGreaterThan(MIN_ROOM)
  })

  test('it runs on TEST only', () => {
    expect(TEST_REF).toBe('vkapkibzokmfaxqogypq')
    const source = readFileSync('scripts/ops/checkout-gate-fixture.mjs', 'utf8')
    expect(source).toContain('assertNotProduction()')
    expect(source).toMatch(/if \(!url\.includes\(TEST_REF\)\)/)
  })
})

describe('the plan', () => {
  test('nothing there yet: create the event and its ticket type', () => {
    const plan = planFixture({ event: null, tier: null }, NOW)
    expect(plan.createEvent).toBe(true)
    expect(plan.createTier).toBe(true)
  })

  test('a fit fixture is left alone', () => {
    const plan = planFixture({ event: fitEvent, tier: fitTier }, NOW)
    expect(plan.eventUpdates).toEqual({})
    expect(plan.tierUpdates).toEqual({})
    expect(plan.reasons).toEqual([])
  })

  test('under 30 days out it rolls to 60, on the hour, three hours long', () => {
    const near = { ...fitEvent, start_date: new Date(NOW + 29 * DAY).toISOString() }
    const plan = planFixture({ event: near, tier: fitTier }, NOW)
    const { start_date, end_date } = plan.eventUpdates
    if (!start_date || !end_date) throw new Error('the plan did not roll the dates')
    const start = new Date(start_date).getTime()
    expect(start).toBe(rollStart(NOW).getTime())
    expect(start - NOW).toBeGreaterThanOrEqual(ROLL_TO_DAYS * DAY - 60 * 60 * 1000)
    expect(new Date(start).getUTCMinutes()).toBe(0)
    expect(new Date(end_date).getTime() - start).toBe(3 * 60 * 60 * 1000)
  })

  test('an event that has already started rolls too', () => {
    const past = { ...fitEvent, start_date: new Date(NOW - DAY).toISOString() }
    expect(planFixture({ event: past, tier: fitTier }, NOW).eventUpdates.start_date).toBeDefined()
  })

  test('exactly 30 days out does not roll', () => {
    const edge = { ...fitEvent, start_date: new Date(NOW + 30 * DAY).toISOString() }
    expect(planFixture({ event: edge, tier: fitTier }, NOW).eventUpdates.start_date).toBeUndefined()
  })

  test('short of room it refills, counting places held by a reservation', () => {
    const tier = { ...fitTier, total_capacity: 200, sold_count: 60, reserved_count: 30 }
    const plan = planFixture({ event: fitEvent, tier }, NOW)
    expect(plan.tierUpdates.total_capacity).toBe(90 + REFILL_ROOM)
  })

  test('public, unpublished, seated or externally ticketed: put back to the shape the drive buys', () => {
    const drifted = { ...fitEvent, status: 'draft', visibility: 'public', seat_map_id: 'seat-map', external_ticket_url: 'https://example.com' }
    const plan = planFixture({ event: drifted, tier: fitTier }, NOW)
    expect(plan.eventUpdates).toMatchObject({ status: 'published', visibility: 'unlisted', seat_map_id: null, external_ticket_url: null })
  })

  test('a ticket type that drifted from sellable is put back', () => {
    const tier = { ...fitTier, is_active: false, is_visible: false, price: 0, max_per_order: 1, sale_end: '2026-01-01T00:00:00Z' }
    const plan = planFixture({ event: fitEvent, tier }, NOW)
    expect(plan.tierUpdates).toMatchObject({ is_active: true, is_visible: true, max_per_order: 10, sale_end: null })
    expect(plan.tierUpdates.price).toBeGreaterThan(0)
  })
})

describe('the reversal: never on a public page', () => {
  test('a page naming the fixture is caught, one that does not is clean', () => {
    expect(namesFixture(`<a href="/events/${FIXTURE_SLUG}">x</a>`)).toBe(true)
    expect(namesFixture('<a href="/events/a-real-event">x</a>')).toBe(false)
    expect(namesFixture(undefined)).toBe(false)
  })

  test('the browse surfaces it is checked against include the home page, browse, the sitemap and a city page', () => {
    expect(PUBLIC_SURFACES).toEqual(expect.arrayContaining(['/', '/events', '/sitemap.xml']))
    expect(PUBLIC_SURFACES.some((p) => p.startsWith('/city/'))).toBe(true)
  })

  test('the gate runs it before the checkout drive, and checks the public surfaces before the drive buys', () => {
    const gate = readFileSync('scripts/ops/pre-push-gate.mjs', 'utf8')
    const ensure = gate.indexOf("'scripts/ops/checkout-gate-fixture.mjs', '--ensure'")
    const check = gate.indexOf("'scripts/ops/checkout-gate-fixture.mjs', '--check-public'")
    const drive = gate.indexOf("'scripts/verify/ux6-checkout-viewport-proof.mjs'")
    expect(ensure).toBeGreaterThan(-1)
    expect(check).toBeGreaterThan(ensure)
    expect(drive).toBeGreaterThan(check)
  })
})
