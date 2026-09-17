/**
 * GUARD: NO BUYER IS SHOWN A NUMBER THEY WILL NOT PAY.
 *
 * ============================================================================
 * THE INVARIANT, AS CLOSE-OUT SEO4 STATES IT
 * ============================================================================
 *
 * "No price rendered to a buyer anywhere may be a value the buyer will not pay,
 * every displayed total resolves to the pricing configuration, and no fee value
 * is a literal in any file."
 *
 * A live audit on 13 September 2026 found the event page showing
 * `From AUD $18.00` for an event nobody could leave for eighteen dollars, and
 * telling the buyer the booking fee would not be returned without ever saying
 * what the booking fee was. Nothing failed. There was nothing that could fail:
 * the number was correct, it was simply not the price.
 *
 * ============================================================================
 * WHY THIS IS A SEPARATE GUARD FROM one-fee-copy.mjs
 * ============================================================================
 *
 * That guard judges PROSE: whether a surface asserts a SECOND fee that no longer
 * exists. It is about a sentence. This one judges ARITHMETIC AND WIRING: whether
 * a surface that renders a price has the fee values in its hands, and whether
 * any file has a fee value of its own. The two have never overlapped, and the
 * defect this closes was invisible to that one because the copy was never wrong.
 *
 * ============================================================================
 * THE THREE CLAUSES
 * ============================================================================
 *
 * CLAUSE 1. THE FEE VALUE LIVES IN ONE PLACE.
 *   `pricing_rules` is the source and `src/lib/pricing/public-fee.ts` is the
 *   single reviewed last-resort fallback. Any OTHER file carrying the platform's
 *   fee percentage or its flat amount as a literal is a second source: it will
 *   be right today and stale the first time the owner moves the number in
 *   /admin/pricing, and nothing will say so. The rate is not written into this
 *   guard either; it is READ from the fallback constant, so this check cannot
 *   itself become the place the number is recorded.
 *
 * CLAUSE 2. A SURFACE THAT SHOWS A TOTAL HAS RESOLVED THE RATES.
 *   `allInPriceForOneTicket` and `priceLabel`'s all-in form both REQUIRE rates,
 *   and rates can only come from `getEventFeeRates` or `getLivePublicFee`, both
 *   of which go through `getPricingRule`. So the check is that the buyer-facing
 *   price surfaces named below actually call them. A surface that renders a face
 *   value and calls it the price is the defect, and it looks exactly like
 *   correct code.
 *
 * CLAUSE 3. NOBODY MULTIPLIES A PER-TICKET TOTAL TO GET A CART TOTAL.
 *   The fee line is rounded ONCE, so the per-ticket all-in price times the
 *   quantity is not the cart total: at AUD 18.50 on the launch rates one ticket
 *   is 2035 cents and two are 4069, not 4070, and the error can go either way.
 *   The cart total must come from the cart math. This is the shape somebody
 *   tidies into existence, so it is checked rather than commented.
 *
 * WHAT IT CANNOT SEE, said rather than implied: whether the RUNNING page renders
 * what it wired up. That is driven by scripts/verify/all-in-pricing-drive.mjs at
 * 390, 768 and 1440.
 *
 * Run: node scripts/guards/all-in-pricing.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, sep } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'src')

const failures = []
const fail = m => failures.push(m)

/** Source with comments removed. A comment is not a rendered price. */
function readCode(file) {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      yield* walk(full)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry)) yield full
  }
}

const rel = f => f.replace(ROOT + sep, '').split(sep).join('/')

/* ======================================================================== */
/* CLAUSE 1. The fee value is written down in exactly one place.            */
/* ======================================================================== */

/**
 * THE RATE IS READ, NEVER TYPED HERE.
 *
 * `public-fee.ts` is the one reviewed fallback and it carries the launch
 * baseline, so it is the honest place to learn what number to look for. Typing
 * 3.5 into this guard would make the guard itself the second source it exists
 * to forbid, and it would go stale the day the owner moves the rate.
 */
const FALLBACK = 'src/lib/pricing/public-fee.ts'
const fallbackSrc = readFileSync(join(ROOT, FALLBACK), 'utf8')
const percentMatch = /percent:\s*([\d.]+)/.exec(fallbackSrc)
const fixedMatch = /fixedCents:\s*(\d+)/.exec(fallbackSrc)
if (!percentMatch || !fixedMatch) {
  fail(
    `${FALLBACK} no longer declares PUBLIC_PLATFORM_FEE in the shape this guard reads\n` +
      '        (percent: <n>, fixedCents: <n>). Without it the guard cannot tell which\n' +
      '        literals are the fee, so it would pass by knowing nothing.',
  )
}
const FEE_PERCENT = percentMatch ? percentMatch[1] : null
const FEE_FIXED = fixedMatch ? fixedMatch[1] : null

/**
 * Files allowed to carry the fee VALUE, each with its reason. Printed on every
 * run; an entry that no longer matches is itself a failure, so the list cannot
 * rot into something nobody reads.
 */
const VALUE_ALLOWLIST = [
  {
    file: FALLBACK,
    reason:
      'THE one reviewed last-resort fallback, read only inside the catch path of getLivePublicFee so a public page never 500s. Named in CLAUDE.md as explicitly not a second source.',
  },
]

if (FEE_PERCENT && FEE_FIXED) {
  /*
   * THE PAIR, NOT EITHER ALONE. `3.5` on its own is a plausible number in a
   * hundred contexts (a rem value, a ratio, a rating) and `99` is even more so.
   * What identifies the FEE is the two appearing together in one file, which is
   * what a hardcoded fee looks like and what an unrelated coincidence does not.
   * Matching either alone would fire constantly and be switched off.
   */
  const percentRe = new RegExp(`(?<![\\w.])${FEE_PERCENT.replace('.', '\\.')}(?![\\w.])`)
  const fixedRe = new RegExp(`(?<![\\w.])${FEE_FIXED}(?![\\w.])`)

  const offenders = []
  for (const file of walk(SRC)) {
    const r = rel(file)
    const code = readCode(file)
    if (percentRe.test(code) && fixedRe.test(code)) offenders.push(r)
  }

  console.log(`  fee-value allowlist: ${VALUE_ALLOWLIST.length} entr(ies)`)
  for (const entry of VALUE_ALLOWLIST) {
    const live = offenders.includes(entry.file)
    console.log(`    ${live ? 'live   ' : 'STALE  '} ${entry.file}`)
    if (!live) {
      fail(
        `the fee-value allowlist holds ${entry.file}, which no longer carries the fee pair.\n` +
          '        Delete the entry. An allowlist nobody prunes is an allowlist nobody reads.',
      )
    }
  }
  for (const r of offenders) {
    if (VALUE_ALLOWLIST.some(e => e.file === r)) continue
    fail(
      `${r} carries the platform fee (${FEE_PERCENT} and ${FEE_FIXED}) as a literal.\n` +
        '        The fee lives in pricing_rules and is owner-editable without a deploy, so a\n' +
        '        literal here is a second source that goes stale in silence. Resolve it through\n' +
        '        getEventFeeRates() or getLivePublicFee().',
    )
  }
  console.log(`  ${offenders.length} file(s) carry the fee pair, all allowed`)
}

/* ======================================================================== */
/* CLAUSE 2. A surface that shows a price has resolved the rates.           */
/* ======================================================================== */

/**
 * The buyer-facing price surfaces, and what each must be able to prove.
 *
 * DERIVED FROM THE BUYER'S PATH, not from a scan, because the check is about
 * what a surface OUGHT to do and a scan can only see what it does. Each entry
 * names the file, the symbol that proves the rates reached it, and why this
 * surface counts as one a buyer decides on.
 */
const PRICE_SURFACES = [
  {
    file: 'src/app/events/[slug]/page.tsx',
    needs: ['getEventFeeRates', 'feeRates'],
    why: 'the event page: the "From" line, the sticky bar and the structured data all state a price',
  },
  {
    file: 'src/components/checkout/ticket-selector.tsx',
    needs: ['allInPriceForOneTicket', 'computeAllInTotalCents'],
    why: 'the ticket panel: the per-tier price and the cart total, the two numbers a buyer decides on',
  },
  {
    file: 'src/lib/events/price-label.ts',
    needs: ['lowestAllInCents'],
    why: 'the ONE from-price rule every surface shares',
  },
]

for (const surface of PRICE_SURFACES) {
  let code
  try {
    code = readCode(join(ROOT, surface.file))
  } catch {
    fail(
      `${surface.file} is named as a buyer-facing price surface and does not exist.\n` +
        '        Either it moved, in which case update this guard, or it was deleted, in which\n' +
        '        case say where the price is rendered now.',
    )
    continue
  }
  for (const symbol of surface.needs) {
    if (!code.includes(symbol)) {
      fail(
        `${surface.file} no longer reaches ${symbol}.\n` +
          `        ${surface.why}.\n` +
          '        A price surface without resolved fee rates can only render a face value,\n' +
          '        which is the defect close-out SEO4 exists to close: a number that is correct\n' +
          '        and is not the price.',
      )
    }
  }
}
console.log(`  ${PRICE_SURFACES.length} buyer-facing price surface(s) resolve the live rates`)

/*
 * CLAUSE 2b. THE RENDERED PRICE IS THE ALL-IN ONE, not merely a file that also
 * mentions the all-in helper somewhere.
 *
 * THE DRILL CAUGHT THIS GUARD BEING TOO WEAK, which is the drill doing exactly
 * its job. Clause 2 asks whether the file REACHES `allInPriceForOneTicket`.
 * Reverting the per-tier line to `formatPrice(tier.display_price_cents ?? tier.price)`
 * left the helper defined and referenced elsewhere in the same file, so the
 * symbol was still present, the guard passed, and the panel was back to showing
 * a face value and calling it the price. A guard that a one-line revert walks
 * past is not guarding.
 *
 * So the SHAPE is checked: a raw tier price handed to the price formatter. That
 * is what "displaying a ticket price without its fee" looks like in this file,
 * and it is the exact revert the close-out names as the drill.
 */
const RAW_TIER_PRICE = /formatPrice\(\s*tier\.(?:display_price_cents\s*\?\?\s*tier\.)?price\b/
const SELECTOR = 'src/components/checkout/ticket-selector.tsx'
const selectorSrc = readCode(join(ROOT, SELECTOR))
if (RAW_TIER_PRICE.test(selectorSrc)) {
  fail(
    `${SELECTOR} formats a raw tier price as the price a buyer reads.\n` +
      '        That is the face value, not the total: on the launch rates an AUD 28.50 ticket\n' +
      '        costs AUD 30.49. Render allInPriceForOneTicket(...).totalCents, which is what\n' +
      '        the charge will take.',
  )
} else {
  console.log('  the per-tier price is the all-in total, not a raw tier price')
}

/* ======================================================================== */
/* CLAUSE 3. Nobody multiplies a per-ticket total into a cart total.        */
/* ======================================================================== */

/*
 * `allInPriceForOneTicket(...).totalCents * quantity` is the tidy-looking line
 * that is wrong by up to half a cent per ticket, in either direction, because
 * the fee line is rounded once. It is checked as a SHAPE rather than trusted to
 * a comment, because it is exactly the sort of thing a later pass introduces
 * while simplifying, and the result is a total that disagrees with the till.
 */
const MULTIPLY_SHAPES = [
  /allInPriceForOneTicket\([^)]*\)[^\n]{0,40}\.totalCents\s*\*/,
  /totalCents\s*\*\s*(?:quantity|qty|totalTickets|count)/,
]
for (const file of walk(SRC)) {
  const code = readCode(file)
  for (const shape of MULTIPLY_SHAPES) {
    if (shape.test(code)) {
      fail(
        `${rel(file)} multiplies a per-ticket all-in total to get a cart total.\n` +
          '        The fee line is rounded ONCE, so that is not the cart total: at AUD 18.50 on\n' +
          '        the launch rates one ticket is 2035 cents and two are 4069, not 4070, and the\n' +
          '        error can go either way. Use computeFeeLineCents / computeAllInTotalCents on\n' +
          '        the whole cart, as the charge does.',
      )
    }
  }
}
console.log('  no surface multiplies a per-ticket total into a cart total')

/* ------------------------------------------------------------------ verdict */

if (failures.length > 0) {
  console.error('\n[all-in-pricing] FAIL - a buyer could be shown a number they will not pay.\n')
  for (const f of failures) console.error(`  - ${f}\n`)
  process.exit(1)
}

console.log(
  '\n[all-in-pricing] PASS - the fee has one source, every price surface resolves it,\n' +
    '      and no cart total is a multiplication.',
)
