/**
 * HTML escaping for email bodies, in one place.
 *
 * WHY THIS FILE EXISTS AND WHY IT DID NOT REPLACE THE NINE COPIES ON THE DAY IT
 * WAS WRITTEN. There are nine private `escapeHtml` helpers in this codebase
 * (src/lib/notifications/dispatch.ts, src/lib/email/order-confirmation.ts,
 * src/lib/email/templates/refund-confirmation.ts, src/lib/payouts/email.ts,
 * src/lib/refunds/notify.ts, src/lib/marketplace/notify.ts,
 * src/lib/broadcast/digest.ts, src/lib/launch/kit-email.ts,
 * src/lib/ai/handoff.ts) and they DO NOT AGREE: three escape `& < >`, three add
 * `"`, and three add `'` as well. Collapsing them onto one definition changes
 * the bytes of live transactional mail on the money path, which is a change with
 * its own proof obligation and not a free tidy-up. It is recorded in
 * REVIEW-QUEUE.md as a named follow-up rather than done invisibly inside another
 * item.
 *
 * New code uses this one. It escapes the strictest set, so its output is safe in
 * an element body and inside a single or double quoted attribute alike.
 */
const REPLACEMENTS: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape `& < > " '` so a value is safe in body text and in an attribute. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => REPLACEMENTS[c] as string)
}
