import 'server-only'
import { sendEmail } from '@/lib/email/send'
import type { CampaignerMode } from './config'

/**
 * WHERE A RENDERED CAMPAIGN MESSAGE ACTUALLY GOES.
 *
 * TEST MODE IS A PATH, NOT A FLAG CHECKED SOMEWHERE. The dispatcher asks for a
 * transport once and then talks to whatever it was given. There is no branch
 * inside the send loop that somebody can add a fifth copy of and get wrong: in
 * test mode the ONLY object the dispatcher holds refuses every address outside
 * the test domain, so a real person cannot be reached because there is nothing
 * in the process that could reach one.
 *
 * THE REFUSAL IS THE TEST. GA4 asks for the domain assertion to be proven by
 * pointing one recipient at a non test address and confirming the refusal, so
 * it throws a typed error rather than returning a flag somebody can ignore.
 *
 * `hold` HANDS BACK NO TRANSPORT AT ALL. The dispatcher writes every send row,
 * renders every message, and has nothing to deliver with. That is the reversal
 * condition: every row intact, every message previewable, nothing sent.
 */

export class SinkRefusal extends Error {
  readonly destination: string
  readonly testDomain: string
  constructor(destination: string, testDomain: string) {
    super(
      `refusing to deliver to ${destination}: the campaigner is in test mode and only reaches the ${testDomain} domain. A real person cannot be contacted from here.`,
    )
    this.name = 'SinkRefusal'
    this.destination = destination
    this.testDomain = testDomain
  }
}

export interface CampaignPayload {
  channelCode: string
  destination: string
  subject: string
  body: string
  html: string
  /**
   * The RFC 8058 one-click unsubscribe pair for this recipient, composed by
   * src/lib/consent/one-click.ts. It travels on the PAYLOAD rather than being
   * added inside the live transport for two reasons: the recorded sink can then
   * be read back by a drive to prove a conforming message was composed without
   * sending one, and the dispatcher is the only place that holds the token, so
   * the transport cannot compose it even if it wanted to.
   */
  headers: Record<string, string>
}

export interface CampaignTransport {
  readonly kind: 'recorded' | 'live'
  deliver(payload: CampaignPayload): Promise<{ providerMessageId: string }>
}

/** Everything the recorded sink was handed, in order, for a drive to read back. */
const recorded: CampaignPayload[] = []

export function recordedPayloads(): readonly CampaignPayload[] {
  return recorded
}

export function clearRecordedPayloads(): void {
  recorded.length = 0
}

function belongsToTestDomain(destination: string, testDomain: string): boolean {
  const value = destination.trim().toLowerCase()
  const domain = testDomain.trim().toLowerCase()
  if (!value || !domain) return false
  // An address, not a phone number: the SMS channel has no live transport yet
  // and its test destinations are written as addresses on the same domain so
  // one rule covers both. See BUILD-LOG-B.md, GA4 step 1.
  return value.endsWith(`@${domain}`) || value.endsWith(`.${domain}`)
}

export function recordedSink(testDomain: string): CampaignTransport {
  return {
    kind: 'recorded',
    async deliver(payload) {
      if (!belongsToTestDomain(payload.destination, testDomain)) {
        throw new SinkRefusal(payload.destination, testDomain)
      }
      recorded.push(payload)
      // A recorded id that says what it is, so nothing downstream mistakes a
      // test delivery for a provider receipt.
      return { providerMessageId: `recorded-${recorded.length}-${Date.now()}` }
    },
  }
}

export function liveTransport(): CampaignTransport {
  return {
    kind: 'live',
    async deliver(payload) {
      if (payload.channelCode === 'sms') {
        /*
         * THERE IS NO SMS PROVIDER ON THIS PLATFORM. A search of the tree finds
         * no client for one, so rather than pretend, the live transport refuses
         * the channel by name. The SMS path is fully built up to this line and
         * is driven end to end through the recorded sink; the day a provider is
         * chosen this is the one function that changes.
         */
        throw new Error(
          'no SMS provider is configured on this platform, so an SMS cannot be delivered live. The message is rendered, stored and recorded; only the delivery is missing.',
        )
      }
      const result = await sendEmail({
        to: payload.destination,
        subject: payload.subject,
        messageType: 'campaign_send',
        recipientRole: 'prospect',
        html: payload.html,
        text: payload.body,
        headers: payload.headers,
      })
      return { providerMessageId: result.id }
    },
  }
}

export function transportForMode(mode: CampaignerMode, testDomain: string): CampaignTransport | null {
  if (mode === 'hold') return null
  if (mode === 'test') return recordedSink(testDomain)
  return liveTransport()
}
