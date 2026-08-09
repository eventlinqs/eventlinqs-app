/**
 * A buyer sent away from checkout must be told what happened.
 *
 * THE DEFECT. checkout/[reservation_id]/page.tsx redirects to
 * `/events?error=reservation_expired` when a hold runs out, and to
 * `?error=reservation_not_found` in three other cases. `EventsSearchParams`
 * has no `error` key and no surface read one, so a person part-way through
 * paying had their seats released and landed on the national browse list in
 * silence: no message, no reason, no way back to the event they were buying.
 *
 * These assertions fail against main, where reservation-notice.tsx does not
 * exist and the expiry branch redirects to the national list.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

const CHECKOUT = 'src/app/checkout/[reservation_id]/page.tsx'
const NOTICE = 'src/components/checkout/reservation-notice.tsx'

describe('every code checkout redirects with is rendered somewhere', () => {
  const checkout = read(CHECKOUT)
  const notice = read(NOTICE)

  it('finds redirect codes in checkout, so the suite cannot pass vacuously', () => {
    const codes = [...checkout.matchAll(/[?&](?:error|notice)=([a-z_]+)/g)].map((m) => m[1])
    expect(codes.length).toBeGreaterThan(0)
  })

  it('has copy for every code checkout can redirect with', () => {
    const codes = [...new Set([...checkout.matchAll(/[?&](?:error|notice)=([a-z_]+)/g)].map((m) => m[1]))]
    const missing = codes.filter((c) => !notice.includes(`${c}:`))
    expect(missing, `no copy for: ${missing.join(', ')}`).toEqual([])
  })

  it('reads both the legacy error param and the newer notice param', () => {
    // Three call sites still write `error`; dropping either read would put
    // those buyers back into silence.
    expect(notice).toMatch(/params\.get\('notice'\)/)
    expect(notice).toMatch(/params\.get\('error'\)/)
  })

  it('returns an expired buyer to the event they were buying, not the national list', () => {
    expect(checkout).toMatch(/\/events\/\$\{expiredEvent\.slug\}\?notice=reservation_expired/)
  })

  it('still has a fallback when the event slug cannot be resolved', () => {
    expect(checkout).toContain("'/events?notice=reservation_expired'")
  })

  it('tells the buyer nothing was charged, because that is their first fear', () => {
    expect(notice).toMatch(/nothing was charged/i)
  })

  it('offers a way back rather than only an explanation', () => {
    expect(notice).toContain('backHref')
  })

  it('is rendered on both surfaces a redirected buyer can land on', () => {
    expect(read('src/app/events/page.tsx')).toContain('ReservationNotice')
    expect(read('src/app/events/[slug]/page.tsx')).toContain('ReservationNotice')
  })

  it('uses role="status" so a screen reader announces it', () => {
    expect(notice).toContain('role="status"')
  })
})
