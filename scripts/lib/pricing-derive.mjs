/**
 * DERIVES every worked fee figure in docs/PRICING.md from the PRICING-LOCK block.
 *
 * WHY THIS EXISTS. docs/PRICING.md declares itself the only place a fee figure
 * may be written down, and then wrote several MORE figures down underneath: a
 * worked example, an absorb example, a founding-window example and a margin
 * table. Those were prose, so nothing checked them, and on 15 August 2026 the
 * second fee was deleted while every one of them went on showing 2.19 in fees,
 * 22.19 all in and 20.50 during the founding window. The authority document was
 * the single largest source of the wrong number it existed to prevent.
 *
 * So the worked figures are no longer written. They are COMPUTED here from the
 * lock block, through the same rounding the charge uses, and rendered into the
 * document between generated markers. `--check` fails the build when the
 * committed text and the computed text differ, which makes drift impossible
 * rather than merely discouraged.
 *
 * The fee math is deliberately re-expressed here rather than imported from
 * src/lib/payments/fee-math.ts: this runs as a plain .mjs guard with no
 * TypeScript pipeline. `tests/unit/payments/pricing-doc-derived.test.ts` asserts
 * the two agree, so the duplication cannot silently diverge.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseLockedValues, PRICING_DOC } from '../../src/lib/health/pricing-lock.mjs'
import { normaliseEol } from '../guards/lib/source.mjs'

export const DERIVED_BEGIN = '<!-- PRICING-DERIVED:BEGIN -->'
export const DERIVED_END = '<!-- PRICING-DERIVED:END -->'

/**
 * STRIPE'S REAL COST TO EVENTLINQS, from Stripe's own published pages.
 *
 * Law 7: every figure here carries the primary source it came from and the date
 * it was fetched. Two of these corrected a stated premise, so both are recorded
 * with the correction rather than quietly applied.
 *
 * 1. THE RATE IS 1.70%, NOT 1.75%. Stripe reduced the Australian domestic
 *    card-not-present rate from `1.75% + A$0.30` to `1.70% + A$0.30` effective
 *    1 April 2024.
 *    https://support.stripe.com/questions/april-2024-pricing-update-for-businesses-on-standard-pricing-in-australia
 *    (fetched 15 August 2026)
 *
 * 2. THE FEE ALREADY INCLUDES GST, so 10 per cent must NOT be added on top.
 *    stripe.com/au/pricing states, verbatim, "Fees include GST." Adding GST to
 *    it would overstate the cost by about 10 per cent and understate the margin
 *    by the same, which is the opposite of the conservative error it looks like.
 *    https://stripe.com/au/pricing (fetched 15 August 2026)
 *
 * 3. UNSOURCED: the rate that applies AFTER 1 October 2026. The pricing page
 *    footnotes the 1.7% figure with "Lower pricing from 1 Oct 2026" and does not
 *    publish the new number anywhere on that page. The table below therefore
 *    describes the rate in force today and says so, rather than guessing at a
 *    figure that changes six weeks after launch.
 */
export const STRIPE_AU = {
  percent: 1.7,
  fixedCents: 30,
  gstIncluded: true,
  disputeFeeCents: 2500,
}

/** The prices the founder asked the margin to be shown at, in cents. */
export const MARGIN_PRICES_CENTS = [500, 1000, 2000, 3500, 5000, 10000, 20000]

/** Mirrors computeFeeLineCents in src/lib/payments/fee-math.ts exactly. */
export function platformFeeCents(subtotalCents, ticketCount, pct, fixedCents) {
  return Math.round((subtotalCents * pct) / 100 + ticketCount * fixedCents)
}

/** Stripe's cost on the amount actually charged to the card. */
export function stripeCostCents(chargedCents) {
  return (chargedCents * STRIPE_AU.percent) / 100 + STRIPE_AU.fixedCents
}

function money(cents) {
  return (cents / 100).toFixed(2)
}

/**
 * One row of the margin table, for a single-ticket order.
 *
 * SINGLE TICKET IS THE WORST CASE AND THAT IS WHY IT IS USED. The platform fee
 * carries a flat 99c PER TICKET while Stripe charges its 30c PER TRANSACTION, so
 * a two-ticket order earns a second 99c against the same 30c. Showing one ticket
 * states the floor rather than a flattering average.
 */
export function marginRow(priceCents, pct, fixedCents) {
  const fee = platformFeeCents(priceCents, 1, pct, fixedCents)
  const buyerPays = priceCents + fee
  const stripe = stripeCostCents(buyerPays)
  const margin = fee - stripe
  return { priceCents, fee, buyerPays, stripe, margin }
}

export function renderDerived(locked) {
  const pct = locked.platform_fee_percentage
  const fixed = locked.platform_fee_fixed
  const L = []

  L.push('')
  L.push('> GENERATED FROM THE LOCK BLOCK ABOVE. Do not hand-edit anything between')
  L.push('> the PRICING-DERIVED markers. Regenerate with')
  L.push('> `node scripts/pricing-derive.mjs --write`; `--check` runs in the guard')
  L.push('> suite and fails the build if this text and the lock block disagree.')
  L.push('')

  // ---- The worked example, pass-on ----
  const one = marginRow(2000, pct, fixed)
  L.push('### One 20.00 ticket at the public rates (pass-on, the default)')
  L.push('')
  L.push('| Component | Working | Cents | AUD |')
  L.push('|---|---|---|---|')
  L.push('| Merchandise subtotal | 1 x 2000 | 2000 | 20.00 |')
  L.push(
    `| EventLinqs fee | round(2000 x ${pct} / 100 + 1 x ${fixed}) | ${one.fee} | ${money(one.fee)} |`,
  )
  L.push('| Tax | GST-inclusive posture | 0 | 0.00 |')
  L.push(`| **Total fees** | the one fee | **${one.fee}** | **${money(one.fee)}** |`)
  L.push(
    `| **Buyer pays** | 2000 + ${one.fee} | **${one.buyerPays}** | **${money(one.buyerPays)}** |`,
  )
  L.push('| **Organiser keeps** | full face value | **2000** | **20.00** |')
  L.push('')
  L.push(
    `There is ONE fee line. A 20.00 ticket carries ${money(one.fee)} in fees and the` +
      ' organiser keeps the full 20.00.',
  )
  L.push('')

  // ---- Absorb ----
  L.push('### The same ticket, ABSORB mode')
  L.push('')
  L.push('| Component | Cents | AUD |')
  L.push('|---|---|---|')
  L.push('| Buyer pays | 2000 | 20.00 |')
  L.push(`| Fee deducted from payout | ${one.fee} | ${money(one.fee)} |`)
  L.push(
    `| **Organiser receives** | **${2000 - one.fee}** | **${money(2000 - one.fee)}** |`,
  )
  L.push('')

  // ---- Founding window ----
  L.push('### The same ticket during the founding fee-free window')
  L.push('')
  L.push(
    'The one fee is waived to zero. There is no second fee left to charge, so a' +
      ' waived ticket is now genuinely free of charge.',
  )
  L.push('')
  L.push('| Component | Cents | AUD |')
  L.push('|---|---|---|')
  L.push('| Merchandise subtotal | 2000 | 20.00 |')
  L.push('| EventLinqs fee (waived) | 0 | 0.00 |')
  L.push('| **Buyer pays** | **2000** | **20.00** |')
  L.push('| **Organiser keeps** | **2000** | **20.00** |')
  L.push('')
  L.push('<!-- ONE-FEE-ALLOW-BEGIN: contrasts the current anchor with the deleted one. -->')
  L.push(
    '**20.00 all in, not 20.50.** Under the two-fee model the processing line was' +
      ' never waived, so "completely fee-free" was 50 cents short of true. It is' +
      ' literally true now.',
  )
  L.push('<!-- ONE-FEE-ALLOW-END -->')
  L.push('')

  // ---- Margin table ----
  L.push('### What EventLinqs actually earns, after Stripe')
  L.push('')
  L.push(
    `Stripe's Australian domestic card-not-present rate is **${STRIPE_AU.percent}% +` +
      ` A$${money(STRIPE_AU.fixedCents)}**, and Stripe states "Fees include GST", so` +
      ' GST is NOT added on top of it.',
  )
  L.push('')
  L.push(
    'Stripe charges on the amount actually put through the card, which is the' +
      ' ticket plus the fee in pass-on mode. One ticket per order is assumed, which' +
      ' is the WORST case: the EventLinqs fee carries a flat component per TICKET' +
      ' while Stripe charges its 30c per TRANSACTION, so every additional ticket on' +
      ' the same order widens the margin.',
  )
  L.push('')
  L.push('| Ticket | EventLinqs fee | Buyer pays | Stripe cost | **EventLinqs margin** |')
  L.push('|---|---|---|---|---|')
  for (const p of MARGIN_PRICES_CENTS) {
    const r = marginRow(p, pct, fixed)
    L.push(
      `| ${money(r.priceCents)} | ${money(r.fee)} | ${money(r.buyerPays)} |` +
        ` ${money(r.stripe)} | **${money(r.margin)}** |`,
    )
  }
  L.push('')
  L.push(
    'The margin is positive at every price and never inverts, because the fee' +
      " grows faster than Stripe's share of it. A dispute costs A$" +
      `${money(STRIPE_AU.disputeFeeCents)}, which exceeds the margin on every ticket` +
      ' in this table, so chargebacks are the real margin risk rather than the rate.',
  )
  L.push('')

  return L.join('\n')
}

/**
 * The fee document, always LF, whatever the checkout did to it.
 *
 * WHY. `--check` compares the block CURRENTLY in the document against a block
 * this file RENDERS. The rendered text is built with \n. The document is
 * materialised CRLF on Windows (`git ls-files --eol docs/PRICING.md` reports
 * `i/lf  w/crlf`), so the two could never be equal there and `--check` failed
 * on every run with "the worked figures do not match", on a document whose
 * figures were correct.
 *
 * That failure is not merely noisy. Its own remedy is `--write`, so the guard
 * protecting the single authority for every fee figure was instructing a
 * rewrite of that document on the strength of a line ending. Normalising here,
 * at the one read, means the comparison and the splice both see the same bytes
 * the CI runner sees.
 */
export function readDoc(repoRoot) {
  return normaliseEol(fs.readFileSync(path.join(repoRoot, PRICING_DOC), 'utf8'))
}

export function spliceDerived(text, rendered) {
  const s = text.indexOf(DERIVED_BEGIN)
  const e = text.indexOf(DERIVED_END)
  if (s === -1 || e === -1 || e < s) {
    throw new Error(
      `${PRICING_DOC} has no ${DERIVED_BEGIN} ... ${DERIVED_END} block to write into.`,
    )
  }
  return text.slice(0, s + DERIVED_BEGIN.length) + '\n' + rendered + text.slice(e)
}

export function currentDerived(text) {
  const s = text.indexOf(DERIVED_BEGIN)
  const e = text.indexOf(DERIVED_END)
  if (s === -1 || e === -1 || e < s) return null
  return text.slice(s + DERIVED_BEGIN.length, e)
}

export { parseLockedValues }
