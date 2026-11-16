import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { facilityNotice, NOT_AN_EVENT } from '@/lib/listings/not-an-event'

/*
 * A FACILITY NOTICE IS NOT AN EVENT (the PM's 15:38 item 1 of 16 November 2026, on WINDOW 5A's 14:49): 18 of Geelong
 * Regional Libraries' 138 clean waiting nights were notices a visitor never goes out to: 'Makerspace Opening Hours',
 * 'Makers Room Safety Induction', 'Overlocker Safety Induction'. For every source, a title that is a facility notice
 * (opening hours, a closure, a safety induction, maintenance, booking of equipment) is not published: refused with the
 * reason 'not an event', never deleted, never a person's task. A real night whose title holds one of the words is not.
 */
describe('a facility notice is not an event', () => {
  it("every one of the 18 library notices is named, with the words that make it one", () => {
    for (const t of [
      'Makerspace Opening Hours',
      'Makers Room Safety Induction',
      'Media Room Safety Induction',
      'Overlocker Safety Induction',
      'Sewing Machine and Overlocker Safety Induction',
      'Sewing machine & overlocker safety induction',
    ]) {
      expect(facilityNotice(t), t).not.toBeNull()
    }
    expect(facilityNotice('Makerspace Opening Hours')).toBe('opening hours')
    expect(facilityNotice('Overlocker Safety Induction')).toBe('a safety induction')
  })

  it('closures, maintenance and equipment booking are notices too', () => {
    expect(facilityNotice('Library closed for the public holiday')).not.toBeNull()
    expect(facilityNotice('Branch closure: Corio Library')).not.toBeNull()
    expect(facilityNotice('Scheduled maintenance: the catalogue is offline')).not.toBeNull()
    expect(facilityNotice('3D printer booking')).not.toBeNull()
  })

  it('a real night that holds one of the words is an event: never refused', () => {
    for (const t of ['Hall of Fame Induction Night', 'Zen and the Art of Motorcycle Maintenance', 'Closing Night Party', 'The Opening Night Gala', 'Baby time', 'Lego club']) {
      expect(facilityNotice(t), t).toBeNull()
    }
  })

  it('the collection run refuses them for every source with the reason, and the daily state counts them', () => {
    expect(NOT_AN_EVENT).toBe('not an event')
    const run = readFileSync(join(process.cwd(), 'src/lib/listings/collect-run.ts'), 'utf8')
    expect(run).toContain('result.notEvents = await store.refuseNotEvents(now)')
    const route = readFileSync(join(process.cwd(), 'src/app/api/ops/state/route.ts'), 'utf8')
    expect(route).toContain("ilike('refused_because', `${NOT_AN_EVENT}%`)")
  })
})
