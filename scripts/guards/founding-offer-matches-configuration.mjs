/**
 * GUARD: THE FOUNDING OFFER AND THE FEE SENTENCE ARE READS, NOT CLAIMS.
 *
 * Close-out FO1. www.eventlinqs.com.au/organisers publishes the offer in
 * public and every outreach message repeats it: SIX months completely fee free,
 * THREE more months per organiser referred, and the terms applied before the
 * first on-sale. /pricing publishes the fee. Not one of those numbers failed
 * anything when it disagreed with the engine that charges, because prose is
 * not executed.
 *
 * LAW 24 (founder ruling, 20 September 2026): "Every new organiser gets six
 * months free, counted from the date they register or set up on EventLinqs.
 * Not a cap of 50. Every organiser. After six months the standard fee
 * applies." Until 26 September 2026 this guard held the cap of FIFTY equal in
 * the copy, the code and two SQL functions. It now holds the cap ABSENT in all
 * of them, and holds the registration stamp to the same six months.
 *
 * WHAT IT CHECKS, in six parts.
 *
 *   1. THE OFFER NUMBERS IN THE COPY EQUAL THE CONSTANTS THE MACHINE USES.
 *      FOUNDING_INITIAL_MONTHS and FOUNDING_REFERRAL_MONTHS live in
 *      src/lib/payments/founding-waiver.ts, beside the function that applies
 *      them to a charge. Every number the offer copy states is matched against
 *      them, and every claim must be PRESENT, including that the six months
 *      run from registration, so deleting a sentence cannot make this pass by
 *      having nothing left to check.
 *
 *   2. NO CAP, ANYWHERE A CAP LIVED. The waiver module exports no cap; the
 *      offer copy and every other surface that used to state one (the legal
 *      terms, the waitlist, its email, the invite landing, the invites page,
 *      the founding invitation email) names no "first 50", no founding spots
 *      remaining, no "limited to"; the effective claim_founding_spot carries no
 *      v_cap; and trg_founding_waiver_cap is dropped after its last creation.
 *      And the database stamps every new organisation's window from its own
 *      created_at by FOUNDING_INITIAL_MONTHS, the number the copy states.
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
const checks = { 'offer claim': 0, 'cap check': 0, 'fee literal pattern': 0, 'fallback figure': 0 }

/**
 * Source with block comments and whole-line comments removed, so a rule
 * EXPLAINED in prose cannot be mistaken for a rule OBEYED in code.
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(String.fromCharCode(10))
    .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .join(String.fromCharCode(10))
}

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
]

/** The promises rather than numbers, so they are checked as phrases. */
const OFFER_PHRASES = [
  {
    what: 'the promise that the terms are applied before the first on-sale',
    pattern: /before your first on-sale/i,
  },
  {
    what: 'LAW 24: the six months are counted from registration',
    pattern: /counted from the day they sign up/i,
  },
  {
    what: 'LAW 24: there is no cap',
    pattern: /\bNo cap\b/,
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

/* ------------------------------------ 2. no cap anywhere a cap used to live */

/**
 * LAW 24, 26 September 2026: the cap is gone from the engine, and a cap that
 * comes back quietly (a constant, a sentence, a literal in a trigger) is the
 * regression this clause exists to refuse.
 */
if (waiverSource && /export const FOUNDING_WAIVER_CAP\b/.test(waiverSource)) {
  faults.push(`${WAIVER} exports FOUNDING_WAIVER_CAP again. LAW 24: "Not a cap of 50. Every organiser." The engine carries no cap`)
}

/**
 * Every surface that stated the cap before LAW 24, each read whole. A cap in
 * any of them is a promise the engine no longer keeps, in either direction.
 */
const CAP_SURFACES = [
  OFFER,
  'src/app/legal/organiser-terms/page.tsx',
  'src/app/waitlist/waitlist-client.tsx',
  'src/lib/waitlist/confirmation-email.ts',
  'src/app/join/[code]/page.tsx',
  'src/app/(dashboard)/dashboard/invites/page.tsx',
  'src/app/admin/(authed)/network/actions.ts',
  'src/lib/forecast/present.ts',
]
const CAP_WORDING = [
  /\bfirst\s+(?:\{String\()?\d+\)?\}?\s+(?:organisers|founding|build)/i,
  /\blimited to the first\b/i,
  /\bfounding (?:spots?|places?) (?:left|remaining|are taken)/i,
  /\bspots? (?:left|remaining)\b/i,
  /\bcapped and closes\b/i,
  /\blimited number of (?:places|spots)\b/i,
]
for (const rel of CAP_SURFACES) {
  const source = read(rel)
  if (!source) continue
  const code = withoutComments(source)
  checks['cap check'] += 1
  for (const pattern of CAP_WORDING) {
    const m = code.match(pattern)
    if (m) {
      faults.push(`${rel} states a cap ("${m[0]}"). LAW 24: six months free for every organiser from their own registration, with no cap`)
    }
  }
}

/**
 * The database. EVERY migration is read in version order, because the answer
 * is whatever the LAST definition says: a future migration that puts v_cap
 * back into claim_founding_spot, or re-creates the cap trigger, must fail here
 * however many files later it lands.
 */
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const migrationFiles = existsSync(MIGRATIONS_DIR)
  ? readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
  : []
const migrations = migrationFiles.map(name => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }))

/** The body of the last CREATE of a function, across every migration. */
function lastDefinition(fn) {
  const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${fn}\\s*\\(`, 'gi')
  let found = null
  for (const m of migrations) {
    for (const hit of m.sql.matchAll(re)) {
      const rest = m.sql.slice(hit.index)
      const tag = rest.match(/as\s+(\$[a-z_]*\$)/i)
      const end = tag ? rest.indexOf(tag[1], rest.indexOf(tag[1]) + tag[1].length) : -1
      found = { name: m.name, body: end === -1 ? rest : rest.slice(0, end) }
    }
  }
  return found
}

const claim = lastDefinition('claim_founding_spot')
checks['cap check'] += 1
if (!claim) {
  faults.push('no migration defines claim_founding_spot, so the founding programme cannot be judged')
} else if (/v_cap|>=\s*\d+\s+then\s+return\s+null/i.test(claim.body)) {
  faults.push(`supabase/migrations/${claim.name} defines claim_founding_spot with a cap. LAW 24 removed it (20260926000001)`)
}

/** The position of the last CREATE and the last DROP of the cap trigger, in (file, offset) order. */
function lastEvent(pattern) {
  let at = null
  migrations.forEach((m, i) => {
    for (const hit of m.sql.matchAll(pattern)) at = [i, hit.index]
  })
  return at
}
const capCreated = lastEvent(/create\s+trigger\s+trg_founding_waiver_cap\b/gi)
const capDropped = lastEvent(/drop\s+trigger\s+if\s+exists\s+trg_founding_waiver_cap\b/gi)
const after = (a, b) => b !== null && (a === null || b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]))
checks['cap check'] += 1
if (capCreated !== null && !after(capCreated, capDropped)) {
  faults.push(
    `supabase/migrations/${migrations[capCreated[0]].name} creates trg_founding_waiver_cap and no later migration drops it. LAW 24: no cap of 50`,
  )
}

const stamp = lastDefinition('stamp_registration_fee_free_window')
checks['cap check'] += 1
if (!stamp) {
  faults.push('no migration defines stamp_registration_fee_free_window, so nothing gives a new organiser the six months LAW 24 promises')
} else {
  const months = stamp.body.match(/founding_add_months\(\s*coalesce\(\s*new\.created_at\s*,\s*now\(\)\s*\)\s*,\s*(\d+)\s*\)/i)
  if (!months) {
    faults.push(`supabase/migrations/${stamp.name} no longer stamps the window from the organisation's own created_at`)
  } else if (INITIAL_MONTHS !== null && Number(months[1]) !== INITIAL_MONTHS) {
    faults.push(
      `supabase/migrations/${stamp.name} stamps ${months[1]} months at registration while ${WAIVER} and the published copy say ${INITIAL_MONTHS}`,
    )
  }
  const installed = migrations.some(m =>
    /create\s+trigger\s+\w+\s+before\s+insert\s+on\s+public\.organisations\s+for\s+each\s+row\s+execute\s+function\s+public\.stamp_registration_fee_free_window\(\)/i.test(m.sql),
  )
  if (!installed) {
    faults.push('stamp_registration_fee_free_window is defined and no migration installs it BEFORE INSERT ON public.organisations')
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
    /*
     * THE CALL, IN CODE, NOT THE MENTION, for the same reason recorded in
     * scripts/guards/forecast-reads-every-number.mjs on 18 September 2026: an
     * import line, or a comment explaining where the fee comes from, satisfied
     * `includes('getLivePublicFee')` on its own. Both of these templates carry
     * the name in prose as well as calling it, so the weaker test could never
     * have gone red here no matter what the page rendered.
     *
     * COMMENTS ARE STRIPPED FIRST, and that is not belt and braces: the second
     * attempt at this check tested for the name followed by a parenthesis, and
     * OrganisersLandingPage.tsx:196 carries the words "getLivePublicFee
     * (displayed == charged)" inside a comment. The drill replaced the real
     * call and the guard went on passing, on the strength of a comment
     * explaining the very rule it was failing to enforce.
     */
    if (!/\bgetLivePublicFee\s*\(/.test(withoutComments(source))) {
      faults.push(
        `${rel} does not CALL getLivePublicFee. The fee on a public page is a READ from pricing_rules, never a sentence somebody typed, or the page and the checkout can tell different stories. An import of the name, or a comment naming it, is not a read`,
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
  `${TAG} configuration: no cap (LAW 24), ${INITIAL_MONTHS} months from registration, ${REFERRAL_MONTHS} months per referral` +
    (locked ? `, fee ${locked.platform_fee_percentage}% + ${locked.currency} ${(Number(locked.platform_fee_fixed) / 100).toFixed(2)}` : ''),
)

if (faults.length > 0) {
  console.error(`${TAG} FAIL: ${faults.length} disagreement(s) between what the platform publishes and what it does.`)
  for (const fault of faults) console.error(`${TAG}   - ${fault}`)
  process.exit(1)
}

console.log(`${TAG} PASS - every published offer number and the fee sentence agree with the configuration.`)
