import { Resend } from 'resend'

// Lazy module-singleton. Building with an empty RESEND_API_KEY (CI typecheck
// or fresh clone) must succeed; the client is only constructed when a request
// actually triggers a send. Calling `getResend()` without the key set throws
// a deterministic error so the API route can return a clean 500 instead of a
// runtime ReferenceError.
let client: Resend | null = null

function getResend(): Resend {
  if (client) return client
  const key = process.env.RESEND_API_KEY
  if (!key) {
    throw new Error('RESEND_API_KEY is not configured')
  }
  client = new Resend(key)
  return client
}

/**
 * Is this a real production deployment?
 *
 * Anything else - a preview, staging, a local run - is reading the TEST
 * database, so every address and every order it emails about is test data.
 */
function isProductionDeploy(): boolean {
  return process.env.VERCEL_ENV === 'production'
}

/**
 * Non-production mail must never look like production mail.
 *
 * Production and staging share one Resend account, so a staging deployment can
 * physically send from the production sender. If it does, a recipient cannot
 * tell a staging test from a real ticket - and staging's data comes from the
 * TEST database, so the links point at orders that do not exist in production.
 * Stamping the display name makes the origin unmistakable while keeping the
 * underlying verified mailbox (so delivery still works without a second
 * verified domain).
 */
export function stampSender(from: string): string {
  if (isProductionDeploy()) return from
  const withName = /^(.*?)\s*<(.+)>$/.exec(from)
  if (withName) return `${withName[1].trim()} [STAGING] <${withName[2].trim()}>`
  return `EventLinqs [STAGING] <${from}>`
}

/** Prefix non-production subjects so a staging email is obvious in an inbox. */
export function stampSubject(subject: string): string {
  if (isProductionDeploy()) return subject
  return subject.startsWith('[STAGING]') ? subject : `[STAGING] ${subject}`
}

/**
 * The sender used when `EMAIL_FROM` is unset or blank.
 */
export const DEFAULT_FROM = 'EventLinqs <hello@eventlinqs.com>'

/**
 * The sender the BUYER-FACING transactional mail is hardcoded to.
 *
 * Mirrors the literal in the four call sites that build their own Resend
 * client rather than going through `sendEmail`: the order confirmation (the
 * ticket email, src/lib/email/order-confirmation.ts), the refund confirmation
 * (src/app/api/webhooks/stripe/route.ts), the payout emails
 * (src/lib/payouts/email.ts) and the waitlist promotion
 * (src/lib/waitlist/promote.ts). Declared here so the email health check can
 * assert this domain is verified at Resend without importing the webhook route,
 * whose money logic must not be disturbed.
 */
export const TRANSACTIONAL_FROM = 'EventLinqs <noreply@eventlinqs.com>'

/** The configured sender for everything that goes through `sendEmail`. */
export function resolveFrom(): string {
  // `||` not `??`: an EMPTY EMAIL_FROM (present but blank) must fall back to
  // the verified default, not be sent as an empty from.
  return process.env.EMAIL_FROM?.trim() || DEFAULT_FROM
}

/** Just the domain part of a `Name <user@domain>` or bare `user@domain`. */
export function senderDomain(from: string): string {
  const m = /<([^>]+)>\s*$/.exec(from.trim())
  const address = (m ? m[1] : from).trim()
  return (address.split('@')[1] ?? '').toLowerCase()
}

/**
 * Every domain this deployment can actually send from, deduplicated.
 *
 * Why this exists (2026-07-26): production's `EMAIL_FROM` points at
 * `send.eventlinqs.com`, which is NOT verified at Resend, so every send through
 * `sendEmail` failed. It went unnoticed for as long as it did because the email
 * health check only asked "is the API key valid", never "can we actually send
 * from the addresses we use". Both answers are needed.
 */
export function senderDomainsInUse(): string[] {
  return [...new Set([senderDomain(resolveFrom()), senderDomain(TRANSACTIONAL_FROM)])].filter(Boolean)
}

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  /** Optional plain-text part. Resend will derive one if omitted, but
   * supplying a hand-tuned text alternative improves deliverability. */
  text?: string
}

/**
 * Direct send via Resend SDK. Bypasses Supabase Auth's SMTP entirely so we
 * can drive transactional auth mail (signup confirm, password reset, magic
 * link) on a single deliverability path with our own retries, observability
 * hooks, and rate-limit envelope.
 *
 * The default `from` address resolves in this order:
 *   1. `EMAIL_FROM` env var (production-appropriate).
 *   2. Hardcoded `EventLinqs <hello@eventlinqs.com>` for local dev so a
 *      signup form submission against a partly-configured `.env.local` does
 *      not require setting an extra var to exercise the path.
 *
 * Throws on transport failure. Caller is responsible for catching and
 * shaping the user-facing error.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  // Single source: resolveFrom() carries the "present but blank falls back"
  // rule, so the health check and the sender can never disagree.
  const from = resolveFrom()
  const resend = getResend()
  const { data, error } = await resend.emails.send({
    from: stampSender(from),
    to: input.to,
    subject: stampSubject(input.subject),
    html: input.html,
    text: input.text,
  })
  if (error) {
    throw new Error(error.message ?? 'Resend send failed')
  }
  if (!data?.id) {
    throw new Error('Resend send returned no message id')
  }
  return { id: data.id }
}
