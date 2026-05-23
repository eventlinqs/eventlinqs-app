/**
 * Refund confirmation email template.
 *
 * Issued automatically when `charge.refunded` fires for an order on the
 * Stripe webhook (see `src/app/api/webhooks/stripe/route.ts`). The buyer
 * receives this email once the refund is successfully recorded.
 *
 * Closes AUDIT-FUNCTIONALITY-2026-05-23.md MEDIUM-1 ("No refund-
 * confirmation email"). Industry reference: Eventbrite "Order refunded"
 * and Humanitix refund email patterns - subject names the event, body
 * carries order id, refund amount, ticket count, expected timeframe,
 * optional organiser custom message, and support contacts.
 *
 * Style mirrors the purchase-confirmation email built inline in
 * `src/app/api/webhooks/stripe/route.ts` (forced-light colour-scheme,
 * tabular HTML with inline styles, AU English copy, no em-dashes or
 * exclamation marks). The template is pure: it takes props and returns
 * strings; it does not load DB, environment, or Resend.
 */

import { formatMoney } from '@/lib/money/format'

export type RefundConfirmationProps = {
  /** Buyer's display name; null falls back to "there" in the greeting. */
  buyerName: string | null
  /** Order number shown to the buyer, e.g. "ORD-12345". */
  orderNumber: string
  /** Event title - shown verbatim in subject and body. */
  eventTitle: string
  /** Tickets refunded by this charge.refunded event. */
  ticketCount: number
  /** Refund amount in minor units (cents). Authoritative integer. */
  refundAmountCents: number
  /** ISO 4217 currency code, e.g. "AUD". */
  currency: string
  /**
   * Optional organiser-supplied message. If null, empty, or whitespace
   * the message block does not render.
   */
  customMessage: string | null
  /** Organiser display name for the support-contact line. */
  organiserName: string | null
  /** Organiser support email for the support-contact line. */
  organiserContactEmail: string | null
}

/**
 * Subject line. Format mirrors Eventbrite's "Order refunded: <title>"
 * but uses "Refund processed:" so the buyer immediately understands
 * that the refund has gone through (not just a request).
 */
export function buildRefundConfirmationSubject(eventTitle: string): string {
  return `Refund processed: ${eventTitle}`
}

/** Standard timeframe sentence shown to every buyer. */
export function buildRefundTimeframeSentence(
  amountCents: number,
  currency: string,
): string {
  const amount = formatMoney(amountCents, currency)
  return `Your refund of ${amount} will appear on your statement within 3 to 5 business days. Some banks may take up to 10 days.`
}

/**
 * Greeting line. Falls back to "Hi there" when buyer name is missing,
 * matching the existing purchase-confirmation email's defensive default.
 */
function buildGreeting(buyerName: string | null): string {
  const trimmed = (buyerName ?? '').trim()
  if (!trimmed) return 'Hi there,'
  // First name only when a multi-word name is supplied.
  const first = trimmed.split(/\s+/)[0]
  return `Hi ${first},`
}

/** "1 ticket" vs "N tickets" - AU English style: integer + label only. */
function ticketCountLabel(n: number): string {
  return n === 1 ? '1 ticket' : `${n} tickets`
}

/** Trim and null-coalesce a free-text input from a DB row. */
function trimOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * HTML-escape user-controlled or DB-derived strings before interpolating
 * them into the HTML body. Defends against any future organiser custom
 * message that happens to contain markup or quotes.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Newline-to-<br> conversion for the multi-line organiser custom
 * message. Already HTML-escaped before being passed here.
 */
function nl2br(value: string): string {
  return value.replace(/\r\n|\n|\r/g, '<br />')
}

/**
 * Build the HTML body. Forced-light colour scheme so dark-mode clients
 * do not invert the brand surfaces.
 */
export function buildRefundConfirmationHtml(props: RefundConfirmationProps): string {
  const greeting = buildGreeting(props.buyerName)
  const title = escapeHtml(props.eventTitle)
  const orderNumber = escapeHtml(props.orderNumber)
  const ticketsLabel = ticketCountLabel(props.ticketCount)
  const amountLabel = formatMoney(props.refundAmountCents, props.currency)
  const timeframe = escapeHtml(
    buildRefundTimeframeSentence(props.refundAmountCents, props.currency),
  )

  const customMessage = trimOrNull(props.customMessage)
  const customBlock = customMessage
    ? `
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
      <p style="margin:0 0 8px;color:#1F2937;font-weight:600;font-size:15px;">Message from the organiser</p>
      <p style="margin:0;color:#4B5563;font-size:15px;line-height:1.55;">${nl2br(escapeHtml(customMessage))}</p>`
    : ''

  const organiserName = trimOrNull(props.organiserName)
  const organiserContact = trimOrNull(props.organiserContactEmail)
  const supportLine =
    organiserName && organiserContact
      ? `Questions? Reply to this email or contact ${escapeHtml(organiserName)} at <a href="mailto:${escapeHtml(organiserContact)}" style="color:#0A1628;">${escapeHtml(organiserContact)}</a>.`
      : organiserContact
        ? `Questions? Reply to this email or contact the organiser at <a href="mailto:${escapeHtml(organiserContact)}" style="color:#0A1628;">${escapeHtml(organiserContact)}</a>.`
        : `Questions? Reply to this email and our support team will help.`

  return `<!doctype html>
<html lang="en" style="color-scheme: light only;">
<head>
<meta charset="utf-8" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>Refund processed: ${title}</title>
</head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1F2937;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAFAF7;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:#FFFFFF;margin:32px 0;border:1px solid #e5e7eb;">
        <tr>
          <td style="padding:32px 32px 24px;">
            <p style="margin:0 0 4px;color:#6B7280;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;">EventLinqs</p>
            <h1 style="margin:0;color:#0A1628;font-size:24px;font-weight:700;line-height:1.25;">Your refund has been processed</h1>
            <p style="margin:24px 0 12px;color:#1F2937;font-size:16px;line-height:1.55;">${escapeHtml(greeting)}</p>
            <p style="margin:0 0 24px;color:#4B5563;font-size:15px;line-height:1.55;">${timeframe}</p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;color:#6B7280;font-size:14px;width:160px;">Order</td>
                <td style="padding:8px 0;color:#1F2937;font-size:14px;font-weight:600;">${orderNumber}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6B7280;font-size:14px;">Event</td>
                <td style="padding:8px 0;color:#1F2937;font-size:14px;font-weight:600;">${title}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6B7280;font-size:14px;">Tickets refunded</td>
                <td style="padding:8px 0;color:#1F2937;font-size:14px;font-weight:600;">${ticketsLabel}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6B7280;font-size:14px;">Refund amount</td>
                <td style="padding:8px 0;color:#1F2937;font-size:14px;font-weight:600;">${escapeHtml(amountLabel)}</td>
              </tr>
            </table>
${customBlock}
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
            <p style="margin:0;color:#4B5563;font-size:14px;line-height:1.55;">${supportLine}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e5e7eb;background:#FAFAF7;">
            <p style="margin:0;color:#6B7280;font-size:12px;line-height:1.5;">
              EventLinqs, Geelong VIC, Australia. ABN 30 837 447 587. All-in pricing. No surprise fees.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

/** Plain-text counterpart for clients that prefer text/plain over HTML. */
export function buildRefundConfirmationText(props: RefundConfirmationProps): string {
  const greeting = buildGreeting(props.buyerName)
  const ticketsLabel = ticketCountLabel(props.ticketCount)
  const amountLabel = formatMoney(props.refundAmountCents, props.currency)
  const timeframe = buildRefundTimeframeSentence(props.refundAmountCents, props.currency)

  const customMessage = trimOrNull(props.customMessage)
  const customBlock = customMessage
    ? `\n\nMessage from the organiser\n${customMessage}\n`
    : ''

  const organiserName = trimOrNull(props.organiserName)
  const organiserContact = trimOrNull(props.organiserContactEmail)
  const supportLine =
    organiserName && organiserContact
      ? `Questions? Reply to this email or contact ${organiserName} at ${organiserContact}.`
      : organiserContact
        ? `Questions? Reply to this email or contact the organiser at ${organiserContact}.`
        : `Questions? Reply to this email and our support team will help.`

  return [
    `Your refund has been processed`,
    ``,
    greeting,
    ``,
    timeframe,
    ``,
    `Order: ${props.orderNumber}`,
    `Event: ${props.eventTitle}`,
    `Tickets refunded: ${ticketsLabel}`,
    `Refund amount: ${amountLabel}`,
    customBlock,
    supportLine,
    ``,
    `EventLinqs, Geelong VIC, Australia. ABN 30 837 447 587.`,
    `All-in pricing. No surprise fees.`,
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}
