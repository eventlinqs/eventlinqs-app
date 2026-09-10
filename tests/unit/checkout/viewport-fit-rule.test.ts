import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { judgeSurface, MEASURE_VIEWPORT_FIT } from '../../../scripts/verify/lib/viewport-fit.mjs'

/**
 * THE RULE THAT DECIDES WHETHER A BUYER SURFACE FITS (close-out UX6.2, UX6.3).
 *
 * The measurement itself runs in a browser and is proven by driving
 * scripts/verify/ux6-checkout-viewport-proof.mjs. What is tested here is the
 * JUDGEMENT: which measurements are faults, which are legitimate, and that the
 * three exemptions cannot be widened into a hole. Those three are the only ways
 * a box may cross the right edge, and each one is here with a case that must
 * still fail beside it.
 */

const fit = (over: Partial<Record<string, unknown>> = {}) => ({
  innerWidth: 390,
  docScrollWidth: 390,
  bodyScrollWidth: 390,
  faults: [],
  exempt: [],
  ...over,
})

const clipped = (over: Partial<Record<string, unknown>> = {}) => ({
  selector: 'footer > div.mx-auto > div.flex.items-center.gap-4',
  left: 157,
  width: 284,
  right: 441,
  overhang: 51,
  text: '',
  ...over,
})

describe('a surface that fits', () => {
  it('is clean when nothing crosses the edge and the total is inside', () => {
    const faults = judgeSurface({
      label: 'checkout',
      width: 390,
      fit: fit(),
      totals: [{ text: 'AUD 53.73', left: 250, right: 366, width: 116, innerWidth: 390, inside: true, visible: true }],
      totalRequired: true,
    })
    expect(faults).toEqual([])
  })
})

describe('the assertion UX6 names literally', () => {
  it('fails when documentElement.scrollWidth exceeds innerWidth', () => {
    const faults = judgeSurface({ label: 'checkout', width: 390, fit: fit({ docScrollWidth: 536 }), totals: [], totalRequired: false })
    expect(faults).toHaveLength(1)
    expect(faults[0]).toContain('documentElement.scrollWidth 536 exceeds innerWidth 390')
  })
})

describe('the assertion that can actually go red on this codebase', () => {
  /*
   * globals.css carries `html, body { overflow-x: clip }`, which makes
   * scrollWidth equal clientWidth by definition. Driven on the real checkout at
   * 390 on 10 September 2026: a 520px child moved the order summary's right edge
   * to 536 while documentElement.scrollWidth stayed at exactly 390. So the check
   * above is necessary and not sufficient, and this is the one that fires.
   */
  it('fails on a box clipped past the right edge even when scrollWidth is tidy', () => {
    const faults = judgeSurface({
      label: 'checkout',
      width: 390,
      fit: fit({ docScrollWidth: 390, faults: [clipped()] }),
      totals: [],
      totalRequired: false,
    })
    expect(faults).toHaveLength(1)
    expect(faults[0]).toContain('clipped 51px past the right edge and unreachable')
    expect(faults[0]).toContain('footer > div.mx-auto')
  })

  it('names the text so the fault can be found on screen', () => {
    const faults = judgeSurface({
      label: 'checkout',
      width: 390,
      fit: fit({ faults: [clipped({ text: 'AUD 53.73' })] }),
      totals: [],
      totalRequired: false,
    })
    expect(faults[0]).toContain('"AUD 53.73"')
  })

  it('reports every clipped box, not just the first', () => {
    const faults = judgeSurface({
      label: 'checkout',
      width: 390,
      fit: fit({ faults: [clipped(), clipped({ selector: 'main > div.grid', overhang: 146 })] }),
      totals: [],
      totalRequired: false,
    })
    expect(faults).toHaveLength(2)
  })
})

describe('the order total the buyer is about to pay', () => {
  it('fails when a surface that must show a total shows none', () => {
    const faults = judgeSurface({ label: 'checkout', width: 390, fit: fit(), totals: [], totalRequired: true })
    expect(faults).toHaveLength(1)
    expect(faults[0]).toContain('no [data-order-total]')
  })

  it('does not demand one on a surface that has no total to show', () => {
    const faults = judgeSurface({ label: 'ticket-view', width: 390, fit: fit(), totals: [], totalRequired: false })
    expect(faults).toEqual([])
  })

  it('fails when the total sits outside the viewport box: this is UX6.1', () => {
    const faults = judgeSurface({
      label: 'payment',
      width: 390,
      fit: fit(),
      totals: [{ text: 'AUD 18.00', left: 420, right: 536, width: 116, innerWidth: 390, inside: false, visible: true }],
      totalRequired: true,
    })
    expect(faults).toHaveLength(1)
    expect(faults[0]).toContain('the order total "AUD 18.00" sits outside the viewport box')
  })

  it('fails when the total element is empty, so a blank cannot pass as a figure', () => {
    const faults = judgeSurface({
      label: 'payment',
      width: 390,
      fit: fit(),
      totals: [{ text: '', left: 250, right: 366, width: 116, innerWidth: 390, inside: true, visible: true }],
      totalRequired: true,
    })
    expect(faults[0]).toContain('the order total element is empty')
  })

  it('fails when the total is marked but not rendered', () => {
    const faults = judgeSurface({
      label: 'payment',
      width: 390,
      fit: fit(),
      totals: [{ text: 'AUD 18.00', left: 0, right: 0, width: 0, innerWidth: 390, inside: true, visible: false }],
      totalRequired: true,
    })
    expect(faults[0]).toContain('marked but not visible')
  })
})

describe('the three exemptions, read out of the measurement itself', () => {
  /*
   * The exemptions live in the browser half, so they are asserted against its
   * source rather than mocked: a mock of the rule would pass whatever the rule
   * became. Each of the three is required to be present AND the decorative one
   * is required to be conjunctive, because `aria-hidden` alone would let anyone
   * launder a real control past the check.
   */
  const source = String(MEASURE_VIEWPORT_FIT)

  it('exempts a box PARKED off-canvas by a transform, never one merely laid out there', () => {
    /*
     * The 768 drive settled this. The header's account controls were sitting
     * entirely past the right edge, pushed there by a too-wide row, and the
     * first draft exempted them on position alone while reporting the search box
     * beside them. Invisible AND unreachable is worse than clipped, so position
     * alone can never buy an exemption; the transform must be there too.
     */
    expect(source).toContain('box.left >= iw - 0.5 && parked')
    expect(source).toContain('parked off-canvas by a transform')
    expect(source).toContain('pushed entirely past the right edge')
  })

  it('reports a box pushed past the edge with its own words, not as a clip', () => {
    const faults = judgeSurface({
      label: 'header',
      width: 768,
      fit: fit({
        faults: [
          clipped({
            selector: 'header > div.mx-auto > div.flex.items-center',
            left: 768,
            width: 200,
            right: 968,
            overhang: 200,
            note: 'pushed entirely past the right edge: invisible and unreachable',
          }),
        ],
      }),
      totals: [],
      totalRequired: false,
    })
    expect(faults[0]).toContain('pushed entirely past the right edge: invisible and unreachable')
    expect(faults[0]).not.toContain('clipped 200px')
  })

  it('exempts a box that scrolls inside its own container, which UX6.3 allows', () => {
    expect(source).toContain("ox === 'auto' || ox === 'scroll'")
    expect(source).toContain('scrolls inside ')
  })

  it('exempts a decorative box only when it is hidden AND silent AND unfocusable', () => {
    expect(source).toContain('if (hidden && silent)')
    expect(source).toContain('aria-hidden="true"')
    expect(source).toMatch(/silent\s*=\s*record\.text === ''/)
    expect(source).toContain('querySelector(focusable) === null')
  })

  it('reads the standalone translate property, not only transform', () => {
    /*
     * Tailwind v4 compiles `translate-x-full` to the standalone `translate`
     * property. The first draft read `transform` alone, and the drive then
     * reported the CLOSED mobile drawer as a control pushed off the screen, on
     * every mobile page. Both properties are read, and the identity value of
     * each is what buys the exemption.
     */
    expect(source).toContain('cs.translate')
    expect(source).toContain('cs.transform')
    expect(source).toContain('matrix(1, 0, 0, 1, 0, 0)')
  })

  it('reports only the outermost offender, so one defect is one line', () => {
    expect(source).toContain('if (pb.right > iw + 0.5) continue')
  })
})

describe('the clip rule this all exists because of', () => {
  it('is still in globals.css, so the box-level assertion is still the only one that can fire', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8')
    expect(css).toMatch(/html,\s*body\s*\{[^}]*overflow-x:\s*clip/)
  })
})
