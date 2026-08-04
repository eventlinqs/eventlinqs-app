/**
 * WHERE PLATFORM MAIL GOES. One definition, read by every call site.
 *
 * WHY THIS EXISTS (founder ruling R2, 2026-08-03). The destination for every
 * payment alert and every health alert this platform raises used to be a
 * personal address hardcoded in two separate source files:
 *
 *   src/lib/health/runner.ts               PAYMENT_ALERT_EMAIL || 'lawaladams9@gmail.com'
 *   src/app/api/cron/webhook-sentinel/...  PAYMENT_ALERT_EMAIL || 'lawaladams9@gmail.com'
 *
 * Nothing was being lost, which is exactly why it survived so long: the
 * fallback worked, so no alert ever went missing and no test ever failed. The
 * defect is that a money-handling platform routed its fault reporting to a
 * private mailbox named in source, in two places that could drift apart, where
 * changing it meant a code change and a deploy, and where anyone reading the
 * repository learned the founder's personal address.
 *
 * THE FALLBACK IS DELIBERATE AND MUST STAY. A required variable that someone
 * later deletes has to degrade to a real inbox, never to nothing: an alert with
 * no recipient is silently discarded, which is worse than the problem it was
 * raised about. So the chain is `the configured variable, else the platform
 * inbox` and never an empty string.
 *
 * PLATFORM_INBOX IS PROVEN, NOT ASSUMED. hello@eventlinqs.com was verified to
 * reach a real mailbox on 2026-08-03 by sending to it and reading back Resend's
 * delivery event (`delivered`). The obvious-looking alerts@eventlinqs.com was
 * tested at the same time and HARD BOUNCED: Exchange Online answered
 * `550 5.4.1 Recipient address rejected: Access denied`, meaning no such
 * mailbox exists. An alert address that bounces is worse than no change at all,
 * so it is not used here and must not be configured until that mailbox is
 * created. See docs/ENV-DOCTRINE.md.
 */

/**
 * The one brand-owned address every destination falls back to. Proven
 * deliverable. Never a personal address, and never an address that has not been
 * tested end to end.
 */
export const PLATFORM_INBOX = 'hello@eventlinqs.com'

/** Where payment and health faults are delivered. */
export function alertDestination(): string {
  return process.env.PAYMENT_ALERT_EMAIL?.trim() || PLATFORM_INBOX
}

/** Where a customer support escalation lands. */
export function supportDestination(): string {
  return process.env.SUPPORT_INBOX_EMAIL?.trim() || PLATFORM_INBOX
}
