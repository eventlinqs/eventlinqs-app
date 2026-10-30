import { CADENCE_DAYS, CADENCE_STEPS, type ContactChannel } from './crm'

/**
 * LAWAL's DAILY OUTREACH QUEUE (the PROJECT MANAGER's 00:42 and 05:05, 31 October 2026). Every message he sends by hand
 * is a held touch in the CRM (outreach_touches, state held); this module decides which of them he sees today and where
 * each one opens. One press of sent is crm.ts markSent, and the database judges it (outreach_touch_is_lawful). Pure.
 */

export const QUEUE_CHANNELS = ['instagram', 'facebook', 'website_form', 'email'] as const satisfies readonly ContactChannel[]

/**
 * The most he sends on each channel in one Melbourne day. EventLinqs' own choice, UNSOURCED: Meta publishes no limit for
 * messages to accounts or Pages, and these sit well under anything reported as a spam trigger. The reasons, channel by
 * channel, are in C:\dev\EVIDENCE\OUTREACH-31OCT\OUTREACH-QUEUE-31OCT.md ("How many a day, per channel, and why").
 */
export const QUEUE_CAPS: Readonly<Record<ContactChannel, number>> = {
  instagram: 10,
  facebook: 10,
  website_form: 15,
  email: 10,
}

export const CHANNEL_WORDS: Readonly<Record<ContactChannel, string>> = {
  instagram: 'Instagram message',
  facebook: 'Facebook message to their Page',
  website_form: 'Website contact form',
  email: 'Email',
}

export interface QueueTouch {
  readonly touchId: string
  /** The cadence step; null for a reply or a relationship message. */
  readonly step: number | null
  readonly purpose: string
  /** Why the draft cannot go yet (outreach_touches.held_because); empty when nothing holds it. */
  readonly heldBecause: readonly string[]
  /** Why the database will not let this contact be written to now (outreach_contact_refusal): a stop, an unsubscribe,
   *  a no, a lapsed basis. Null when it may. Suppression is the database's, never decided here. */
  readonly refusal: string | null
  readonly subject: string | null
  readonly body: string
  readonly trackedLink: string | null
  readonly draftedAt: string
  readonly channel: ContactChannel
  readonly address: string
  readonly organiserName: string
}

export interface QueueChannel {
  readonly channel: ContactChannel
  readonly cap: number
  readonly sentToday: number
  readonly left: number
  /** Oldest drafts first, never more than is left of the channel's day. */
  readonly today: readonly QueueTouch[]
  /** Held beyond today's cap: they wait for another day. */
  readonly waiting: number
}

export function buildDailyQueue(held: readonly QueueTouch[], sentToday: Partial<Record<ContactChannel, number>>): QueueChannel[] {
  return QUEUE_CHANNELS.map((channel) => {
    const cap = QUEUE_CAPS[channel]
    const sent = sentToday[channel] ?? 0
    const left = Math.max(0, cap - sent)
    const mine = held.filter((t) => t.channel === channel).sort((a, b) => a.draftedAt.localeCompare(b.draftedAt) || a.touchId.localeCompare(b.touchId))
    return { channel, cap, sentToday: sent, left, today: mine.slice(0, left), waiting: Math.max(0, mine.length - left) }
  })
}

const INSTAGRAM_HANDLE = /^[a-z0-9._]{1,30}$/
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/

/**
 * Where the message is sent, opened in its own app: the account's page on Instagram, the Page on Facebook, the form as
 * published, a new mail for an email. Each address is checked against the shape the CRM stores
 * (organiser_contacts_address_shape) first, so a stored row can never become a link anywhere else; null when it is not.
 */
export function openInApp(channel: ContactChannel, address: string, subject?: string | null): string | null {
  if (channel === 'instagram') return INSTAGRAM_HANDLE.test(address) ? `https://www.instagram.com/${address}/` : null
  if (channel === 'email') return EMAIL.test(address) ? `mailto:${address}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}` : null
  try {
    return new URL(address).protocol === 'https:' ? address : null
  } catch {
    return null
  }
}

/** Why this draft cannot be sent now: the database's refusal of its contact first, the reasons it is held, and an address
 * that will not open safely. */
export function notReady(t: QueueTouch): string[] {
  const why = [...(t.refusal ? [t.refusal] : []), ...t.heldBecause]
  if (openInApp(t.channel, t.address, t.subject) === null) why.push('its address cannot be opened safely')
  return why
}

/** What follows once this message is marked sent, by the cadence the database keeps (crm.ts CADENCE_DAYS). */
export function nextStepWords(step: number | null): string {
  if (step === null) return 'Not part of the cadence: nothing is drafted after it.'
  if (step >= CADENCE_STEPS) return 'The last message: nothing follows it.'
  const gap = (CADENCE_DAYS[step + 1] ?? 0) - (CADENCE_DAYS[step] ?? 0)
  return `Follow up ${step} is drafted ${gap} days after this is sent.`
}

export function stepWords(t: Pick<QueueTouch, 'step' | 'purpose'>): string {
  if (t.purpose === 'reply') return 'Reply'
  if (t.step === null) return 'Relationship message'
  return t.step <= 1 ? 'First message' : `Follow up ${t.step - 1}`
}
