import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCENARIO_FRACTIONS, forecast } from '@/lib/forecast/arithmetic'
import {
  MEASURED_IS_REACHABLE,
  METHOD_SENTENCE,
  methodOf,
  methodSentence,
} from '@/lib/forecast/method'
import { centsAsFormDollars, feeSentence, presentBreakEven } from '@/lib/forecast/present'
import { decodeShape, encodeShape, shapeIsEmpty } from '@/lib/forecast/shape-cookie'
import { feePassTypeFrom, positiveInteger } from '@/lib/forecast/params'
import { forecastSignupPath } from '@/lib/growth/loops'
import type { FeeRates } from '@/lib/payments/fee-math'

/**
 * CLOSE-OUT FT1. THE FREE FORECAST, AND THE HONEST ARITHMETIC IT STARTS WITH.
 *
 * The owner's correction is the standard every one of these holds the tool to:
 * on day zero the output is plain arithmetic and it says so in plain words. A
 * tool that lies on day one cannot be trusted on day one hundred.
 */

const ROOT = process.cwd()
/** A rate, passed in. Nothing here reads one: that is the point of the design. */
const RATES: FeeRates = { platformFeePercent: 3.5, platformFeeFixedCents: 99 }
const OTHER_RATES: FeeRates = { platformFeePercent: 7, platformFeeFixedCents: 200 }

const base = {
  capacity: 100,
  ticketPriceCents: 5000,
  costsCents: 100_000,
  daysUntilEvent: 20,
  feePassType: 'pass_to_buyer' as const,
}

describe('FT1 acceptance 1: the break even calculation, at three prices and two capacities', () => {
  it('break_even_at_three_prices_with_the_fee_read_from_configuration', () => {
    // PASS-ON: the buyer carries the fee, so the organiser keeps face value and
    // break even is costs divided by price, rounded up.
    for (const [priceCents, expected] of [
      [2500, 40],
      [5000, 20],
      [12500, 8],
    ] as const) {
      const result = forecast({ ...base, ticketPriceCents: priceCents }, RATES)
      expect(result.breakEven.tickets, `at ${priceCents} cents`).toBe(expected)
    }
  })

  it('break_even_at_two_capacities_says_when_the_room_is_too_small', () => {
    const roomy = forecast({ ...base, capacity: 100 }, RATES)
    expect(roomy.breakEven.withinCapacity).toBe(true)
    const tiny = forecast({ ...base, capacity: 10 }, RATES)
    expect(tiny.breakEven.tickets).toBe(20)
    expect(tiny.breakEven.withinCapacity).toBe(false)
  })

  it('absorbing_the_fee_takes_it_out_of_what_a_ticket_leaves_you', () => {
    const passOn = forecast(base, RATES)
    const absorb = forecast({ ...base, feePassType: 'absorb' }, RATES)
    expect(passOn.breakEven.keepsPerTicketCents).toBe(5000)
    // 3.5% of 5000 is 175, plus 99 flat, so 274 comes out of the payout.
    expect(absorb.breakEven.keepsPerTicketCents).toBe(5000 - 274)
    expect(absorb.breakEven.tickets).toBeGreaterThan(passOn.breakEven.tickets as number)
  })

  it('changing_the_fee_configuration_changes_the_numbers', () => {
    const cheap = forecast({ ...base, feePassType: 'absorb' }, RATES)
    const dear = forecast({ ...base, feePassType: 'absorb' }, OTHER_RATES)
    expect(dear.breakEven.keepsPerTicketCents).toBeLessThan(cheap.breakEven.keepsPerTicketCents)
    expect(dear.scenarios[0].feeCents).toBeGreaterThan(cheap.scenarios[0].feeCents)
    // And the page's fee sentence follows the same number, because it is built
    // from the rate rather than carrying one.
    expect(feeSentence(RATES.platformFeePercent, RATES.platformFeeFixedCents, 'AUD')).toContain('3.5 per cent')
    expect(feeSentence(OTHER_RATES.platformFeePercent, OTHER_RATES.platformFeeFixedCents, 'AUD')).toContain('7 per cent')
  })

  it('the_founding_figure_is_the_same_arithmetic_with_the_waiver_applied', () => {
    const result = forecast({ ...base, feePassType: 'absorb' }, RATES)
    for (const scenario of result.scenarios) {
      expect(scenario.foundingFeeCents).toBe(0)
      expect(scenario.foundingKeepsCents).toBeGreaterThanOrEqual(scenario.organiserKeepsCents)
    }
  })

  it('a_night_with_no_stated_costs_has_no_break_even_number_and_says_so', () => {
    const result = forecast({ ...base, costsCents: 0 }, RATES)
    expect(result.breakEven.tickets).toBeNull()
    const shown = presentBreakEven(result.breakEven, base.capacity, 'AUD')
    expect(shown.headline).toContain('costs you nothing')
  })

  it('days_until_the_event_turn_the_number_into_a_rate_and_never_into_a_prediction', () => {
    const inTwenty = forecast(base, RATES)
    expect(inTwenty.breakEven.tickets).toBe(20)
    expect(inTwenty.breakEven.ticketsPerDay).toBe(1)
    // Today: a rate over zero days is a division this refuses to invent.
    const today = forecast({ ...base, daysUntilEvent: 0 }, RATES)
    expect(today.breakEven.ticketsPerDay).toBeNull()
    // And the arithmetic itself is unchanged by the days, which is the honest
    // part: how long you have does not change how many you must sell.
    expect(today.breakEven.tickets).toBe(inTwenty.breakEven.tickets)
  })

  it('the_scenarios_are_fractions_of_the_room_and_nothing_else', () => {
    const result = forecast(base, RATES)
    expect(result.scenarios.map(s => s.tickets)).toEqual([25, 50, 100])
    expect(SCENARIO_FRACTIONS.map(f => f.key)).toEqual(['quarter', 'half', 'full'])
  })

  it('nothing_can_be_worked_out_without_a_room_and_a_price', () => {
    expect(forecast({ ...base, capacity: 0 }, RATES).unanswerable).toBe(true)
    expect(forecast({ ...base, ticketPriceCents: 0 }, RATES).unanswerable).toBe(true)
    expect(forecast(base, RATES).unanswerable).toBe(false)
  })
})

describe('FT1 acceptance 2: the event type list is read, never typed', () => {
  const reader = readFileSync(join(ROOT, 'src/lib/forecast/read.ts'), 'utf8')
  const page = readFileSync(join(ROOT, 'src/app/forecast/page.tsx'), 'utf8')

  it('the reader queries the taxonomy tables', () => {
    expect(reader).toContain("from('event_categories')")
    expect(reader).toContain("from('cities')")
  })

  it('the page holds no list of its own', () => {
    expect(page).not.toMatch(/const\s+(EVENT_TYPES|CATEGORIES|CITIES)\s*=/)
    expect(page).toContain('options.eventTypes.map')
    expect(page).toContain('options.cities.map')
  })

  it('the fee comes from the one resolver the charge uses', () => {
    expect(reader).toContain('getLivePublicFee')
  })

  it('the registered guard covers the same ground and is registered', () => {
    const guard = readFileSync(join(ROOT, 'scripts/guards/forecast-reads-every-number.mjs'), 'utf8')
    expect(guard).toContain('event_categories')
    const runner = readFileSync(join(ROOT, 'scripts/guards/run-guards.mjs'), 'utf8')
    expect(runner).toContain('scripts/guards/forecast-reads-every-number.mjs')
  })
})

describe('FT1 acceptance 3: the method sentence matches the method used', () => {
  it('an arithmetic result gets the arithmetic sentence', () => {
    const result = forecast(base, RATES)
    expect(methodOf(result)).toBe('arithmetic')
    expect(methodSentence(methodOf(result))).toBe(METHOD_SENTENCE.arithmetic)
  })

  it('the arithmetic sentence says what it is, what it is not, and what it becomes', () => {
    expect(METHOD_SENTENCE.arithmetic).toContain('arithmetic')
    expect(METHOD_SENTENCE.arithmetic).toContain('not a prediction')
    expect(METHOD_SENTENCE.arithmetic).toContain('becomes a measurement')
  })

  it('THE PAGE CANNOT SHOW A MEASURED CLAIM WHILE THE DATA BEHIND IT IS ARITHMETIC', () => {
    expect(MEASURED_IS_REACHABLE).toBe(false)
    // Asked for the better sentence, it hands back the modest one.
    expect(methodSentence('measured')).toBe(METHOD_SENTENCE.arithmetic)
    expect(methodSentence('measured')).not.toContain('measured from what events like yours')
  })

  it('the page prints the sentence the method chose, not a string of its own', () => {
    const page = readFileSync(join(ROOT, 'src/app/forecast/page.tsx'), 'utf8')
    expect(page).toContain('methodSentence(')
    expect(page).not.toContain('This is measured from what events like yours')
  })
})

describe('FT1: the call to action, and the shape it carries', () => {
  it('goes to the signup path carrying src=forecast', () => {
    const href = forecastSignupPath({ categoryId: 'music', city: 'melbourne', capacity: 120, priceCents: 3500 })
    expect(href.startsWith('/signup?')).toBe(true)
    expect(href).toContain('src=forecast')
    expect(href).toContain('role=organiser')
  })

  it('carries the shape onward, so it is not typed twice', () => {
    const href = forecastSignupPath({ categoryId: 'music', city: 'melbourne', capacity: 120, priceCents: 3500 })
    const next = new URL(href, 'https://x.test').searchParams.get('next')
    expect(next).toContain('/dashboard/events/create')
    expect(next).toContain('capacity=120')
    expect(next).toContain('price=3500')
  })

  it('sits BELOW the result in the page, never above it', () => {
    const page = readFileSync(join(ROOT, 'src/app/forecast/page.tsx'), 'utf8')
    const result = page.indexOf('data-forecast="break-even"')
    const cta = page.indexOf('data-forecast="cta"')
    expect(result).toBeGreaterThan(-1)
    expect(cta).toBeGreaterThan(result)
  })

  it('the shape survives a round trip through the cookie, bounded', () => {
    const shape = { categoryId: 'music', city: 'melbourne', capacity: 120, priceCents: 3500 }
    expect(decodeShape(encodeShape(shape))).toEqual(shape)
    // A crafted cookie cannot write a kilobyte or a negative room.
    const crafted = encodeShape({ categoryId: 'x'.repeat(500), city: null, capacity: -5, priceCents: 9e12 })
    const read = decodeShape(crafted)
    expect((read.categoryId ?? '').length).toBeLessThanOrEqual(64)
    expect(read.capacity).toBeNull()
    expect(read.priceCents).toBe(100_000_000)
  })

  it('an empty shape sets no cookie at all', () => {
    expect(shapeIsEmpty({ categoryId: null, city: null, capacity: null, priceCents: null })).toBe(true)
    expect(shapeIsEmpty({ categoryId: null, city: null, capacity: 10, priceCents: null })).toBe(false)
  })

  it('answers nothing to a tampered cookie rather than throwing', () => {
    expect(decodeShape('not-base64-at-all')).toEqual({ categoryId: null, city: null, capacity: null, priceCents: null })
  })
})

describe('FT1: reading a forecast off the query string', () => {
  it('a repeated parameter takes the first and a negative one takes nothing', () => {
    expect(positiveInteger(['120', '999'])).toBe(120)
    expect(positiveInteger('-5')).toBe(0)
    expect(positiveInteger(undefined)).toBe(0)
  })

  it('an unrecognised fee posture falls to the platform default', () => {
    expect(feePassTypeFrom('absorb')).toBe('absorb')
    expect(feePassTypeFrom('something-else')).toBe('pass_to_buyer')
    expect(feePassTypeFrom(undefined)).toBe('pass_to_buyer')
  })

  it('money goes into the form as dollars and nowhere else does the division', () => {
    expect(centsAsFormDollars(3500)).toBe('35.00')
    expect(centsAsFormDollars(0)).toBe('')
    const page = readFileSync(join(ROOT, 'src/app/forecast/page.tsx'), 'utf8')
    expect(page).not.toContain('/ 100')
  })
})

describe('FT1 acceptance 6: the copy laws hold in every sentence this page can print', () => {
  const strings = [
    METHOD_SENTENCE.arithmetic,
    METHOD_SENTENCE.measured,
    feeSentence(3.5, 99, 'AUD'),
    presentBreakEven(forecast(base, RATES).breakEven, base.capacity, 'AUD').headline,
  ]

  it('no em dash, no en dash and no hyphen with spaces around it', () => {
    for (const s of strings) {
      expect(s, s).not.toMatch(/[–—]/)
      expect(s, s).not.toMatch(/ - /)
    }
  })

  it('no exclamation mark, and no claim of accuracy the method does not support', () => {
    for (const s of strings) {
      expect(s, s).not.toContain('!')
      expect(s.toLowerCase(), s).not.toContain('guarantee')
      expect(s.toLowerCase(), s).not.toContain('accurate')
    }
  })

  it('names no competitor', () => {
    const page = readFileSync(join(ROOT, 'src/app/forecast/page.tsx'), 'utf8')
    for (const name of ['Eventbrite', 'Ticketmaster', 'Humanitix', 'TryBooking', 'Moshtix', 'Oztix']) {
      expect(page, name).not.toContain(name)
    }
  })
})
