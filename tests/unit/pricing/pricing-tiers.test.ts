import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRICING_FAQ, PRICING_TIERS } from '@/lib/pricing/tiers'
import { PAYOUT_LINE } from '@/lib/payments/payout-line'

/*
 * THE CONTROLLER'S 08:50 (5), FROM THE 5 NOVEMBER AUDIT: /pricing's Free tier said 'All platform features included' while
 * the Paid tier listed 'All features from Free tier' and then tools as if the fee bought them (squad booking, discount
 * codes), and things it does not buy or that do not exist ('Multi-currency checkout', 'Advanced sales analytics',
 * 'Dedicated payout support'). Free: every organiser tool included. Paid: only what the fee buys. One payout line.
 */
const tier = (id: string) => PRICING_TIERS.find((t) => t.id === id)!

describe('/pricing says what each tier is (the CONTROLLER 08:50 (5))', () => {
  it('the payout line is one sentence: sent within 5 business days, then the bank', () => {
    expect(PAYOUT_LINE).toBe('Sent within 5 business days of your event ending; your bank may take 1 to 3 more.')
  })

  it('Free includes every organiser tool', () => {
    expect(tier('free').features).toContain('Every organiser tool included')
    expect(tier('free').features).not.toContain('All platform features included')
  })

  it('Paid lists only what the fee buys: the card payment, its processing and the payout', () => {
    expect(tier('paid').features).toEqual(['Card payments taken for you at checkout', 'Card processing included: no second fee', PAYOUT_LINE])
  })

  it('the payout answer opens with the same line', () => {
    const answer = PRICING_FAQ.find((f) => /when do i get paid/i.test(f.q))?.a ?? ''
    expect(answer.startsWith(PAYOUT_LINE)).toBe(true)
  })
})

describe('no page says the money lands within 5 business days (one defect is a class)', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
  it.each([
    'src/components/features/organisers/payout-calculator.tsx',
    'src/components/templates/OrganisersLandingPage.tsx',
    'src/components/templates/PricingPage.tsx',
  ])('%s states the payout through PAYOUT_LINE', (file) => {
    const src = read(file)
    expect(src).not.toMatch(/lands within 5 business days|Paid to your account within 5 business days/)
  })
  it('the calculator and the organisers page read the one line', () => {
    expect(read('src/components/features/organisers/payout-calculator.tsx')).toMatch(/PAYOUT_LINE/)
    expect(read('src/components/templates/OrganisersLandingPage.tsx')).toMatch(/PAYOUT_LINE/)
  })
})
