/**
 * CAN THIS DEPLOYMENT SEND MAIL AT ALL, and if not, SAY SO.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS REPLACES, found 29 August 2026 while proving the ticket email
 * end to end for the first time.
 *
 * Four senders each opened with their own copy of:
 *
 *     const resendKey = process.env.RESEND_API_KEY
 *     if (!resendKey) return
 *
 * A silent return. Two consequences, and the second is the serious one.
 *
 *   1. IT COULD NOT BE PROVEN. The check sat ABOVE sendEmail(), so it returned
 *      before the console transport that exists precisely so these paths can be
 *      driven locally. A real card-4242 purchase completed, Stripe delivered
 *      payment_intent.succeeded, the webhook confirmed the order and issued a
 *      valid ticket, and the email path produced no output of any kind. Nothing
 *      was broken and nothing was observable, which is why "has the buyer ever
 *      received their ticket" had gone unanswered.
 *
 *   2. ON A DEPLOYMENT MISSING THE KEY, EVERY BUYER SILENTLY GETS NOTHING. The
 *      order confirms, the money is taken, the ticket exists, and the email that
 *      carries the QR is skipped without a line in any log. A buyer who never
 *      receives their ticket has bought nothing, and the platform would have no
 *      record that it happened.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES INSTEAD. One function, asked before sending, that:
 *
 *   * treats EMAIL_TRANSPORT=console as a working transport, so every mail path
 *     is drivable locally against TEST and can be proven rather than assumed;
 *   * treats a present-but-empty key as missing, which is the shape a
 *     dashboard-set variable actually takes when it goes wrong;
 *   * when it CANNOT send, logs an error naming what was not delivered and to
 *     whom, so an undelivered ticket leaves a trace somebody can find.
 *
 * It deliberately does NOT throw. A mail fault must never fail a confirmed
 * order or a completed payout. The requirement is that it be audible, not fatal.
 */

export type MailTransport = 'resend' | 'console' | 'none'

export function resolveMailTransport(): MailTransport {
  if (process.env.EMAIL_TRANSPORT === 'console') return 'console'
  const key = process.env.RESEND_API_KEY
  if (key && key.trim().length > 0) return 'resend'
  return 'none'
}

/**
 * True when a send would actually reach a transport.
 *
 * `what` and `who` are for the log line on the failing path: they name the
 * thing the person did not receive, which is the fact worth recording.
 */
export function mailTransportReady(what: string, who?: string | null): boolean {
  const transport = resolveMailTransport()
  if (transport !== 'none') return true

  console.error(
    `[email] NOT SENT: ${what}${who ? ` to ${who}` : ''}. ` +
      'RESEND_API_KEY is missing or empty on this deployment, so no mail can be sent at all. ' +
      'This is a deploy misconfiguration, not a transient fault: set RESEND_API_KEY in the ' +
      'Vercel environment for this scope and redeploy. Until then every buyer confirmation, ' +
      'refund notice and payout notice is being dropped.',
  )
  return false
}
