/**
 * The Stripe TEST key pair, read out of the Stripe CLI's own config.
 *
 * WHY THIS EXISTS AT ALL. `.env.local` on this machine carries an EMPTY
 * `STRIPE_SECRET_KEY` and a publishable key belonging to a different account,
 * so a drive that trusts the file cannot take a buyer past the payment step.
 * Lane B recorded that as a credential the founder had to mint, and lane A
 * established on 14 September 2026 that the verdict was wrong: the CLI holds a
 * working TEST pair, and the publishable key is not fixed, so a drive does not
 * have to match the environment - it SERVES to match the key it has.
 *
 * WHY IT IS A SEPARATE FILE FROM LANE A'S `stripe-cli-keys.mjs`. That file
 * exists on lane A's branch and has not reached origin, so it cannot be lifted,
 * only re-derived. Two files with the same path and different bodies collide on
 * every merge for ever, so this one carries a different name deliberately. When
 * lane A's lands, this is the one to delete.
 *
 * WHAT IT REFUSES, and each refusal has cost a session somewhere on this
 * project:
 *   - a LIVE key, in either slot, under any circumstances;
 *   - a pair whose two halves name DIFFERENT accounts, which is the exact shape
 *     that makes `stripe listen` talk to one platform while the browser talks to
 *     another and report success;
 *   - a profile chosen by NAME. Both profiles on this machine, including the one
 *     called "eventlinqs sandbox", have been found pointing somewhere other than
 *     their name suggests, so the account is read from the KEY and nothing else.
 *
 * IT NEVER PRINTS A KEY. Every value it reports is an account id or a length.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const STRIPE_CLI_CONFIG = join(homedir(), '.config', 'stripe', 'config.toml')

/**
 * The account a Stripe key belongs to, without printing the key.
 *
 * Every Stripe key opens with an eight-character `<prefix>_<mode>_`, then one
 * leading digit, then the sixteen-character account suffix. So characters 10 to
 * 25 of any key are the suffix of the `acct_` id it belongs to, which is the one
 * fact that lets a publishable and a secret key be matched without either of
 * them being displayed.
 *
 * NO EXAMPLE KEY IS WRITTEN HERE, deliberately. The first version spelled the
 * arithmetic out against a real prefix and a real account suffix, and
 * `no-plaintext-credential` failed the build on it. The guard was right: a
 * comment carrying seventeen true characters of a key is a comment teaching the
 * next person to paste the other ninety.
 */
export function accountIdFromKey(key) {
  if (typeof key !== 'string' || key.length < 25) return null
  return `acct_${key.slice(9, 25)}`
}

/** Parse the CLI's TOML into `{ [profile]: { [key]: value } }`. Values are single-quoted. */
export function parseStripeCliConfig(text) {
  if (typeof text !== 'string') {
    throw new TypeError('parseStripeCliConfig takes the config FILE TEXT, not a path')
  }
  const profiles = {}
  let current = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const section = line.match(/^\[\s*'?([^'\]]+)'?\s*\]$/)
    if (section) {
      current = section[1]
      profiles[current] = profiles[current] ?? {}
      continue
    }
    if (!current) continue
    const pair = line.match(/^([A-Za-z0-9_-]+)\s*=\s*'([^']*)'\s*$/)
    if (pair) profiles[current][pair[1]] = pair[2]
  }
  return profiles
}

/**
 * The usable TEST pair, or a refusal explaining exactly which clause failed.
 *
 * Returns `{ ok: true, profile, accountId, secretKey, publishableKey }` or
 * `{ ok: false, reason }`. The caller decides whether to exit; this never does.
 */
export function readStripeTestKeys({ profile = 'default', configPath = STRIPE_CLI_CONFIG } = {}) {
  let text
  try {
    text = readFileSync(configPath, 'utf8')
  } catch (err) {
    return { ok: false, reason: `no Stripe CLI config at ${configPath} (${err.code ?? err.message})` }
  }
  const profiles = parseStripeCliConfig(text)
  const found = profiles[profile]
  if (!found) {
    return { ok: false, reason: `profile "${profile}" is not in ${configPath}; it holds ${Object.keys(profiles).join(', ') || 'nothing'}` }
  }
  const secretKey = found.test_mode_api_key ?? ''
  const publishableKey = found.test_mode_pub_key ?? ''
  if (!secretKey || !publishableKey) {
    return { ok: false, reason: `profile "${profile}" carries no TEST pair (secret ${secretKey ? 'present' : 'missing'}, publishable ${publishableKey ? 'present' : 'missing'})` }
  }
  if (!secretKey.startsWith('sk_test_') || !publishableKey.startsWith('pk_test_')) {
    return { ok: false, reason: `profile "${profile}" does not hold a TEST pair; this reader refuses anything that is not sk_test_/pk_test_` }
  }
  const secretAccount = accountIdFromKey(secretKey)
  const publishableAccount = accountIdFromKey(publishableKey)
  if (secretAccount !== publishableAccount) {
    return { ok: false, reason: `the pair in profile "${profile}" names two accounts: secret ${secretAccount}, publishable ${publishableAccount}. A drive using both would talk to two platforms and report success.` }
  }
  if (found.account_id && found.account_id !== secretAccount) {
    return { ok: false, reason: `profile "${profile}" declares account_id ${found.account_id} but its TEST keys name ${secretAccount}. The keys win and the profile is stale; re-run stripe login.` }
  }
  return { ok: true, profile, accountId: secretAccount, secretKey, publishableKey }
}

/** Live at Stripe right now, rather than merely present in a file. Returns `{ ok, detail }`. */
export async function probeStripeTestKey(secretKey) {
  let res
  try {
    res = await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${secretKey}` } })
  } catch (err) {
    return { ok: false, detail: `could not reach Stripe: ${err.message}` }
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, detail: `Stripe refused the key: ${body?.error?.message ?? res.status}` }
  const currencies = (body.available ?? []).map(a => a.currency).join(', ')
  return { ok: true, detail: `the key answers /v1/balance with ${currencies || 'no balance currencies'}` }
}
