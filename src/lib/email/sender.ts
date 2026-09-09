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

/**
 * THE PUBLIC CONTACT ADDRESSES (close-out UX2.4).
 *
 * WHY THESE LIVE HERE. Until 9 September 2026 the platform published seven
 * different local parts - hello, careers, organisers, legal, privacy, support,
 * press - hand-written as `mailto:` literals in about thirty-eight places across
 * the legal pages, the press page, the careers page, checkout and the contact
 * form. None of them derived from anything. The SENDING identity above had one
 * source and a guard; the addresses printed on the site had neither, so the two
 * halves of the platform's email identity could drift apart without any check
 * noticing.
 *
 * THE SPLIT THE CLOSE-OUT REPORTED. Every one of those addresses is at
 * `eventlinqs.com` while the site is served from `eventlinqs.com.au`. That is
 * the defect: a visitor reads a contact address on a different domain from the
 * site they are on, which reads as careless at best.
 *
 * WHY IT IS NOT SIMPLY FLIPPED HERE. `EMAIL_FROM`'s manifest entry
 * (src/lib/env/manifest.mjs) describes eventlinqs.com as "the apex domain
 * VERIFIED AT RESEND". Sending from a domain Resend has not verified does not
 * degrade, it fails, and this repository already has `alerts@eventlinqs.com`
 * hard-bouncing on 2026-08-03 on the record as what that looks like. Verifying
 * eventlinqs.com.au needs DNS records at the registrar, which no agent here
 * holds a credential for.
 *
 * So the flip is ONE EDIT to `DEFAULT_SENDER_DOMAIN` above, the moment the
 * founder verifies the domain at Resend. Everything derives from it, and
 * `scripts/guards/one-contact-domain.mjs` fails the build if any surface starts
 * publishing an address that does not.
 */

/** Every public-facing local part, one per role. Never written at a call site. */
const CONTACT_LOCAL_PARTS = {
  /** General enquiries and the address on the legal pages. */
  hello: 'hello',
  /** Refunds, orders and anything a buyer needs a human for. */
  support: 'support',
  /** Organiser-facing enquiries, named in the organiser terms. */
  organisers: 'organisers',
  /** Privacy requests, named in the privacy policy. */
  privacy: 'privacy',
  /** Legal notices, named in the terms. */
  legal: 'legal',
  /** Press and brand-asset requests. */
  press: 'press',
  /** Hiring. */
  careers: 'careers',
} as const

export type ContactRole = keyof typeof CONTACT_LOCAL_PARTS

/**
 * A public contact address for one role, on the one domain.
 *
 * Deliberately derived from `getSenderDomain()` rather than from a second
 * constant: the address a visitor is invited to write to and the address the
 * platform sends from must be the same domain, or the reply lands nowhere and
 * the domain's authentication record covers only half the traffic.
 */
export function contactAddress(role: ContactRole): string {
  return `${CONTACT_LOCAL_PARTS[role]}@${getSenderDomain()}`
}

/** `mailto:` href for a contact role, with an optional subject. */
export function contactMailto(role: ContactRole, subject?: string): string {
  const base = `mailto:${contactAddress(role)}`
  return subject ? `${base}?subject=${encodeURIComponent(subject)}` : base
}

/** Every published contact address, for the guard and for tests. */
export function allContactAddresses(): string[] {
  return (Object.keys(CONTACT_LOCAL_PARTS) as ContactRole[]).map(contactAddress)
}
