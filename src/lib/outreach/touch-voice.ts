import type { ContactChannel } from './crm'
import type { VoiceCategory, VoiceMessage } from './voice-gate'

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
}

export function voiceCategoryOf(purpose: string, step: number | null): VoiceCategory {
  if (purpose === 'reply') return 'reply'
  if (purpose !== 'cadence' || step === null) return 'service'
  return step <= 1 ? 'first_contact' : 'follow_up'
}

/**
 * Where a message by hand goes from: Lawal sends every one himself. An email goes from his own mailbox, the one his
 * first round of 10 and 11 October went from (the voice file is read from it); the gateway's thread rule then refuses
 * any contact whose conversation runs on another mailbox. A direct message or a form goes from his own account.
 */
export const LAWAL_MAILBOX = 'lawal@eventlinqs.com'
const FROM: Record<ContactChannel, string> = {
  email: LAWAL_MAILBOX,
  instagram: "instagram: Lawal's own account",
  facebook: "facebook: Lawal's own profile",
  website_form: 'website form, as Lawal Adams',
}

export function touchVoiceMessage(t: TouchForVoice): VoiceMessage {
  const category = voiceCategoryOf(t.purpose, t.step)
  const person = (t.personName ?? '').trim()
  const organiser = (t.organiserName ?? '').trim()
  return {
    channel: t.channel,
    category,
    from: FROM[t.channel],
    to: t.channel === 'email' ? [t.address] : [],
    subject: t.subject,
    greetingName: person || (organiser ? `${organiser} team` : null),
    body: t.body,
    threadRef: category === 'follow_up' || category === 'reply' ? t.firstTouchId : null,
  }
}
