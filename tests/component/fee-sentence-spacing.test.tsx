/**
 * A FEE SENTENCE READS AS A SENTENCE, NOT AS TWO ELEMENTS THAT LOOK SEPARATED.
 *
 * ============================================================================
 * THE DEFECT, AND WHY EVERY VISUAL PASS MISSED IT
 * ============================================================================
 *
 * Close-out SEO4 step 6 reports two strings being served right now:
 *
 *     "3.5% + AUD 0.99per paid ticket sold"        /pricing
 *     "EventLinqs fee 3.5% + $0.99 per ticket$2.04" the payout calculator
 *
 * Both are two adjacent inline elements separated by CSS (`ml-2` on the first,
 * `justify-between` on the second) with no whitespace CHARACTER between them. A
 * sighted user sees a gap. `textContent` does not, so:
 *
 *   - a screen reader announces "nought point nine nine per paid ticket sold"
 *     as one run, with the number welded to the next word,
 *   - anybody who copies the sentence copies it broken,
 *   - and every scraper, snippet and audit reads it that way, which is exactly
 *     how this was found.
 *
 * So it is a TEXT defect that is invisible on screen, which is why no screenshot
 * pass and no design review could ever have caught it.
 *
 * ============================================================================
 * WHY THE TEST RENDERS RATHER THAN READS THE SOURCE
 * ============================================================================
 *
 * The source is not wrong in any way a reader can see. `{fee.label}` and
 * `{tier.priceDetail}` are two perfectly ordinary expressions in two perfectly
 * ordinary spans. The defect only exists in the OUTPUT, so the output is what is
 * asserted: each component is rendered, its text content is extracted exactly as
 * a screen reader or a scraper would take it, and the joins are inspected.
 *
 * The rule is the one the close-out names, plus its mirror. "A missing space
 * between a numeral and a following word" is `9p` in `0.99per`. The second
 * defect is `t$` in `ticket$2.04`, a word welded to the START of an amount,
 * which is the same fault with the operands swapped and would not be caught by
 * the stated rule alone. Both are checked, and the mirror is checked because
 * leaving it out would have let one of the two reported defects through.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

/** The shared chrome suspends; it is not what this file is about. */
vi.mock('@/components/layout/PageShell', () => ({
  PageShell: ({ children }: { children: unknown }) => children,
}))
vi.mock('@/lib/flags', () => ({ isFlagEnabled: async () => true }))

/** The live fee, stubbed at the SHAPE the resolver returns, values fixed. */
const FEE = {
  percent: 3.5,
  fixedCents: 99,
  currency: 'AUD',
  percentLabel: '3.5%',
  fixedLabel: 'AUD 0.99',
  label: '3.5% + AUD 0.99',
  source: 'live' as const,
}
vi.mock('@/lib/pricing/live-fee', () => ({ getLivePublicFee: async () => FEE }))
vi.mock('@/lib/pricing/event-fee-config', () => ({
  getEventFeeRates: async () => ({ platformFeePercent: 3.5, platformFeeFixedCents: 99 }),
}))
/*
 * The organiser landing also reads live platform counts and renders the media
 * components. Neither is what this file is about, and both reach for a Supabase
 * client that does not exist in a unit test. The counts are stubbed at the
 * SHAPE the module returns, and `HeroMedia` / `MarketingMedia` are replaced with
 * the plain `img` they ultimately render, so the page's own TEXT is produced in
 * full and nothing that could carry a fee sentence is stubbed away.
 */
vi.mock('@/lib/stats/platform-stats', () => ({
  getPlatformStats: async () => ({
    source: 'fallback' as const,
    eventsListed: null,
    citiesCovered: null,
    communitiesRepresented: null,
    organisersOnboarded: null,
  }),
}))
/*
 * `OrganiserCommunityStrip` is an async server component, and
 * `renderToStaticMarkup` is synchronous by definition, so it suspends and takes
 * the whole tree with it. It carries no fee sentence: it is the community tile
 * strip, and it is the file this lane raised as a BORDER for lane B. Replaced
 * with nothing, so every line of the page that DOES talk about money still
 * renders and is still read.
 */
vi.mock('@/components/features/organisers/community-strip', () => ({
  OrganiserCommunityStrip: () => null,
}))
vi.mock('@/components/media', () => ({
  HeroMedia: ({ alt }: { alt?: string }) => createElement('img', { alt: alt ?? '' }),
  MarketingMedia: ({ alt }: { alt?: string }) => createElement('img', { alt: alt ?? '' }),
}))

/**
 * The text a screen reader or a scraper takes off the markup.
 *
 * AN INLINE BOUNDARY IS NOT A SPACE. A BLOCK BOUNDARY IS. That distinction is
 * the whole detector, and the first draft of this file did not make it: it
 * stripped every tag alike and reported seven welds in the payout calculator, of
 * which five were a heading following a button and a description following an
 * amount. Those are separate blocks. A screen reader announces them as separate
 * runs, nothing renders them on one line, and reporting them would have buried
 * the two real defects in noise and taught the next reader to ignore this test.
 *
 * `<span>` beside `<span>` is the real thing: one run of text, one announcement,
 * one copied string, and the only separation is a CSS margin that exists for
 * nobody who is not looking at it. Both defects the close-out reports are that
 * shape.
 */
const BLOCK_TAGS =
  'div|p|li|ul|ol|dl|dt|dd|h1|h2|h3|h4|h5|h6|section|article|aside|header|footer|nav|main|' +
  'table|thead|tbody|tr|td|th|button|label|form|fieldset|legend|br|hr|figure|figcaption|' +
  'blockquote|pre|details|summary|option|select|textarea|input|img|svg|path'

function textOf(html: string): string {
  return html
    .replace(new RegExp(`</?(?:${BLOCK_TAGS})(?:\\s[^>]*)?/?>`, 'gi'), ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
}

/** Every join where a number and a word are welded together. */
export function weldedJoins(text: string): string[] {
  const found: string[] = []
  // A numeral immediately followed by a letter: "0.99per".
  for (const m of text.matchAll(/\d[A-Za-z]{2,}/g)) {
    // `3.5x` style suffixes are not words; require two letters, and exclude the
    // handful of legitimate unit suffixes a money surface really does use.
    if (/^\d(?:st|nd|rd|th|pm|am|kb|mb|gb)$/i.test(m[0])) continue
    found.push(m[0])
  }
  // A letter immediately followed by the start of an amount: "ticket$2.04".
  for (const m of text.matchAll(/[A-Za-z][$][\d]/g)) found.push(m[0])
  return found
}

describe('the detector itself', () => {
  it('catches both reported shapes and stays quiet on correct copy', () => {
    expect(weldedJoins('3.5% + AUD 0.99per paid ticket sold')).toContain('9per')
    expect(weldedJoins('EventLinqs fee 3.5% + $0.99 per ticket$2.04')).toContain('t$2')
    expect(weldedJoins('3.5% + AUD 0.99 per paid ticket sold')).toEqual([])
    expect(weldedJoins('EventLinqs fee 3.5% + $0.99 per ticket $2.04')).toEqual([])
    // A percentage, an ordinal and a time are not defects.
    expect(weldedJoins('3.5% of the ticket price, paid on the 1st, from 7pm')).toEqual([])
  })
})

describe('/pricing states its fee as a sentence', () => {
  it('has no numeral welded to the word after it', async () => {
    const { PricingPage } = await import('@/components/templates/PricingPage')
    const html = renderToStaticMarkup(await PricingPage())
    const text = textOf(html)

    // The fee is on the page at all, so a page that failed to render its fee
    // cannot pass this file by having nothing to check.
    expect(text).toContain('3.5%')
    expect(weldedJoins(text)).toEqual([])
  })
})

describe('/organisers states its fee as a sentence', () => {
  it('has no numeral welded to the word after it', async () => {
    // THIS SURFACE WAS NOT IN THE CLOSE-OUT, and it carried the same defect.
    // The item names /pricing and the payout calculator; the organiser landing
    // renders the same fee label followed by the same `ml-2` span, so its text
    // content read "AUD 0.99per paid ticket sold" too. It was found by adding
    // the surface to this file rather than by reading the source, which is the
    // argument for the test rendering rather than grepping.
    const { OrganisersLandingPage } = await import('@/components/templates/OrganisersLandingPage')
    const html = renderToStaticMarkup(await OrganisersLandingPage())
    const text = textOf(html)

    expect(text).toContain('3.5%')
    expect(weldedJoins(text)).toEqual([])
  })
})

describe('the payout calculator states its fee as a sentence', () => {
  it('has no amount welded to the word before it', async () => {
    const { PayoutCalculator } = await import('@/components/features/organisers/payout-calculator')
    const html = renderToStaticMarkup(
      createElement(PayoutCalculator, {
        rates: { platformFeePercent: 3.5, platformFeeFixedCents: 99 },
        currency: 'AUD',
      }),
    )
    const text = textOf(html)

    expect(text).toContain('EventLinqs fee')
    expect(weldedJoins(text)).toEqual([])
  })
})
