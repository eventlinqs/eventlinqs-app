'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { alertDestination } from '@/lib/env/destinations'
import { captureException } from '@/lib/observability/sentry'
import { actionRateLimit } from '@/lib/rate-limit/action'
import {
  composeOutreachUnsubscribeAlert,
  parseOutreachUnsubscribe,
  recordOutreachUnsubscribe,
  type OutreachUnsubscribeField,
} from '@/lib/outreach/unsubscribe'

/**
 * THE OUTREACH UNSUBSCRIBE, AS A DELIBERATE PRESS.
 *
 * The only thing that records an unsubscribe from /unsubscribe/outreach. The
 * page itself does nothing on load, so an email security scanner that fetches
 * every link in a message cannot unsubscribe anybody; this runs only when a
 * person presses the button (a form POST).
 *
 * THE ORDER, and why each step is where it is:
 *
 *   1. VALIDATE everything the browser sent, here, on the server
 *      (parseOutreachUnsubscribe). A refusal is a message beside the field.
 *   2. RATE LIMIT, after validation so a malformed submission costs no window.
 *   3. RECORD. recordOutreachUnsubscribe THROWS on a failed write, and this
 *      action lets it: the throw reaches the segment's error boundary
 *      (src/app/unsubscribe/outreach/error.tsx), which says nothing was saved
 *      and to try again. It never says "You're unsubscribed" about a row that
 *      does not exist (the read-or-throw rule, src/lib/supabase/read-or-throw.ts).
 *   4. TELL THE FOUNDER, once. A failed alert is logged and captured and does
 *      NOT fail the unsubscribe: the row is the record, and the person asked to
 *      stop whether or not an inbox heard about it.
 *
 * Append only: a second press writes a second row, which is harmless.
 */

export type OutreachUnsubscribeState =
  | { status: 'idle' }
  | { status: 'invalid'; field: OutreachUnsubscribeField; message: string }
  | { status: 'limited'; message: string }
  | { status: 'done' }

export async function unsubscribeFromOutreachAction(
  _previous: OutreachUnsubscribeState,
  formData: FormData,
): Promise<OutreachUnsubscribeState> {
  const parsed = parseOutreachUnsubscribe({
    id: formData.get('id'),
    email: formData.get('email'),
    reason: formData.get('reason'),
    comment: formData.get('comment'),
  })
  if (!parsed.ok) {
    return { status: 'invalid', field: parsed.field, message: parsed.message }
  }

  const limited = await actionRateLimit('outreach-unsubscribe')
  if (!limited.ok) {
    return {
      status: 'limited',
      message: 'Too many requests from this connection. Please wait a few minutes and try again.',
    }
  }

  const admin = createAdminClient()
  const recorded = await recordOutreachUnsubscribe(
    (row) => admin.from('outreach_unsubscribes').insert(row).select('id, created_at').single(),
    parsed.value,
  )

  const alert = composeOutreachUnsubscribeAlert(parsed.value, recorded)
  try {
    await sendEmail({
      to: alertDestination(),
      subject: alert.subject,
      text: alert.text,
      html: alert.html,
      messageType: 'outreach_unsubscribe_alert',
      recipientRole: 'platform_owner',
    })
  } catch (error) {
    console.error('[outreach-unsubscribe] the alert email failed; the unsubscribe IS recorded:', error)
    captureException(error, {
      where: 'app/actions/outreach-unsubscribe:alert',
      outreach_unsubscribe_id: recorded.id,
    })
  }

  return { status: 'done' }
}
