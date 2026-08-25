/**
 * The leaf module every environment guard shares: the production project ref and
 * the four readers that extract a NON-SECRET fact out of a secret value.
 *
 * It has no imports of its own, deliberately. The guard graph is
 *
 *   refs.mjs  <-  manifest.mjs  <-  manifest-checks.mjs  <-  critical-env.mjs
 *
 * and keeping this a leaf is what lets `critical-env.mjs` carry a manifest-driven
 * rule without importing anything that imports it back.
 *
 * NOTHING HERE RETURNS KEY MATERIAL. Each function reads a prefix, a project ref
 * or a JWT claim and returns that alone, so a failure reason can name WHAT is
 * wrong without ever naming the value.
 */

/**
 * The PRODUCTION Supabase project ref. Not a secret: it is compiled into every
 * production browser bundle as part of NEXT_PUBLIC_SUPABASE_URL. It is named
 * here so the isolation rules can state, concretely, which project a
 * non-production deployment must never resolve.
 */
export const PRODUCTION_SUPABASE_REF = 'gndnldyfudbytbboxesk'

/** Extract the project ref from a Supabase URL, or '' when it is not one. */
export function refFromUrl(value) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i.exec((value ?? '').trim())
  return m ? m[1].toLowerCase() : ''
}

/**
 * Extract the project ref from a legacy `eyJ` service-role or anon JWT. Returns
 * '' for the newer opaque `sb_secret_` / `sb_publishable_` keys, which carry no
 * readable ref: those are checked by URL alone.
 */
export function refFromJwt(value) {
  const t = (value ?? '').trim()
  if (!t.startsWith('eyJ')) return ''
  try {
    const payload = JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString('utf8'))
    return typeof payload.ref === 'string' ? payload.ref.toLowerCase() : ''
  } catch (error) {
    console.warn('[lib/env/refs:43]', error instanceof Error ? error.message : error)
    return ''
  }
}

/**
 * The MODE a Stripe key declares in its own prefix: 'live', 'test', or
 * 'missing' / 'malformed' when there is nothing usable to read.
 *
 * Deliberately reads the prefix ONLY. Nothing here ever returns, logs or packs
 * key material.
 */
export function stripeKeyMode(value) {
  const t = (value ?? '').trim()
  if (t.length === 0) return 'missing'
  const m = /^(?:pk|sk|rk)_(test|live)_/.exec(t)
  return m ? m[1] : 'malformed'
}

/**
 * The Stripe ACCOUNT REF both key types embed after the `_51` version marker.
 *
 * A publishable key `pk_live_51T8WBhGuiZ9cvxuu...` and its matching secret key
 * `sk_live_51T8WBhGuiZ9cvxuu...` carry the same 15-character ref, which is the
 * account id minus its `acct_1` prefix. Comparing the two refs is how a
 * mismatched PAIR is caught.
 *
 * Returns '' when the key is absent or not in that shape, so the caller can
 * report "unreadable" rather than silently comparing two empty strings and
 * calling that a match.
 */
export function stripeAccountRef(value) {
  const m = /^(?:pk|sk|rk)_(?:test|live)_51([A-Za-z0-9]{15})/.exec((value ?? '').trim())
  return m ? m[1] : ''
}
