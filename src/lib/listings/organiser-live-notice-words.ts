import type { VoiceMessage } from '@/lib/outreach/voice-gate'

/**
 * The words of the organiser's own "your event is live" email, in Lawal's format (the three drafts he was given on
 * 8 November 2026, C:\dev\START-16OCT\EL-LIVE-NOTICES-8NOV.md): "Hi <their own first name>," alone; a warm second line
 * that thanks them; the event, its date and place, and its link; one line about them; "Kind regards," and the reply
 * signature. A service message, so it signs as a reply does, with no ABN block. Pure: the gateway's checks
 * (src/lib/outreach/voice-gate.ts) judge it before any send.
 */
export type LiveNoticeFacts = {
  /** The address the organiser sent the event from. */
  readonly to: string
  /** The name the organiser gave on the form. */
  readonly name: string
  readonly title: string
  /** The start where it happens, e.g. "Saturday 5 December at 6:30 pm". */
  readonly when: string
  readonly venue: string
  /** The event's own page on EventLinqs. */
  readonly link: string
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}

export function liveNoticeMessage(facts: LiveNoticeFacts, from: string): VoiceMessage {
  const first = firstName(facts.name)
  return {
    channel: 'email',
    category: 'service',
    from,
    to: [facts.to],
    subject: `${facts.title} is live on EventLinqs`,
    greetingName: first,
    body: [
      `Hi ${first},`,
      '',
      `Thank you for sending us ${facts.title}. It is live on EventLinqs now, for ${facts.when}, at ${facts.venue}, with its own page and a button straight to your booking page:`,
      facts.link,
      '',
      `It is a pleasure to have it on EventLinqs, and I'd love as many people as possible to find it.`,
      '',
      'Kind regards,',
      'Lawal Adams',
      'Founder, EventLinqs',
    ].join('\n'),
  }
}
