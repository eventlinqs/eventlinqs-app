/**
 * THE SALE GATE MUST NOT BE FED FROM THE PUBLIC EMBED.
 *
 * THE DEFECT THIS PINS (15 August 2026, found by walking the deployed preview).
 * A SECURITY FIX SILENTLY TURNED OFF TICKET SALES ON EVERY PAID EVENT.
 *
 * Migration 20260808000010 revoked `stripe_account_id`, `stripe_charges_enabled`,
 * `email`, `phone` and `owner_id` on `organisations` from `anon`. Correct, and it
 * must stay. The event page's embed was narrowed to the six columns anon may
 * still read. Also correct.
 *
 * What nobody joined up: `isOrganiserSellable(org)` requires
 * `stripe_account_id` AND `stripe_charges_enabled === true`, and neither is in
 * that list any more. Both arrived `undefined`, the guard returned false for
 * EVERY organiser, and `saleBlocked` became true for EVERY PAID EVENT. Each one
 * rendered "This organiser is still finishing their payment setup. Check back
 * soon." with no way to buy a ticket.
 *
 * It was invisible because the state it renders is a real, designed state. An
 * organiser who genuinely has not onboarded sees exactly the same page, so the
 * platform looked like it was behaving correctly while refusing every sale.
 *
 * Two things are pinned here, and they pull in opposite directions on purpose:
 * the security narrowing must not be undone, AND the gate must not read from it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isOrganiserSellable } from '@/lib/payments/sale-status'

const ROOT = path.resolve(__dirname, '../../..')
const PAGE = readFileSync(path.join(ROOT, 'src/app/events/[slug]/page.tsx'), 'utf8')

/** The exact shape the public (anon) embed can return. */
const PUBLIC_ORG_SHAPE = {
  id: 'org-1',
  name: 'A Real Organiser',
  slug: 'a-real-organiser',
  description: null,
  logo_url: null,
  website: null,
}

describe('the organiser sale gate', () => {
  it('returns FALSE for the public embed shape, which is the whole trap', () => {
    // Not a bug in isOrganiserSellable: it is right to refuse when it cannot see
    // the Stripe posture. The bug was handing it an object that never carries it.
    expect(isOrganiserSellable(PUBLIC_ORG_SHAPE as never)).toBe(false)
  })

  it('returns TRUE only with both Stripe fields present and enabled', () => {
    expect(isOrganiserSellable({ stripe_account_id: 'acct_1', stripe_charges_enabled: true } as never)).toBe(true)
    expect(isOrganiserSellable({ stripe_account_id: 'acct_1', stripe_charges_enabled: false } as never)).toBe(false)
    expect(isOrganiserSellable({ stripe_account_id: null, stripe_charges_enabled: true } as never)).toBe(false)
  })

  it('the event page does NOT derive sellability from event.organisation', () => {
    // The regression, expressed exactly: passing the anon-embedded organisation
    // into the gate blocks every paid event on the platform.
    expect(
      /isOrganiserSellable\(\s*event\.organisation\s*\)/.test(PAGE),
      'src/app/events/[slug]/page.tsx passes the public embed into isOrganiserSellable. ' +
        'anon cannot read stripe_account_id or stripe_charges_enabled (migration ' +
        '20260808000010), so that makes saleBlocked true for EVERY paid event.',
    ).toBe(false)
  })

  it('the event page reads the Stripe posture with a privileged client instead', () => {
    expect(
      /createAdminClient/.test(PAGE) && /stripe_charges_enabled/.test(PAGE),
      'the sale gate must read stripe_account_id / stripe_charges_enabled with the ' +
        'service role in the server component, and collapse them to a boolean before ' +
        'anything crosses the client boundary.',
    ).toBe(true)
  })

  it('the PUBLIC embed still refuses the revoked columns, so the security fix stands', () => {
    // The other direction. Fixing the sale gate by widening the anon embed would
    // put a Stripe account id (and, with a wildcard, email and phone) back into a
    // public page. The embed must stay narrow.
    const embed = PAGE.match(/organisation:organisations\(([^)]*)\)/)?.[1] ?? ''
    expect(embed, 'no organisation embed found on the event page').not.toBe('')
    for (const revoked of ['stripe_account_id', 'stripe_charges_enabled', 'email', 'phone', 'owner_id']) {
      expect(embed.includes(revoked), `the public embed must not request ${revoked}`).toBe(false)
    }
    expect(embed.includes('*'), 'the public embed must never be a wildcard').toBe(false)
  })
})
