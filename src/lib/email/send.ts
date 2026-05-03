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
  const from = process.env.EMAIL_FROM ?? 'EventLinqs <hello@eventlinqs.com>'
  const resend = getResend()
  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
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
