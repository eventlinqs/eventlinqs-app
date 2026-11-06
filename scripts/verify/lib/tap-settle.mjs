/**
 * EVERY TAP MEASURES THE PAGE, NEVER ITSELF (car 49's live read, 6 November 2026; tests/unit/verify/tap-settle.test.ts).
 * every-tap read /city/bendigo's 'Show more' as 'the page changes in 303 ms, and scrolls 3065 px': rows below were still
 * rendering after it scrolled the control into view, the control moved off screen, and Playwright's tap scrolled to it first,
 * so the checker's own scroll and its time were counted as the page's reaction. Tapped by hand and held still, the page
 * changed in 84 to 118 ms and moved 0 px. A control is tapped only once it is inside the screen and held still.
 */

/** The control's two boxes, read a moment apart, show it inside the screen and not moving. Pure. */
export function settledInView(before, after, viewportHeight) {
  if (!before || !after) return false
  if (Math.abs(after.y - before.y) >= 2) return false
  return after.y >= 0 && after.y + after.height <= viewportHeight
}

/**
 * Scroll the control into view until it holds still on screen (at most `tries` rounds), so the scroll read next and the
 * clock started next measure only what the tap does. Returns whether it settled.
 */
export async function settleInView(page, locator, { tries = 12, gapMs = 120 } = {}) {
  const height = page.viewportSize()?.height ?? 844
  for (let i = 0; i < tries; i += 1) {
    await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {})
    const before = await locator.boundingBox().catch(() => null)
    await page.waitForTimeout(gapMs)
    const after = await locator.boundingBox().catch(() => null)
    if (settledInView(before, after, height)) return true
  }
  return false
}
