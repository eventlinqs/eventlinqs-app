import { Resend } from 'resend'
import { getEmailFrom, getNoReplyFrom } from './sender'

/**
 * THE TRANSPORT. Three modules, three separate concerns, one definition each.
 * The boundary is deliberate and is stated here because two of them were built
 * on separate branches within days of each other and read as overlapping:
 *
 *   src/lib/email/sender.ts     WHO mail is FROM. The sending identity and the
 *                               sending domain. Every `from:` and `replyTo:` in
 *                               the codebase derives from it, enforced at build
 *                               time by scripts/guards/sender-single-source.mjs.
 *   src/lib/env/destinations.ts WHERE platform mail GOES. The alert and support
 *                               destinations (founder ruling R2), so no personal
 *                               address is ever a literal in shipped source.
 *   this file                   HOW mail leaves: the Resend client, the
 *                               non-production stamping, and the domain surface
 *                               the email health check asserts against.
 *
 * From and to are not the same question, so they are not merged. This file
 * DECLARES no address of its own: it had two literal sender constants until
 * 2026-08-05, which made it a second sender definition competing with
 * sender.ts. Both now derive from the one module.
 */

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
 * The configured sender for everything that goes through `sendEmail`.
 *
 * Kept as a named function because the health check and its tests read the
 * platform's sender through this name, but it no longer decides anything: the
 * decision lives in sender.ts. `getEmailFrom()` carries the same
 * present-but-blank rule this used to implement with `||`, and additionally
 * rejects a malformed `EMAIL_FROM` rather than sending as it.
 */
export function resolveFrom(): string {
  return getEmailFrom()
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
 * Why this exists (2026-07-26): production's `EMAIL_FROM` pointed at
 * `send.eventlinqs.com`, which is NOT verified at Resend, so every send through
 * `sendEmail` failed. It went unnoticed for as long as it did because the email
 * health check only asked "is the API key valid", never "can we actually send
 * from the addresses we use". Both answers are needed, and this is the second
 * one: the health check asserts every domain returned here is verified.
 *
 * It reads BOTH mail roles rather than just the configured one, because that is
 * the question the health check is really asking. The set is now structurally a
 * single domain: since 2026-08-05 the transactional sender derives from the
 * same module as the configured sender, so the two cannot land on different
 * domains. It stays a deduplicated set rather than a single value so that the
 * day a second sending identity is genuinely introduced, the health check
 * covers it without anyone remembering to come back here.
 */
export function senderDomainsInUse(): string[] {
  return [...new Set([senderDomain(getEmailFrom()), senderDomain(getNoReplyFrom())])].filter(Boolean)
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
 * The `from` address comes from `src/lib/email/sender.ts`, which is the ONE
 * definition of who EventLinqs mail comes from. It used to be inlined here and
 * in four other files, which made a sending-domain move a five-file hunt.
 *
 * Throws on transport failure. Caller is responsible for catching and
 * shaping the user-facing error.
 */
/**
 * A LOCAL TRANSPORT, SO THE SIGNUP PATH CAN BE DRIVEN AT ALL.
 *
 * WHY THIS EXISTS, 27 August 2026. Driving the stranger organiser journey found
 * that a brand new person cannot create an account in ANY environment without a
 * live Resend key: sendEmail throws, the signup route rolls the user back, and
 * the person gets a 502. That is correct behaviour and the message is honest.
 *
 * But it also means NOBODY CAN EXERCISE THEIR OWN SIGNUP FLOW LOCALLY, which is
 * the root cause of the founder's complaint that every test on this platform has
 * been done on an account that already existed. The one path no one could drive
 * was the one every new organiser has to walk.
 *
 * OPT-IN ONLY, and it cannot be pointed at production:
 *
 *  - it does nothing unless EMAIL_TRANSPORT is set to 'console'
 *  - it REFUSES, loudly, if the deploy is production or the Supabase project is
 *    the production one, so it can never mask a real mail failure or silently
 *    swallow a customer's ticket
 *
 * It prints what would have been sent, including the links, which is what a
 * person reads out of their inbox.
 */
const PRODUCTION_SUPABASE_REF = 'gndnldyfudbytbboxesk'

function consoleTransportRefusalReason(): string | null {
  if (process.env.VERCEL_ENV === 'production') return 'VERCEL_ENV is production'
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (url.includes(PRODUCTION_SUPABASE_REF)) return 'the Supabase project is PRODUCTION'
  return null
}


/**
 * The console transport's output, exported so the two senders that build their
 * own Resend client (the ticket confirmation, which attaches inline QR images,
 * and the payout notice, which sends as a different from-address) can be driven
 * locally through the SAME format rather than each growing its own.
 *
 * Extracted 29 August 2026: those two senders returned early on a missing
 * RESEND_API_KEY, above this transport, which is why the buyer's ticket email
 * had never once been observed.
 */
export function printConsoleEmail(input: { to: string; subject: string; html?: string }): void {
  const links = [...String(input.html ?? '').matchAll(/https?:\/\/[^"'\s<>]+/g)]
    .map((m) => m[0])
    // `/t/` and `watch` were added on 3 September 2026: the bearer ticket link
    // and the livestream watch link contain neither "ticket" nor "order", so the
    // console inbox printed the order link and silently dropped the two links
    // a journey most needs to read.
    .filter((u) => /confirm|token|ticket|order|verify|reset|watch|\/t\//i.test(u))
  console.log('[email:console] ---------------------------------------------')
  console.log(`[email:console] to      ${input.to}`)
  console.log(`[email:console] subject ${input.subject}`)
  for (const l of links.slice(0, 5)) console.log(`[email:console] link    ${l}`)
  console.log('[email:console] ---------------------------------------------')
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  // Single source: resolveFrom() delegates to sender.ts, so the health check
  // and the sender can never disagree about who this platform sends as.
  const from = resolveFrom()

  if (process.env.EMAIL_TRANSPORT === 'console') {
    const refusal = consoleTransportRefusalReason()
    if (refusal) {
      throw new Error(
        `EMAIL_TRANSPORT=console refused: ${refusal}. This transport exists so the ` +
          'signup and ticket paths can be driven locally against TEST. Enabling it ' +
          'anywhere near production would swallow real mail.',
      )
    }
    printConsoleEmail({ to: input.to, subject: input.subject, html: input.html })
    return { id: `console-${Date.now()}` }
  }

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
