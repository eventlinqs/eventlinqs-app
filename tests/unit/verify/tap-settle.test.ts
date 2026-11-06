import { describe, expect, it } from 'vitest'
import { settledInView } from '../../../scripts/verify/lib/tap-settle.mjs'

/*
 * EVERY TAP MEASURES THE PAGE, NEVER ITSELF (car 49's live read, 6 November 2026). every-tap read /city/bendigo's 'Show more'
 * as 'the page changes in 303 ms, and scrolls 3065 px': it scrolled the control into view, read the page's scroll and started
 * its clock, but rows below were still rendering, the control moved off screen, and Playwright's tap scrolled to it first, so
 * the checker's own scroll and its time were counted as the page's. Tapped by hand, held still, the page changed in 84 to 118
 * ms and moved 0 px. A control is tapped only once it is inside the screen and has held still between two reads.
 */
const box = (y: number) => ({ x: 20, y, width: 350, height: 44 })

describe('settledInView', () => {
  it('is settled when the control is inside the screen and has not moved between two reads', () => {
    expect(settledInView(box(400), box(400.5), 844)).toBe(true)
  })

  it('is not settled while the control still moves, as rows below render', () => {
    expect(settledInView(box(400), box(2773), 844)).toBe(false)
  })

  it('is not settled when the control is held still but off the screen, above or below', () => {
    expect(settledInView(box(2773), box(2773), 844)).toBe(false)
    expect(settledInView(box(-120), box(-120), 844)).toBe(false)
  })

  it('is not settled with no box (the control is not laid out)', () => {
    expect(settledInView(null, box(400), 844)).toBe(false)
    expect(settledInView(box(400), null, 844)).toBe(false)
  })
})
