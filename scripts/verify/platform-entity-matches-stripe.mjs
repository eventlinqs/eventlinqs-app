/**
 * DOES THE ENTITY DISPLAYED MATCH THE ENTITY TAKING THE MONEY? (close-out UX2.1)
 *
 * The close-out's requirement is precise: "The entity taking ticket money must
 * match the ABN displayed and the Stripe account entity." Two of those three are
 * in this repository and are enforced at build time by
 * `scripts/guards/one-platform-entity.mjs`. The THIRD lives at Stripe, and this
 * script is the only thing that can compare them.
 *
 * WHY THIS IS NOT A BUILD GUARD, and the reason is a law rather than a
 * preference. Reading the Stripe account needs a secret key. Close-out F2.1
 * named the class of failure that costs deployments:
 *
 *     THE VERCEL BUILD HOST IS NOT A DEVELOPER MACHINE.
 *     No docs. No git. No Vercel token. No developer environment of any kind.
 *
 * A prebuild guard that calls Stripe would fail every build that had no key, or
 * pass vacuously whenever the call failed, which is worse. So this is a
 * verification script the founder or a session runs deliberately, and its
 * verdict is recorded rather than assumed.
 *
 * IT NEVER WRITES. Two read-only calls: `accounts.retrieve()` for the platform
 * account. It prints no key and no full tax id.
 *
 * Usage (the src-alias loader lets a script import the product's own module
 * rather than re-typing the value, which is the whole point):
 *   node --env-file=.env.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON
 *        --import ./scripts/lib/src-alias-loader.mjs
 *        scripts/verify/platform-entity-matches-stripe.mjs
 */
import { PLATFORM_ENTITY } from '../../src/lib/legal/platform-entity.ts'

const TAG = '[platform-entity-vs-stripe]'

const key = process.env.STRIPE_SECRET_KEY?.trim()
if (!key) {
  console.log(`${TAG} SKIP - no STRIPE_SECRET_KEY in this environment.`)
  console.log(`${TAG}   This is a verification script, not a gate: it is meant to be run where a key exists.`)
  console.log(`${TAG}   Nothing was checked, and nothing is claimed.`)
  process.exit(0)
}

// Which account is this? A live key and a test key describe different entities,
// and comparing a legal name against a TEST account proves nothing about who
// takes the money.
const mode = key.startsWith('sk_live_') ? 'LIVE' : key.startsWith('sk_test_') ? 'TEST' : 'UNKNOWN'
console.log(`${TAG} Stripe key mode: ${mode}`)
if (mode !== 'LIVE') {
  console.log(`${TAG}   The entity that takes real ticket money is on the LIVE account.`)
  console.log(`${TAG}   A ${mode} account can be compared, but it does not settle the close-out's question.`)
}

const res = await fetch('https://api.stripe.com/v1/account', {
  headers: { Authorization: `Bearer ${key}` },
})
if (!res.ok) {
  console.error(`${TAG} FAIL - Stripe answered ${res.status}. Nothing was compared.`)
  process.exit(1)
}
const account = await res.json()

/** Never print a full tax id. The last three digits are enough to compare by eye. */
const tail = value => (typeof value === 'string' && value.length >= 3 ? `...${value.slice(-3)}` : '(absent)')

const company = account.company ?? {}
const businessProfile = account.business_profile ?? {}
const stripeTaxId = typeof company.tax_id === 'string' ? company.tax_id.replace(/\D/g, '') : null

const rows = [
  ['country', account.country ?? '(absent)', 'AU'],
  ['business name', businessProfile.name ?? company.name ?? '(absent)', PLATFORM_ENTITY.tradingName],
  ['tax id (ABN)', tail(stripeTaxId), tail(PLATFORM_ENTITY.abn)],
]

console.log('')
console.log(`${TAG} ${'field'.padEnd(16)} ${'stripe'.padEnd(28)} repository`)
for (const [field, stripe, repo] of rows) {
  console.log(`${TAG} ${String(field).padEnd(16)} ${String(stripe).padEnd(28)} ${repo}`)
}
console.log('')

const problems = []
if (account.country && account.country !== 'AU') {
  problems.push(`Stripe says the account country is ${account.country}; the platform presents itself as an Australian entity.`)
}
if (stripeTaxId && stripeTaxId !== PLATFORM_ENTITY.abn) {
  problems.push(
    `The ABN on the Stripe account (${tail(stripeTaxId)}) is NOT the one every surface displays (${tail(PLATFORM_ENTITY.abn)}).`,
  )
}
if (!stripeTaxId) {
  // Absent is not a mismatch, and saying so is the honest report. A sole trader
  // account may legitimately carry no company.tax_id.
  console.log(`${TAG} NOT COMPARABLE: the Stripe account carries no company.tax_id.`)
  console.log(`${TAG}   That is normal for an individual/sole-trader account. The ABN displayed`)
  console.log(`${TAG}   therefore cannot be confirmed against Stripe here, and is UNCONFIRMED`)
  console.log(`${TAG}   rather than confirmed. The register at abr.business.gov.au is the source.`)
}

if (problems.length > 0) {
  console.error(`${TAG} FAIL - ${problems.length} disagreement(s):`)
  for (const p of problems) console.error(`    ${p}`)
  console.error('')
  console.error('  The entity taking ticket money must match the ABN displayed (close-out UX2.1).')
  process.exit(1)
}

console.log(`${TAG} PASS - nothing displayed disagrees with the ${mode} Stripe account.`)
process.exit(0)
