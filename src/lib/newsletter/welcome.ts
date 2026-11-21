import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildDigestEmailHtml, fetchDigestEvents, resolveDigestPeriod } from '@/lib/broadcast/digest'
import { oneClickUnsubscribeHeaders } from '@/lib/consent/one-click'
import { LOCAL_DIGEST_PURPOSE } from '@/lib/consent/purposes'
import { filterPermittedRecipients } from '@/lib/consent/resolver'
import { undeliverableAddresses } from '@/lib/email/delivery-events'
import { sendEmail } from '@/lib/email/send'

/**
 * THE WELCOME, AT ONCE (law 50 (a), Lawal, 21 November 2026, 10:06: "If somebody clicks on 'Subscribe to a newsletter,'
 * that is the record"; law 45). The moment the subscribe click is recorded, the person receives this week's picks for
 * their city, built by the weekly digest's own reads and template (src/lib/broadcast/digest.ts), with the one click
 * unsubscribe pair from the same token the digest uses, so the first email is the guide itself and never a request to
 * confirm. A week with no picks yet sends nothing: Wednesday's edition is then the first. An address with a recorded
 * hard bounce is never sent to (law 50 (d)), the rule the digest's own audience applies.
 */

type Admin = SupabaseClient<Database>

export type WelcomeOutcome = 'sent' | 'no_picks' | 'no_token' | 'undeliverable' | 'refused' | 'not_sent'

/** The subject of the welcome: the city and what it carries, no exclamation, no dash (copy laws). */
export function welcomeSubject(cityName: string): string {
  return `Welcome to the ${cityName} guide: this week's picks`
}

export async function sendNewsletterWelcome(
  admin: Admin,
  input: { email: string; citySlug: string; cityName: string; origin: string; now?: Date },
): Promise<WelcomeOutcome> {
  const now = input.now ?? new Date()
  const row = await admin
    .from('marketing_consents')
    .select('unsubscribe_token, status')
    .eq('email', input.email)
    .eq('city_slug', input.citySlug)
    .order('granted_at', { ascending: false })
    .limit(1)
  const token = row.data?.[0]?.status === 'granted' ? (row.data[0].unsubscribe_token as string | null) : null
  if (row.error || !token) return 'no_token'
  try {
    if ((await undeliverableAddresses(admin, [input.email])).has(input.email.trim().toLowerCase())) return 'undeliverable'
    // The ledger decides, as for the weekly digest itself: a suppression or a withdrawal wins over the click.
    const verdict = await filterPermittedRecipients(admin, [input.email], { purpose: LOCAL_DIGEST_PURPOSE, channel: 'email' })
    if (verdict.permitted.length === 0) return 'refused'
  } catch {
    return 'not_sent'
  }
  const period = resolveDigestPeriod(now, 'week')
  const events = await fetchDigestEvents(admin, input.citySlug, period, 10, input.origin, input.cityName, now)
  if (events.length === 0) return 'no_picks'
  const built = buildDigestEmailHtml({
    cityName: input.cityName,
    events,
    origin: input.origin,
    edition: 'week',
    period,
    unsubscribeUrl: `${input.origin}/unsubscribe/digest/${token}`,
  })
  try {
    await sendEmail({
      to: input.email,
      subject: welcomeSubject(input.cityName),
      html: built.html,
      text: built.text,
      // The same declared type and role as the weekly digest it is (src/lib/notifications/recipient-matrix.ts).
      messageType: 'attendee_event_alert',
      recipientRole: 'prospect',
      headers: oneClickUnsubscribeHeaders(input.origin, token),
    })
    return 'sent'
  } catch {
    return 'not_sent'
  }
}
