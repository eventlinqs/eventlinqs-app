import 'server-only'
import { resolveFrom, sendEmail } from '@/lib/email/send'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { readVoicePolicy, voiceProblems } from '@/lib/outreach/voice-gate'
import { liveNoticeMessage, type LiveNoticeFacts } from './organiser-live-notice-words'

/**
 * THE ORGANISER'S OWN "YOUR EVENT IS LIVE" EMAIL (the PM's ruling of 8 November 2026, 15:00, item 3): sent by the system
 * the moment a self-listed event is live, in Lawal's own format (the three drafts of that day in
 * C:\dev\START-16OCT\EL-LIVE-NOTICES-8NOV.md), and only through the gateway's checks, ported line for line in
 * src/lib/outreach/voice-gate.ts. Behind organiser_live_email, OFF until Lawal says yes. The answer is words for Lawal's
 * own alert: sent, or why not.
 */
export async function sendOrganiserLiveNotice(facts: LiveNoticeFacts): Promise<string> {
  if (!(await isFeatureEnabled('organiser_live_email'))) return 'not sent: the organiser_live_email switch is OFF until Lawal says yes'
  const msg = liveNoticeMessage(facts, resolveFrom())
  const problems = voiceProblems(msg, readVoicePolicy())
  if (problems.length) return `not sent, held by the gateway's checks: ${problems.join('; ')}`
  try {
    await sendEmail({
      to: facts.to,
      subject: msg.subject ?? `${facts.title} is live on EventLinqs`,
      text: msg.body,
      html: `<p>${msg.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`,
      messageType: 'organiser_live_notice',
      recipientRole: 'organiser',
    })
    return 'sent'
  } catch (err) {
    console.error('[organiser-live-notice] the organiser could not be told:', err instanceof Error ? err.message : String(err))
    return `not sent: the mailer refused (${err instanceof Error ? err.message : String(err)})`
  }
}
