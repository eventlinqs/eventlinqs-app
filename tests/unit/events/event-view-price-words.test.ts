import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * WINDOW 3's step 3 on live (30 October 2026, 16:34) read the event page handing its view event
 * `priceRange={priceLabel ?? 'Free'}`. priceLabel is null on every night with no ticket type of ours, so Kate
 * Ceberano's paid night sold on another site was recorded in analytics as 'Free'. The view event now carries the
 * price words the page itself shows (heroSaleWords, from the night's one call to action), and says 'Not stated'
 * where the page names no price, never an invented Free.
 */
const PAGE = 'src/app/events/[slug]/page.tsx'

describe('the event page view event never records an invented Free', () => {
  it('sends the price words the hero and the sticky bar show', () => {
    expect(readFileSync(PAGE, 'utf8')).toMatch(/priceRange=\{heroPriceLabel \?\? 'Not stated'\}/)
  })

  it("never falls back to 'Free' in the page source", () => {
    expect(readFileSync(PAGE, 'utf8')).not.toMatch(/\?\?\s*'Free'/)
  })
})
