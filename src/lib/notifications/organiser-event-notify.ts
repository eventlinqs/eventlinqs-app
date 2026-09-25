import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import { escapeHtml } from '@/lib/email/escape'
import { captureException } from '@/lib/observability/sentry'
import { resolveOrganisationOwnerEmail } from './organiser-recipient'
import { readOrThrow, ReadFailed } from '@/lib/supabase/read-or-throw'

/**
 * "EVENT PUBLISHED OR APPROVED". Close-out MONEY FIX, part B, step B4.
 *
 * The owner's business feed has carried `event_published` since close-out UX3.
 * The organiser had no counterpart, so the platform told itself that somebody
 * else's event had gone live and told that somebody nothing. Clause 2 of
 * `guard:every-message-has-a-declared-recipient` is what refused to let that
 * stand: `platform_event_published` must name an organiser message, and the
 * guard checks the named message is one the tree actually sends.
 *
 * NON-FATAL, like the sale notice and for the same reason: publishing an event
 * must never fail because a mail server did. The caller uses `void` and this
 * never throws.
 */

export type EventPublishedNotifyResult =
  | { status: 'sent' }
  | { status: 'skipped'; reason: 'no_recipient' | 'event_not_found' | 'send_failed' | 'read_failed' }

export async function notifyOrganiserEventPublished(input: {
  eventId: string
}): Promise<EventPublishedNotifyResult> {
  try {
    const admin = createAdminClient()

    // The organisation is READ FROM THE EVENT rather than passed in. Two call
    // sites publish (the dashboard action and the scheduled-publish cron) and
    // only one of them holds an organisation id, so taking it as an argument
    // would have meant either a second lookup at one call site or two
    // different notifiers.
    /*
     * A BLINKED READ USED TO SAY `event_not_found` ABOUT THE EVENT THAT HAD
     * JUST BEEN PUBLISHED, one line after the publish that triggered it, and
     * the organiser was simply never told their event went live.
     */
    const event = await readOrThrow('organiser-event-published', () =>
      admin
        .from('events')
        .select('title, slug, organisation_id')
        .eq('id', input.eventId)
        .maybeSingle(),
    )
    if (!event) return { status: 'skipped', reason: 'event_not_found' }

    const recipient = await resolveOrganisationOwnerEmail(
      admin,
      event.organisation_id as string,
    )
    if (!recipient) return { status: 'skipped', reason: 'no_recipient' }

    const { subject, html, text } = buildEventPublishedEmail({
      eventTitle: (event.title as string) ?? 'Your event',
      eventSlug: (event.slug as string | null) ?? null,
    })

    await sendEmail({
      to: recipient.email,
      subject,
      html,
      text,
      messageType: 'organiser_event_published',
      recipientRole: 'organiser',
    })
    return { status: 'sent' }
  } catch (err) {
    captureException(err, {
      where: 'notifications/organiser-event-notify',
      event_id: input.eventId,
    })
    return { status: 'skipped', reason: err instanceof ReadFailed ? 'read_failed' : 'send_failed' }
  }
}

/**
 * The copy. Australian English, no dashes of any kind, no exclamation marks.
 * It carries the public link because the first thing an organiser does when
 * their event goes live is look at it and send it to somebody.
 */
export function buildEventPublishedEmail(facts: {
  eventTitle: string
  eventSlug: string | null
}): { subject: string; html: string; text: string } {
  const origin = getSiteUrl().replace(/\/$/, '')
  const publicUrl = facts.eventSlug ? `${origin}/events/${facts.eventSlug}` : `${origin}/events`

  const subject = `Your event is live: ${facts.eventTitle}`
  const title = 'Your event is live'
  const lines = [
    `${facts.eventTitle} is published and on sale.`,
    'It is now on the discovery feed, and people who follow your scene or your city can be alerted to it.',
    'Share the link below. Every sale is tracked back to where it came from, so you can see what is working.',
  ]
  const cta = { label: 'View your event page', url: publicUrl }

  const text = [title, '', ...lines, '', `${cta.label}: ${cta.url}`].join('\n')

  const html = [
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1628">`,
    `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>`,
    ...lines.map(
      (l) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${escapeHtml(l)}</p>`,
    ),
    `<p style="margin:24px 0"><a href="${publicUrl}" style="background:#0A1628;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${escapeHtml(cta.label)}</a></p>`,
    `</div>`,
  ].join('')

  return { subject, html, text }
}
