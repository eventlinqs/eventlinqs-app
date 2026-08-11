/**
 * THE single definition of who EventLinqs mail comes from.
 *
 * Founder ruling 2026-08-03: the platform sends from `eventlinqs.com`.
 * That domain is already verified end to end in Resend - SPF on
 * `send.eventlinqs.com`, DKIM at `resend._domainkey.eventlinqs.com`, and the
 * Amazon SES return path on the `send.` MX. `eventlinqs.com.au` has no Resend
 * DNS at all, so moving the sender there days out from launch would restart
 * sender reputation from zero. See docs/hardening/auth/DOMAIN-DECISION.md for
 * the full consequence analysis.
 *
 * Every `from:` and `replyTo:` in the codebase resolves through this module.
 * A literal sender address anywhere else is a defect and is failed by
 * `scripts/guards/sender-single-source.mjs` at build time - the address used to
 * live as a string in five separate files, which meant a domain move was a
 * five-file archaeology exercise instead of a one-line change.
 *
 * Precedence for the domain:
 *   1. the host of `EMAIL_FROM`, when that env var is set (production sets it
 *      explicitly, so an env-only domain move stays possible without a deploy)
 *   2. `DEFAULT_SENDER_DOMAIN` below
 *
 * Deriving the domain FROM `EMAIL_FROM` rather than keeping a second variable
 * is deliberate: two independent sources would let the auth sender and the
 * transactional sender drift onto different domains, which is precisely the
 * kind of split that produces one verified stream and one silently bouncing
 * stream.
 */

/** The one domain literal in the codebase. */
const DEFAULT_SENDER_DOMAIN = 'eventlinqs.com'

const DISPLAY_NAME = 'EventLinqs'

/** Local parts, one per mail role. Never write these inline at a call site. */
const LOCAL_PARTS = {
  /** Human-answerable address. Auth mail and anything expecting a reply. */
  hello: 'hello',
  /** Unattended machine sends: receipts, payouts, waitlist, refunds. */
  noreply: 'noreply',
} as const

/** Extract the domain from an RFC 5322 `Name <local@domain>` or bare address. */
function domainOf(address: string): string | null {
  const match = /<([^>]+)>/.exec(address)
  const bare = (match ? match[1] : address).trim()
  const at = bare.lastIndexOf('@')
  if (at <= 0 || at === bare.length - 1) return null
  const domain = bare.slice(at + 1).toLowerCase()
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null
}

/**
 * The active sending domain. Reads `EMAIL_FROM` at call time (never at module
 * load) so a serverless instance picks up an env change on its next cold start
 * rather than pinning the value into the bundle.
 */
export function getSenderDomain(): string {
  const configured = process.env.EMAIL_FROM
  if (configured) {
    const parsed = domainOf(configured)
    if (parsed) return parsed
  }
  return DEFAULT_SENDER_DOMAIN
}

/** `EventLinqs <hello@...>`. Auth mail and anything a human may reply to. */
export function getEmailFrom(): string {
  // An explicitly configured EMAIL_FROM wins verbatim: production may want a
  // different display name or local part without a code change.
  const configured = process.env.EMAIL_FROM
  if (configured && domainOf(configured)) return configured
  return `${DISPLAY_NAME} <${LOCAL_PARTS.hello}@${getSenderDomain()}>`
}

/** `EventLinqs <noreply@...>`. Unattended transactional sends. */
export function getNoReplyFrom(): string {
  return `${DISPLAY_NAME} <${LOCAL_PARTS.noreply}@${getSenderDomain()}>`
}

/** Bare `hello@...`, for the `replyTo` on unattended sends. */
export function getReplyToAddress(): string {
  return `${LOCAL_PARTS.hello}@${getSenderDomain()}`
}
