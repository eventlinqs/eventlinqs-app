/**
 * STRIPE TEST KEYS, READ FROM THE CLI'S OWN CONFIG AND NEVER PRINTED.
 *
 * WHY THIS EXISTS. Two of the recovery engine's legs (a checkout abandoned at
 * the payment step and then completed, and a refund that frees a place) end in
 * a Stripe webhook, so a drive needs a publishable key and a secret key of ONE
 * account, plus the signing secret `stripe listen` mints. For three sessions
 * the answer was "no working key on this machine" and then "the working key
 * opens the wrong account". The first was true until the founder ran `stripe
 * login`; the second was a true fact about the connected accounts and a wrong
 * conclusion about what a checkout charge names (nothing: the platform runs
 * separate charges and transfers without on_behalf_of, see
 * src/lib/payments/create-platform-charge.ts). What was missing was the
 * publishable key, and it sits beside the secret in the CLI's config as
 * `test_mode_pub_key`.
 *
 * WHAT THIS REFUSES, before anything is started:
 *   - a profile that is not in the config (the founder has not logged in);
 *   - a secret that is not `sk_test_` (a live key, a restricted key, or nothing);
 *   - a publishable that is not `pk_test_`;
 *   - a pair whose keys name different accounts, which is the failure the env
 *     manifest's STRIPE_ACCOUNT_PAIRING rule records as "the payment element
 *     renders NOTHING with no console error and no network error", and which
 *     has bitten this project three times;
 *   - a pair that disagrees with the profile's own account_id;
 *   - a key past the expiry the CLI records for it.
 *
 * The account id is embedded in every Stripe key: `sk_test_51` + sixteen
 * characters that follow `acct_1` in the account id. Comparing that fragment
 * settles which account a key opens without printing either key.
 *
 * A slip recorded in Session 92 is the reason the reader is a function and not
 * an awk: an awk over `stripe config --list` failed to stop at the sandbox
 * section and handed a script BOTH secrets joined by a newline, and the
 * exception printed both. This parser returns one profile's values, and the
 * caller gets an object, never a line of text.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const STRIPE_CLI_CONFIG_PATH = join(homedir(), '.config', 'stripe', 'config.toml')

/**
 * The account id a Stripe key opens, read from the key itself, or null when
 * the key is not shaped like one. Eight characters of prefix, a `5`, then the
 * sixteen that follow `acct_1`, so a key beginning `sk_test_51EXAMPLE` opens
 * the account `acct_1EXAMPLE...`.
 *
 * The example is deliberately synthetic and deliberately short. An earlier
 * draft of this comment carried the first twenty six characters of the REAL
 * key on this machine to illustrate the mapping, and `no-plaintext-credential`
 * refused the push for it, correctly: a well-known secret prefix followed by a
 * high-entropy body is a credential shape whether or not the remainder is
 * present, and the guard cannot know how much of the key a comment stopped at.
 */
export function accountIdFromKey(key) {
  if (typeof key !== 'string') return null
  const m = /^(?:sk|pk|rk)_(?:test|live)_5(1[A-Za-z0-9]{15})/.exec(key)
  return m ? `acct_${m[1]}` : null
}

/**
 * The CLI's config is TOML with one section per profile: `[default]` and
 * quoted names such as `['eventlinqs sandbox']`. Values are quoted strings.
 * Keys before the first section (color, project-name) are returned under the
 * empty profile name and ignored by every caller.
 */
export function parseStripeCliConfig(text) {
  /** @type {Record<string, Record<string, string>>} */
  const profiles = {}
  let current = ''
  profiles[current] = {}
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const section = /^\[\s*(?:'([^']*)'|"([^"]*)"|([^\]]+?))\s*\]$/.exec(line)
    if (section) {
      current = (section[1] ?? section[2] ?? section[3] ?? '').trim()
      profiles[current] ??= {}
      continue
    }
    const pair = /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(line)
    if (!pair) continue
    let value = pair[2].trim()
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1)
    }
    profiles[current][pair[1]] = value
  }
  return { profiles }
}

/**
 * Judge one profile's TEST-mode pair. Returns `{ ok: true, publishableKey,
 * secretKey, accountId, expiresAt }` or `{ ok: false, reason }`. The reason
 * names what to do and never carries a key.
 */
export function judgeTestKeyPair(profile, { profileName = 'default', now = new Date() } = {}) {
  if (!profile) {
    return {
      ok: false,
      reason: `no profile named "${profileName}" in the Stripe CLI config; run \`stripe login\` (add --project-name for a named profile)`,
    }
  }
  const secretKey = profile.test_mode_api_key
  const publishableKey = profile.test_mode_pub_key
  if (!secretKey) return { ok: false, reason: `profile "${profileName}" holds no test-mode secret key; run \`stripe login\`` }
  if (!publishableKey) {
    return { ok: false, reason: `profile "${profileName}" holds no test-mode publishable key; run \`stripe login\` again` }
  }
  if (!secretKey.startsWith('sk_test_')) {
    return {
      ok: false,
      reason: `profile "${profileName}" test-mode secret is not an sk_test_ key (a live or restricted key is refused here)`,
    }
  }
  if (!publishableKey.startsWith('pk_test_')) {
    return { ok: false, reason: `profile "${profileName}" test-mode publishable is not a pk_test_ key` }
  }
  const secretAccount = accountIdFromKey(secretKey)
  const publishableAccount = accountIdFromKey(publishableKey)
  if (!secretAccount || !publishableAccount) {
    return { ok: false, reason: `profile "${profileName}" holds a key with no readable account fragment` }
  }
  if (secretAccount !== publishableAccount) {
    return {
      ok: false,
      reason:
        `profile "${profileName}" pairs a secret for ${secretAccount} with a publishable for ${publishableAccount}; ` +
        'Stripe.js could not resolve a client secret minted by the other account, so the pair is refused',
    }
  }
  if (profile.account_id && profile.account_id !== secretAccount) {
    return {
      ok: false,
      reason: `profile "${profileName}" says account ${profile.account_id} but its keys open ${secretAccount}`,
    }
  }
  const expiresAt = profile.test_mode_key_expires_at ?? null
  if (expiresAt) {
    const expiry = new Date(`${expiresAt}T23:59:59Z`)
    if (Number.isNaN(expiry.getTime())) {
      return { ok: false, reason: `profile "${profileName}" records an unreadable expiry "${expiresAt}"` }
    }
    if (expiry.getTime() < now.getTime()) {
      return {
        ok: false,
        reason: `profile "${profileName}" test-mode key expired on ${expiresAt}; run \`stripe login\` to renew it`,
      }
    }
  }
  return { ok: true, publishableKey, secretKey, accountId: secretAccount, expiresAt }
}

/**
 * Read the CLI config and judge one profile. `readFile` and `configPath` are
 * parameters so a test can hand in a fixture rather than the real file.
 */
export function testKeyPairFromCli({
  profileName = 'default',
  configPath = STRIPE_CLI_CONFIG_PATH,
  now = new Date(),
  readFile = (p) => readFileSync(p, 'utf8'),
} = {}) {
  let text
  try {
    text = readFile(configPath)
  } catch (error) {
    return {
      ok: false,
      reason: `could not read the Stripe CLI config at ${configPath} (${error instanceof Error ? error.message : String(error)}); run \`stripe login\``,
    }
  }
  const { profiles } = parseStripeCliConfig(text)
  return judgeTestKeyPair(profiles[profileName], { profileName, now })
}

/**
 * Every secret-shaped Stripe value in a line of text, masked. Publishable keys
 * are left alone: they are built to ship in a browser bundle, and the account
 * fragment they carry is how a reader confirms which account a run used.
 */
export function redactStripeSecrets(text) {
  return String(text ?? '').replace(/\b(sk_test_|sk_live_|rk_test_|rk_live_|whsec_)[A-Za-z0-9_]+/g, '$1[redacted]')
}
