import { escapeHtml } from '@/lib/email/escape'
import {
  LIST_UNSUBSCRIBE_HEADER,
  LIST_UNSUBSCRIBE_POST_HEADER,
  LIST_UNSUBSCRIBE_POST_VALUE,
} from '@/lib/consent/one-click'
import { FREE_ENTRY_NO_TICKET_NEEDED } from '@/lib/events/entry-mode'
import { dayHours, type GuideDay } from './guide'
import { dayLabels } from './page-copy'
import type { ReminderKind } from './reminder-sends'

/**
 * THE TWO REMIND ME EMAILS (WI1). Plain, short, and each one says why it came
 * and how to stop it, because the person asked for exactly these and nothing
 * else ("We send the full timetable when ... releases it, and one reminder the
 * day before. Nothing else.").
 *
 * THE STOP. A link in the body to a page that stops with one press and no login,
 * and the RFC 8058 one-click headers the platform's other mail already carries,
 * pointed at a route that stops on POST. ACMA: an unsubscribe must keep working
 * and "cannot require extra personal information"
 * (https://www.acma.gov.au/avoid-sending-spam, as recorded in migration
 * 20261003000010). The row stops at once, not within five working days.
 */

export const REMIND_STOP_PAGE = '/remind/stop'
export const REMIND_STOP_ROUTE = '/api/remind/stop'

export type ReminderEmailFacts = {
  kind: ReminderKind
  origin: string
  token: string
  event: {
    title: string
    slug: string
    venueName: string | null
    venueCity: string | null
    directionsUrl: string | null
  }
  organiserName: string
  days: GuideDay[]
}

const NL = String.fromCharCode(10)

function hoursLine(day: GuideDay): string {
  const h = dayHours(day)
  const opening = h.opens ?? h.unconfirmed ?? ''
  // No finish given (WI2 answer 1): "from" the opening, never a made up end.
  return h.closes === null
    ? `${dayLabels(day.date).long}, from ${opening}`
    : `${dayLabels(day.date).long}, ${opening} to ${h.closes}`
}

export function buildReminderEmail(facts: ReminderEmailFacts): {
  subject: string
  html: string
  text: string
  headers: Record<string, string>
} {
  const eventUrl = `${facts.origin}/events/${facts.event.slug}`
  const stopUrl = `${facts.origin}${REMIND_STOP_PAGE}/${facts.token}`
  const oneClickUrl = `${facts.origin}${REMIND_STOP_ROUTE}/${facts.token}`
  const where = [facts.event.venueName, facts.event.venueCity].filter(Boolean).join(', ')

  const isProgram = facts.kind === 'program'
  const subject = isProgram ? `The full program for ${facts.event.title} is out` : `Tomorrow: ${facts.event.title}`
  const lead = isProgram
    ? `${facts.organiserName} has published the full program for ${facts.event.title}.`
    : `${facts.event.title} is on tomorrow${where ? ` at ${where}` : ''}.`
  const why = isProgram
    ? 'You asked EventLinqs for the program when it landed. This is that one message, and the only other will be a reminder the day before.'
    : 'You asked EventLinqs for one reminder the day before. This is it, and nothing else will follow.'

  const days = isProgram ? facts.days : facts.days.slice(0, 1)
  const dayBlocks = days.map((d) => ({
    hours: hoursLine(d),
    items: isProgram ? d.items.map((i) => `${i.when}: ${i.what}`) : [],
    closer: isProgram && d.closer ? `Closing the night: ${d.closer.name}` : null,
  }))

  const text = [
    lead,
    '',
    FREE_ENTRY_NO_TICKET_NEEDED + '.',
    ...dayBlocks.flatMap((b) => ['', b.hours, ...b.items, ...(b.closer ? [b.closer] : [])]),
    '',
    `The event: ${eventUrl}`,
    ...(facts.event.directionsUrl ? [`Get directions: ${facts.event.directionsUrl}`] : []),
    '',
    why,
    `Stop these reminders: ${stopUrl}`,
  ].join(NL)

  const dayHtml = dayBlocks
    .map(
      (b) => `<div style="border-top:1px solid #EFEDE8;padding:12px 0;">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0A1628;">${escapeHtml(b.hours)}</p>
      ${b.items.map((i) => `<p style="margin:0 0 2px;font-size:14px;color:#1A1A1A;">${escapeHtml(i)}</p>`).join('')}
      ${b.closer ? `<p style="margin:6px 0 0;font-size:14px;font-weight:700;color:#0A1628;">${escapeHtml(b.closer)}</p>` : ''}
    </div>`,
    )
    .join('')

  const html = `<!DOCTYPE html>
<html lang="en-AU"><body style="margin:0;background:#FAFAF7;">
  <div style="font-family:Manrope,Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#FFFFFF;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6F5409;font-weight:700;">EventLinqs</p>
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0A1628;">${escapeHtml(subject)}</h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#1A1A1A;">${escapeHtml(lead)}</p>
    <p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#6F5409;">${escapeHtml(FREE_ENTRY_NO_TICKET_NEEDED)}</p>
    ${dayHtml}
    <p style="margin:20px 0 8px;">
      <a href="${escapeHtml(eventUrl)}" style="display:inline-block;background:#0A1628;color:#FFFFFF;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;">See the event</a>
    </p>
    ${
      facts.event.directionsUrl
        ? `<p style="margin:0 0 24px;font-size:14px;"><a href="${escapeHtml(facts.event.directionsUrl)}" style="color:#0A1628;font-weight:700;">Get directions</a></p>`
        : ''
    }
    <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#4A4A4A;">${escapeHtml(why)}</p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#4A4A4A;">
      <a href="${escapeHtml(stopUrl)}" style="color:#4A4A4A;">Stop these reminders</a>
    </p>
  </div>
</body></html>`

  return {
    subject,
    html,
    text,
    headers: {
      [LIST_UNSUBSCRIBE_HEADER]: `<${oneClickUrl}>`,
      [LIST_UNSUBSCRIBE_POST_HEADER]: LIST_UNSUBSCRIBE_POST_VALUE,
    },
  }
}
