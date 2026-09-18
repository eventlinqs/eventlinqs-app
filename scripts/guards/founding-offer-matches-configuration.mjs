/**
 * GUARD: THE FOUNDING OFFER AND THE FEE SENTENCE ARE READS, NOT CLAIMS.
 *
 * Close-out FO1. www.eventlinqs.com.au/organisers publishes four numbers in
 * public and every outreach message sent since 12 September 2026 repeats them
 * word for word: the first FIFTY organisers nationally, SIX months completely
 * fee free, THREE more months per organiser referred, and founding terms applied
 * before the first on-sale. /pricing publishes the fee. Not one of those numbers
 * failed anything when it disagreed with the engine that charges, because prose
 * is not executed.
 *
 * WHAT IT CHECKS, in four parts.
 *
 *   1. THE OFFER NUMBERS IN THE COPY EQUAL THE CONSTANTS THE MACHINE USES.
 *      FOUNDING_WAIVER_CAP, FOUNDING_INITIAL_MONTHS and
 *      FOUNDING_REFERRAL_MONTHS live in src/lib/payments/founding-waiver.ts,
 *      beside the function that applies them to a charge. Every number the
 *      offer copy states is matched against them, and every one of the four
 *      claims must be PRESENT, so deleting a sentence cannot make this pass by
 *      having nothing left to check.
 *
 *   2. THE FIFTY IN THE DATABASE EQUALS THE FIFTY IN THE CODE. The cap is
 *      enforced twice in SQL (claim_founding_spot and
 *      enforce_founding_waiver_cap) and those literals are invisible to
 *      TypeScript. A cap of 50 in code and 60 in a trigger is a silent
 *      over-grant of ten free organisations.
 *
 *   3. THE FEE IS NEVER TYPED ONTO /organisers OR /pricing. Both pages resolve
 *      it through getLivePublicFee, which reads the same pricing_rules rows the
 *      checkout charges from. This fails the build if the locked percentage or
 *      the locked flat amount appears as a literal in either surface, and it
 *      builds those patterns FROM the lock block, so it keeps working when the
 *      founder changes the fee.
 *
 *   4. THE LAST-RESORT FALLBACK STILL AGREES WITH THE LOCK BLOCK.
 *      src/lib/pricing/public-fee.ts is read exactly when the database cannot
 *      be, which is the worst possible moment for it to be stale.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not read a database. The fee VALUE
 * is checked against the live rows by scripts/check-pricing-lock.mjs, which is
 * a different job with a different failure mode; this one is about the tree
 * agreeing with itself, so it runs identically on a laptop, in CI and on the
 * Vercel build host.
 *
 * Proven red and green: see C:\\dev\\EVIDENCE\\FO1\\guard-red.txt and
 * guard-green.txt.
 *
 * Run: node scripts/guards/founding-offer-matches-configuration.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { parseLockedValues } from '../../src/lib/health/pricing-lock.mjs'

const ROOT = process.cwd()
const TAG = '[founding-offer]'

const WAIVER = 'src/lib/payments/founding-waiver.ts'
const OFFER = 'src/lib/organisers/founding-offer.ts'
const PUBLIC_FEE = 'src/lib/pricing/public-fee.ts'
const ORGANISERS_TEMPLATE = 'src/components/templates/OrganisersLandingPage.tsx'
const PRICING_TEMPLATE = 'src/components/templates/PricingPage.tsx'

const faults = []
const checks = { 'offer claim': 0, 'sql cap literal': 0, 'fee literal pattern': 0, 'fallback figure': 0 }

function read(rel) {
  const file = join(ROOT, rel)
  if (!existsSync(file)) {
    faults.push(`${rel} is missing; the offer cannot be checked against a file that is not there`)
    return null
  }
  return readFileSync(file, 'utf8')
}

/* --------------------------------------------------------- the configuration */

const waiverSource = read(WAIVER)
function constantFrom(source, name) {
  if (!source) return null
  const m = source.match(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`))
  if (!m) {
    faults.push(`${WAIVER} no longer exports a numeric ${name}; the offer copy has nothing to be checked against`)
    return null
  }
  return Number(m[1])
}
const CAP = constantFrom(waiverSource, 'FOUNDING_WAIVER_CAP')
const INITIAL_MONTHS = constantFrom(waiverSource, 'FOUNDING_INITIAL_MONTHS')
const REFERRAL_MONTHS = constantFrom(waiverSource, 'FOUNDING_REFERRAL_MONTHS')

let locked = null
try {
  locked = parseLockedValues(ROOT)
} catch (error) {
  faults.push(`the PRICING-LOCK block could not be read: ${error.message}`)
}

/* ------------------------------------------------ 1. the offer copy's numbers */

/**
 * Each claim names the shape it expects, the constant it must equal, and the
 * fact that it MUST appear. The "must appear" half is what stops the guard
 * passing vacuously when somebody deletes the sentence instead of correcting it.
 */
const OFFER_CLAIMS = [
  {
    what: 'the six-month fee-free window',
    pattern: /(\d+)\s+months? completely fee-free/gi,
    expected: () => INITIAL_MONTHS,
  },
  {
    what: 'the three months earned per referral',
    pattern: /(\d+)\s+more fee-free months/gi,
    expected: () => REFERRAL_MONTHS,
  },
  {
    what: 'the fifty-organiser cap in the title',
    pattern: /The first (\d+) build it with us/gi,
    expected: () => CAP,
  },
  {
    what: 'the fifty-organiser cap in the body',
    pattern: /first (\d+) organisers anywhere in the country/gi,
    expected: () => CAP,
  },
  {
    what: 'the fifty-organiser cap in the small print',
    pattern: /limited to the first (\d+) organisers nationally/gi,
    expected: () => CAP,
  },
]

/** The fourth claim is a promise rather than a number, so it is checked as one. */
const OFFER_PHRASES = [
  {
    what: 'the promise that founding terms are applied before the first on-sale',
    pattern: /before your first on-sale/i,
  },
]

const offerSource = read(OFFER)
if (offerSource) {
  for (const claim of OFFER_CLAIMS) {
    const expected = claim.expected()
    if (expected === null) continue
    const found = [...offerSource.matchAll(claim.pattern)].map(m => Number(m[1]))
    checks['offer claim'] += 1
    if (found.length === 0) {
      faults.push(
        `${OFFER} no longer states ${claim.what}. The offer is published and is repeated in every outreach message, so a claim cannot be removed from the copy without a decision; if the offer changed, change the constant in ${WAIVER} and this pattern together`,
      )
      continue
    }
    for (const value of found) {
      if (value !== expected) {
        faults.push(
          `${OFFER} states ${value} for ${claim.what}, and the engine that charges uses ${expected} (${WAIVER}). The page and the invoice must not disagree`,
        )
      }
    }
  }
  for (const phrase of OFFER_PHRASES) {
    checks['offer claim'] += 1
    if (!phrase.pattern.test(offerSource)) {
      faults.push(`${OFFER} no longer carries ${phrase.what}`)
    }
  }
}

/* ------------------------------------------- 2. the fifty the database knows */

/**
 * EVERY migration is swept, not two named ones. A future migration that
 * redefines either function with a different literal would otherwise sail past
 * a guard pinned to the file that first created it, which is precisely how the
 * cap comes to mean two numbers.
 */
const SQL_CAP_PATTERNS = [
  { what: 'claim_founding_spot', pattern: /v_cap\s+constant\s+integer\s*:=\s*(\d+)/gi },
  { what: 'enforce_founding_waiver_cap', pattern: /IF\s+holder_count\s*>=\s*(\d+)\s+THEN/gi },
]

const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const migrationFiles = existsSync(MIGRATIONS_DIR)
  ? readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
  : []

let sqlCapSightings = 0
if (CAP !== null) {
  for (const name of migrationFiles) {
    const source = readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
    for (const sql of SQL_CAP_PATTERNS) {
      for (const m of source.matchAll(sql.pattern)) {
        sqlCapSightings += 1
        checks['sql cap literal'] += 1
        if (Number(m[1]) !== CAP) {
          faults.push(
            `supabase/migrations/${name} caps ${sql.what} at ${m[1]} while ${WAIVER} says ${CAP}. The database grants what it grants, so the smaller number is a promise broken and the larger one is free organisations`,
          )
        }
      }
    }
  }
  if (sqlCapSightings === 0) {
    faults.push(
      `no migration expresses the founding cap in a shape this guard can read. The cap is enforced in SQL by claim_founding_spot and enforce_founding_waiver_cap, and if neither literal is findable the database and ${WAIVER} can drift apart with nothing watching`,
    )
  }
}

/* ----------------------------------- 3. the fee is never typed onto the pages */

if (locked) {
  const percent = Number(locked.platform_fee_percentage)
  const fixedCents = Number(locked.platform_fee_fixed)
  const fixedLabel = (fixedCents / 100).toFixed(2)

  // Built FROM the lock block, so changing the fee changes what is forbidden.
  // The percentage is only matched when it carries a per-cent sign or the word,
  // because Tailwind spacing tokens (py-3.5) contain the same digits.
  const FEE_LITERALS = [
    {
      what: `the locked percentage ${percent}`,
      pattern: new RegExp(String.raw`\b${String(percent).replace('.', '\\.')}\s*(?:%|per cent|percent)`, 'i'),
    },
    {
      what: `the locked flat amount ${fixedLabel}`,
      pattern: new RegExp(String.raw`(?:AUD|A?\$)\s*${fixedLabel.replace('.', '\\.')}\b`, 'i'),
    },
  ]

  for (const rel of [ORGANISERS_TEMPLATE, PRICING_TEMPLATE]) {
    const source = read(rel)
    if (!source) continue
    if (!source.includes('getLivePublicFee')) {
      faults.push(
        `${rel} does not call getLivePublicFee. The fee on a public page is a READ from pricing_rules, never a sentence somebody typed, or the page and the checkout can tell different stories`,
      )
    }
    for (const literal of FEE_LITERALS) {
      checks['fee literal pattern'] += 1
      if (literal.pattern.test(source)) {
        faults.push(
          `${rel} contains ${literal.what} as a literal. Render fee.label from getLivePublicFee instead, so the number the buyer reads is the number the checkout charges`,
        )
      }
    }
  }

  /* ------------------------------- 4. the last-resort fallback is still right */

  const fallback = read(PUBLIC_FEE)
  if (fallback) {
    const percentMatch = fallback.match(/percent:\s*([\d.]+)/)
    const centsMatch = fallback.match(/fixedCents:\s*(\d+)/)
    const currencyMatch = fallback.match(/currency:\s*'([A-Z]{3})'/)
    checks['fallback figure'] += 3
    if (!percentMatch || Number(percentMatch[1]) !== percent) {
      faults.push(
        `${PUBLIC_FEE} falls back to ${percentMatch ? percentMatch[1] : 'nothing readable'} per cent while the lock block says ${percent}. That constant is read exactly when the database cannot be, which is the worst moment for it to be stale`,
      )
    }
    if (!centsMatch || Number(centsMatch[1]) !== fixedCents) {
      faults.push(
        `${PUBLIC_FEE} falls back to ${centsMatch ? centsMatch[1] : 'nothing readable'} cents while the lock block says ${fixedCents}`,
      )
    }
    if (!currencyMatch || currencyMatch[1] !== String(locked.currency)) {
      faults.push(
        `${PUBLIC_FEE} falls back to currency ${currencyMatch ? currencyMatch[1] : 'nothing readable'} while the lock block says ${locked.currency}`,
      )
    }
  }
}

/* --------------------------- 5. the displayed waiver equals the charged one */

/**
 * THE WAIVER MUST BE READ BY SOMETHING THAT CAN SEE IT.
 *
 * `pricing_rules` is world-readable, so resolving the RATES through the anon
 * client is correct and is what lets the event page work with no service key.
 * `organisations` is not: migration 20260808000010 revoked every column from
 * anon except six, and `founding_fee_free_until` is not among them. Reading the
 * waiver through the anon client therefore answers `permission denied`, and
 * getFoundingWaiver swallows a failure to INACTIVE on purpose, so the page shows
 * a founding organiser's buyer a fee the checkout is never going to charge and
 * nothing anywhere says so.
 *
 * That shipped on 8 August 2026 and was found on 13 September by driving it.
 * This is the gate that would have caught it the same day.
 */
const FEE_DISPLAY = 'src/lib/pricing/event-fee-config.ts'
const feeDisplaySource = read(FEE_DISPLAY)
if (feeDisplaySource) {
  checks['fee literal pattern'] += 1
  const waiverCall = feeDisplaySource.indexOf('getFoundingWaiver(')
  if (waiverCall === -1) {
    faults.push(
      `${FEE_DISPLAY} no longer applies the Founding Organiser waiver to the DISPLAYED rates, so a founding organiser's buyer is shown a fee the checkout will not charge`,
    )
  } else {
    const argument = feeDisplaySource.slice(waiverCall, waiverCall + 200)
    if (!argument.includes('createAdminClient()')) {
      faults.push(
        `${FEE_DISPLAY} reads the founding waiver with something other than createAdminClient(). organisations.founding_fee_free_until is revoked from anon and authenticated by 20260808000010, so any other client answers permission denied, getFoundingWaiver degrades that to INACTIVE, and the page shows a fee the charge waives`,
      )
    }
  }
}

/* ------------------------------------------------------------------ verdict */

declareWork('founding-offer-matches-configuration', {
  did: checks,
  found: { 'published number that disagrees with the configuration': faults.length },
})

console.log(
  `${TAG} configuration: cap ${CAP}, ${INITIAL_MONTHS} months, ${REFERRAL_MONTHS} months per referral` +
    (locked ? `, fee ${locked.platform_fee_percentage}% + ${locked.currency} ${(Number(locked.platform_fee_fixed) / 100).toFixed(2)}` : ''),
)

if (faults.length > 0) {
  console.error(`${TAG} FAIL: ${faults.length} disagreement(s) between what the platform publishes and what it does.`)
  for (const fault of faults) console.error(`${TAG}   - ${fault}`)
  process.exit(1)
}

console.log(`${TAG} PASS - every published offer number and the fee sentence agree with the configuration.`)
