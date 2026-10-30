import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

/**
 * THE SIGN-UP CHECKBOX IS TAPPED BY ITS WHOLE LABEL (the CONTROLLER's 06:16 of 31 October 2026, (3); WINDOW 5's phone
 * test 05:36 measured a 20 x 20 tap area at every size). The label already wraps the box at full width and at least 44
 * high, but it named no control, so the tap was judged on the 20 px box alone. The label now names its box by id, so a
 * phone's tap anywhere on the row ticks it, and every check that measures the label measures the real target.
 */
const SRC = readFileSync('src/components/auth/signup-form.tsx', 'utf8')

describe('the sign-up checkbox', () => {
  test('its label names the box it ticks', () => {
    expect(SRC).toMatch(/<label\s+htmlFor="digestOptIn"/)
    expect(SRC).toMatch(/id="digestOptIn"/)
  })

  test('the label is at least 44 high and the full row wide', () => {
    const label = SRC.match(/<label\s+htmlFor="digestOptIn"\s+className="([^"]+)"/)?.[1] ?? ''
    expect(label).toMatch(/min-h-\[44px\]/)
    expect(label).toMatch(/\bflex\b/)
    expect(label).not.toMatch(/\binline-flex\b/)
  })
})
