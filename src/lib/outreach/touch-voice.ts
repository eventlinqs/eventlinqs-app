import type { ContactChannel } from './crm'
import { readVoicePolicy, type VoiceCategory, type VoiceConsent, type VoiceMessage } from './voice-gate'

/**
 * A held touch as the communication gateway reads a message (voice-gate.ts): its channel, its category from purpose and
 * step, the address only for an email, the verified name its greeting must carry (the person named on their page, else
 * '<organiser> team', as every first message is written), and for a follow up the thread it continues (the first
 * message's id). Shared by the daily queue (what Lawal sees and approves) and the Sent press (what is checked again), so
 * the two can never judge different words. Pure.
 */

export interface TouchForVoice {
  readonly channel: ContactChannel
  readonly address: string
  readonly personName: string | null
  readonly organiserName: string | null
  readonly purpose: string
  readonly step: number | null
  readonly subject: string | null
  readonly body: string
  readonly firstTouchId: string | null
  /**
   * THE ROW'S OWN FACTS THE GATE READS (train AK, 20 November 2026: production's board showed all seven of the day's
   * cleared first letters 'Not ready' for an offer subject, a consent basis and a timing rule, though their rows held
   * subtype ACQ-FIRST, the basis, its page and the page check; the reader never passed them). The communication subtype
   * (law 24), and the contact's consent basis as recorded.
   */
  readonly subtype?: string | null
  readonly consent?: VoiceConsent | null
}

export function voiceCategoryOf(purpose: string, step: number | null): VoiceCategory {
  if (purpose === 'reply') return 'reply'
  if (purpose !== 'cadence' || step === null) return 'service'
  return step <= 1 ? 'first_contact' : 'follow_up'
}

/**
 * Where a message by hand goes from: Lawal sends every one himself. An email goes from his own mailbox, the one his
 * first round of 10 and 11 October went from, read from the voice file into the generated policy (founderMailbox),
 * never written here (one-contact-domain); the gateway's thread rule then refuses any contact whose conversation runs
 * on another mailbox. A direct message or a form goes from his own account.
 */
const fromFor = (channel: ContactChannel): string =>
  channel === 'email'
    ? readVoicePolicy().founderMailbox
    : { instagram: "instagram: Lawal's own account", facebook: "facebook: Lawal's own profile", website_form: 'website form, as Lawal Adams' }[channel]

export function touchVoiceMessage(t: TouchForVoice): VoiceMessage {
  const category = voiceCategoryOf(t.purpose, t.step)
  // The greeting is the first name, as every template writes it ("Hi {first},", the voice file; facts.ts 'first name'):
  // the contact row may hold a whole name, and a draft saying "Hi Fred," was refused for not saying "Hi Fred Alale,".
  const person = (t.personName ?? '').trim().split(/\s+/)[0] ?? ''
  const organiser = (t.organiserName ?? '').trim()
  return {
    channel: t.channel,
    category,
    from: fromFor(t.channel),
    to: t.channel === 'email' ? [t.address] : [],
    subject: t.subject,
    greetingName: person || (organiser ? `${organiser} team` : null),
    body: t.body,
    threadRef: category === 'follow_up' || category === 'reply' ? t.firstTouchId : null,
    ...(t.subtype ? { subtype: t.subtype } : {}),
    ...(t.consent ? { consent: t.consent } : {}),
  }
}

/** The contact's consent as the gate reads it, from its row (organiser_contacts basis, page and page check). Pure. */
export function consentOf(c: { basis?: string | null; published_on_url?: string | null; no_marketing_statement_checked?: boolean | null }): VoiceConsent | null {
  if (!c.basis || c.basis === 'none') return null
  return { basis: c.basis, publishedOnUrl: c.published_on_url ?? null, noMarketingStatementChecked: c.no_marketing_statement_checked === true }
}
