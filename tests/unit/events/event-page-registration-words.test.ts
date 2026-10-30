import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * E2 on car 14's own TEST preview (window 2, 30 October 2026, 15:45, C:\dev\EVIDENCE\W2-E2-30OCT\car14-preview\): our
 * own free registration night read "Free, registration required" in the hero and "Free entry" (E1's words) in the
 * sticky bar, because the page's cheapestPrice named a set of $0 ticket types of ours 'Free entry'. A night whose every
 * ticket type of ours is $0 is a registration (src/lib/events/cta.ts reads it as free_registration), so its words are
 * E2's everywhere on the page; "Free entry" belongs to a walk-in night alone.
 */
const PAGE = 'src/app/events/[slug]/page.tsx'

describe('our own free registration night never says "Free entry" on its page', () => {
  it("names a set of $0 ticket types of ours with E2's words", () => {
    const page = readFileSync(PAGE, 'utf8')
    expect(page).toMatch(/priceLabel\(tiers, FREE_REGISTRATION_REQUIRED, allIn\)/)
  })

  it("writes E1's words nowhere in the page source", () => {
    expect(readFileSync(PAGE, 'utf8')).not.toContain("'Free entry'")
  })
})
