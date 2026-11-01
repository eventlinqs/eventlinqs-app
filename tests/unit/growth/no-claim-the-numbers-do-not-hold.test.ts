import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * NO MARKETING CLAIM THE PLATFORM's OWN NUMBERS DO NOT HOLD (Law 4: social proof uses real platform truths only,
 * never fabricated). Found on live, 1 November 2026, while production held 0 upcoming nights selling through
 * EventLinqs (C:\dev\EVIDENCE\VISUAL-QA-31OCT\pricing-live.html): /pricing badged its paid tier 'Most popular'.
 * The /organisers proof block's half of this class is tests/unit/growth/organisers-showcase-sells-here.test.ts.
 */

const pricing = readFileSync(join(process.cwd(), 'src/components/templates/PricingPage.tsx'), 'utf8').replace(/\r\n/g, '\n')

describe('pricing claims only what is true', () => {
  test("no 'Most popular' badge on a tier", () => {
    const drawn = pricing.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '')
    expect(drawn).not.toMatch(/most popular/i)
  })
})
