import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CONNECT_CURRENCY_MAP, getCurrencyForCountry } from '@/lib/payments/connect-currency'
import * as applicationFee from '@/lib/payments/application-fee'

/**
 * THE LEAF MUST STAY A LEAF.
 *
 * `src/lib/payments/sale-status.ts` is reached from `ticket-selector.tsx`, a
 * client component, so every value import it makes is shipped to a buyer's
 * browser. It used to take `getCurrencyForCountry` from `application-fee.ts`,
 * and that one edge pulled pricing-rules, the Redis client, `@upstash/redis`
 * and a 16.0 KB Buffer polyfill onto the event page and the checkout: 17.5 KB
 * gzip of server-only code on the two surfaces that sell tickets.
 *
 * `scripts/guards/no-client-redis-import.mjs` blocks the build if a client
 * component reaches Redis again. This asserts the other half, which a graph
 * walk cannot: that the module the checkout reads instead has no imports AT
 * ALL, and that moving it changed nothing about what any fee resolves to.
 */
describe('connect-currency', () => {
  it('imports_nothing_so_the_client_chain_cannot_be_rebuilt_through_it', () => {
    const src = readFileSync('src/lib/payments/connect-currency.ts', 'utf8')
    const imports = [...src.matchAll(/^\s*import\s[^\n]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(
      imports,
      'connect-currency.ts must import nothing. It is imported by sale-status.ts, which is ' +
        'imported by a client component, so any value import here is shipped to every buyer.',
    ).toEqual([])
  })

  it('application_fee_re_exports_the_same_members_so_no_caller_changed', () => {
    expect(applicationFee.getCurrencyForCountry).toBe(getCurrencyForCountry)
    expect(applicationFee.CONNECT_CURRENCY_MAP).toBe(CONNECT_CURRENCY_MAP)
  })

  it('the_move_changed_no_currency_any_country_resolves_to', () => {
    // Spot values across all five currencies the map carries, plus the three
    // refusals sale-status depends on to keep an unsupported country off sale.
    expect(getCurrencyForCountry('AU')).toBe('AUD')
    expect(getCurrencyForCountry('GB')).toBe('GBP')
    expect(getCurrencyForCountry('US')).toBe('USD')
    expect(getCurrencyForCountry('CA')).toBe('CAD')
    expect(getCurrencyForCountry('NZ')).toBe('NZD')
    expect(getCurrencyForCountry('DE')).toBe('EUR')
    expect(getCurrencyForCountry('au')).toBe('AUD')
    expect(getCurrencyForCountry('NG')).toBeNull()
    expect(getCurrencyForCountry(null)).toBeNull()
    expect(getCurrencyForCountry('')).toBeNull()
    expect(Object.keys(CONNECT_CURRENCY_MAP)).toHaveLength(32)
  })
})
