import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE DASHBOARD COLUMN MUST BE ALLOWED TO SHRINK.
 *
 * Found on the B1 drive at 768 (5 September 2026). The dashboard is a flex row
 * (sidebar, main), and a flex item's minimum width defaults to its content's.
 * The attendees table has seven columns with nowrap dates and long emails, so
 * at 768 the main column grew past the viewport and carried every control with
 * it: the Door review panel's Mark resolved button sat off screen, where a
 * finger could not reach it and Playwright timed out trying. One class,
 * min-w-0, lets the column stay the viewport's width so the table scrolls
 * inside its own wrapper. Deleting that class passes every other gate.
 *
 * And once the table scrolled, axe found the wrapper unreachable by keyboard
 * (scrollable-region-focusable, serious): the second defect had been hidden
 * under the first. The wrapper is now a named, focusable region.
 */
const ROOT = join(__dirname, '..', '..', '..')
const layout = readFileSync(join(ROOT, 'src', 'app', '(dashboard)', 'layout.tsx'), 'utf8')
const table = readFileSync(join(ROOT, 'src', 'components', 'dashboard', 'attendee-table.tsx'), 'utf8')

describe('the dashboard main column', () => {
  test('is a flex item that may shrink to the viewport (min-w-0 beside flex-1)', () => {
    expect(layout).toMatch(/<main className="[^"]*\bmin-w-0\b[^"]*\bflex-1\b[^"]*">/)
  })

  /*
   * THE CLASS IS MATCHED ANYWHERE IN THE STRING RATHER THAN AT ITS START. Both
   * patterns below were anchored to `className="overflow-x-auto`, and on
   * 19 September 2026 they went red against a wrapper that was still correct:
   * `relative` was added in front of it, because sr-only is position:absolute
   * and an absolute descendant is only clipped by an ancestor that is its
   * CONTAINING BLOCK. Seven admin screens had the label laid out at its position
   * in the full table width, so /admin/users measured a 569px document against a
   * 390px viewport. scripts/guards/sr-only-cannot-escape-a-scroller.mjs holds
   * that rule now. A test that pins the ORDER of utility classes fails on a
   * correct change, which is a test asserting the wrong thing.
   */
  test('the attendee table keeps its own horizontal scroll wrapper, so the column has somewhere to put the width', () => {
    expect(table).toMatch(/className="[^"]*\boverflow-x-auto\b[^"]*"\s*>\s*<table/)
  })

  test('that wrapper is a named region a keyboard can focus, because a region that scrolls must be reachable (axe scrollable-region-focusable)', () => {
    const wrapper = /<div\s+role="region"\s+aria-label="Attendee list"\s+tabIndex=\{0\}\s+className="[^"]*\boverflow-x-auto\b[^"]*"\s*>/.exec(table)?.[0] ?? ''
    expect(wrapper).not.toBe('')
    expect(wrapper).toContain('focus-visible:ring-2')
  })

  test('and that wrapper is a containing block, so its own screen-reader labels cannot escape it', () => {
    const wrapper = /<div\s+role="region"\s+aria-label="Attendee list"\s+tabIndex=\{0\}\s+className="([^"]*)"/.exec(table)?.[1] ?? ''
    expect(wrapper).not.toBe('')
    expect(wrapper).toMatch(/\brelative\b/)
  })
})
