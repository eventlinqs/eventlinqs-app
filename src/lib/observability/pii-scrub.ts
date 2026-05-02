// PII scrubbing helpers for Sentry beforeSend / breadcrumb processors.
// Single source of truth for what counts as PII. Conservative on the
// false-positive side - we'd rather lose a slightly-overzealous match
// than ship an email address into an error report.
//
// All redaction returns the same string with the matched span replaced
// by a scrubbed placeholder. Length-preserving redactions are NOT
// attempted; the goal is the report being safe, not the report
// reproducing the original message verbatim.
//
// Used by src/lib/observability/sentry.ts. Pure module, no Sentry dep,
// safe to import from any code path.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

// AU mobile (04xx xxx xxx) and international E.164. Errs on the side of
// scrubbing anything that looks vaguely phone-shaped.
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g

// Stripe identifiers - cus_, pi_, ch_, py_, in_, cs_ etc. Stripe IDs are
// not strictly PII but they correlate to a customer record and we treat
// them as sensitive in error reports.
const STRIPE_ID_RE = /\b(cus|pi|ch|py|in|cs|prod|price|sub|seti|src|cn|btok|sk|rk|whsec|acct)_[A-Za-z0-9_]+/g

// JWT tokens (xxx.yyy.zzz). Both Supabase access tokens and Stripe
// publishable keys can match the loose pattern; both are scrubbed.
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g

// Authorization header values. Match Bearer-prefixed and bare hex tokens
// of plausible length.
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi

// 4-tuple credit card pattern. Sanity-check: never log payment data
// directly, but a numeric block in an error message can occur via
// e.g. a Stripe error string.
const CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g

// UUIDs. Not strictly PII, but in EventLinqs they correlate to
// organisations.id, profiles.id, events.id - low-cardinality identifiers
// that allow a Sentry event to be correlated against a real user. Mild
// scrub: keep first 8 chars, redact the rest.
const UUID_RE = /\b([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\b/gi

const SCRUB = '[scrubbed]'

export function scrubString(input: string): string {
  if (!input || typeof input !== 'string') return input
  // Order matters: shape-specific patterns (JWT, Bearer, Stripe ids, UUIDs)
  // run before greedy-numeric patterns (PHONE, CARD). Otherwise PHONE_RE
  // would chew the digit-heavy tail of a UUID before UUID_RE sees it.
  return input
    .replace(JWT_RE, SCRUB)
    .replace(BEARER_RE, `Bearer ${SCRUB}`)
    .replace(STRIPE_ID_RE, (m) => `${m.split('_')[0]}_${SCRUB}`)
    .replace(UUID_RE, (_m, p1) => `${p1}-${SCRUB}`)
    .replace(EMAIL_RE, SCRUB)
    .replace(PHONE_RE, SCRUB)
    .replace(CARD_RE, SCRUB)
}

// Recursive redaction for arbitrary objects (Sentry event payloads
// include nested message/tags/extra/breadcrumbs structures). Skips
// arrays and primitives that are not strings, but recurses into
// children. Caps depth at 6 to bound CPU.
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limited]'
  if (typeof value === 'string') return scrubString(value)
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      // Drop entirely the headers Sentry captures from request contexts
      // that are guaranteed-sensitive.
      if (
        k.toLowerCase() === 'authorization' ||
        k.toLowerCase() === 'cookie' ||
        k.toLowerCase() === 'set-cookie' ||
        k.toLowerCase() === 'x-supabase-auth' ||
        k.toLowerCase() === 'stripe-signature'
      ) {
        out[k] = SCRUB
        continue
      }
      out[k] = scrubValue(v, depth + 1)
    }
    return out
  }
  return value
}

// Test exports - kept exposed so the unit tests in
// tests/unit/observability/pii-scrub.test.ts can target individual
// patterns without re-exposing them through the public scrubString API.
export const _internal = {
  EMAIL_RE,
  PHONE_RE,
  STRIPE_ID_RE,
  JWT_RE,
  BEARER_RE,
  CARD_RE,
  UUID_RE,
  SCRUB,
}
