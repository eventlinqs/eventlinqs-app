import { escapeHtml } from '@/lib/email/escape'

/**
 * RENDERING A CAMPAIGN MESSAGE, AND REFUSING TO RENDER ONE THAT WOULD BE ILLEGAL.
 *
 * PURE. The template, the values, the sender identity and the unsubscribe link
 * are all handed in, so every refusal is testable without a database.
 *
 * TWO THINGS EVERY MESSAGE MUST CARRY, and neither is optional or defaulted:
 *
 *   THE SENDER IDENTITY. The Spam Act requires a commercial message to identify
 *   its sender and say how to reach them. 2,598 messages missing their
 *   obligations cost TAB over 4 million dollars in June 2025.
 *
 *   A WORKING UNSUBSCRIBE. The same matter, and the same reason. The link is
 *   built from the token GA1 already mints, which resolves without a login,
 *   because a right you have to create an account to exercise is not a right
 *   anybody exercises.
 *
 * A message missing either RAISES A NAMED ERROR rather than rendering without
 * it. Rendering a message that cannot be sent, and finding out at the transport,
 * is how one gets sent by a code path that forgot to check.
 *
 * THE ORGANISER'S WORDS ARE PLACED VERBATIM. The opening line and the signature
 * are theirs, and the template composes around them. Nothing here writes prose
 * in an organiser's name.
 */

export const RENDER_FAILURE = {
  SENDER_IDENTITY_MISSING: 'sender_identity_missing',
  SENDER_IDENTITY_UNVERIFIED: 'sender_identity_unverified',
  UNSUBSCRIBE_MISSING: 'unsubscribe_link_missing',
  PLACEHOLDER_UNFILLED: 'template_placeholder_had_no_value',
} as const

export type RenderFailure = (typeof RENDER_FAILURE)[keyof typeof RENDER_FAILURE]

export const RENDER_FAILURE_SENTENCE: Record<RenderFailure, string> = {
  [RENDER_FAILURE.SENDER_IDENTITY_MISSING]:
    'This campaign has no sender identity, so no message can say who it is from and none is rendered.',
  [RENDER_FAILURE.SENDER_IDENTITY_UNVERIFIED]:
    'This sender identity has not been verified, so no message is rendered from it.',
  [RENDER_FAILURE.UNSUBSCRIBE_MISSING]:
    'No unsubscribe link was supplied, so no message is rendered: a commercial message without one cannot lawfully be sent.',
  [RENDER_FAILURE.PLACEHOLDER_UNFILLED]:
    'The template names a placeholder that nothing filled, so the message would have gone out with a gap in it.',
}

export class CampaignRenderError extends Error {
  readonly reason: RenderFailure
  readonly detail: string
  constructor(reason: RenderFailure, detail = '') {
    super(detail ? `${RENDER_FAILURE_SENTENCE[reason]} ${detail}` : RENDER_FAILURE_SENTENCE[reason])
    this.name = 'CampaignRenderError'
    this.reason = reason
    this.detail = detail
  }
}

export interface CampaignTemplate {
  key: string
  channelCode: string
  subjectTemplate: string
  bodyTemplate: string
}

export interface SenderIdentity {
  fromName: string
  replyTo: string
  identityLine: string
  isVerified: boolean
}

export interface RenderedMessage {
  subject: string
  /** What a person reads. Plain text for both channels; the email also gets html. */
  body: string
  html: string
  /** The exact destination this was rendered for, echoed so a caller cannot mix two up. */
  destination: string
}

const PLACEHOLDER = /\{\{([a-z_]+)\}\}/g

function fill(template: string, values: Record<string, string>, where: string): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = values[name]
    if (value === undefined || value === null || String(value).trim().length === 0) {
      throw new CampaignRenderError(RENDER_FAILURE.PLACEHOLDER_UNFILLED, `${where} needs ${name}.`)
    }
    return String(value)
  })
}

/**
 * The instruction an SMS must carry so a person can stop it. Plain words, no
 * link, because a link in an SMS is the thing every scam message also has.
 */
export function smsOptOutInstruction(): string {
  return 'Reply STOP to hear no more from us.'
}

export function renderCampaignMessage(input: {
  template: CampaignTemplate
  values: Record<string, string>
  senderIdentity: SenderIdentity | null
  unsubscribeUrl: string | null
  destination: string
}): RenderedMessage {
  const { template, senderIdentity } = input

  if (!senderIdentity) throw new CampaignRenderError(RENDER_FAILURE.SENDER_IDENTITY_MISSING)
  if (!senderIdentity.isVerified) {
    throw new CampaignRenderError(RENDER_FAILURE.SENDER_IDENTITY_UNVERIFIED, senderIdentity.fromName)
  }

  const isSms = template.channelCode === 'sms'

  /*
   * THE SMS CARRIES AN INSTRUCTION, THE EMAIL CARRIES A LINK, and both are
   * required. An SMS with a URL nobody can read on a locked screen is not an
   * opt out; an email with "reply STOP" to a no-reply address is not one either.
   */
  if (!isSms && (!input.unsubscribeUrl || input.unsubscribeUrl.trim().length === 0)) {
    throw new CampaignRenderError(RENDER_FAILURE.UNSUBSCRIBE_MISSING, template.key)
  }

  const subject = isSms ? '' : fill(template.subjectTemplate, input.values, `the subject of ${template.key}`)
  const core = fill(template.bodyTemplate, input.values, `the body of ${template.key}`)

  if (isSms) {
    const body = `${core}\n${senderIdentity.fromName}. ${smsOptOutInstruction()}`
    return { subject, body, html: '', destination: input.destination }
  }

  const unsubscribeUrl = input.unsubscribeUrl as string
  const body = [
    core,
    '',
    senderIdentity.identityLine,
    `Reply to ${senderIdentity.replyTo}.`,
    '',
    `To stop hearing about events from ${senderIdentity.fromName}, open ${unsubscribeUrl}`,
  ].join('\n')

  const html = [
    '<div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#0A1628;">',
    ...core.split('\n').map(line => (line.trim().length === 0 ? '<p></p>' : `<p>${escapeHtml(line)}</p>`)),
    '<hr style="border:none;border-top:1px solid #E2E8F0;margin:28px 0;" />',
    `<p style="font-size:13px;color:#475569;">${escapeHtml(senderIdentity.identityLine)}<br />`,
    `Reply to <a href="mailto:${escapeHtml(senderIdentity.replyTo)}">${escapeHtml(senderIdentity.replyTo)}</a>.</p>`,
    `<p style="font-size:13px;color:#475569;"><a href="${escapeHtml(unsubscribeUrl)}">Stop hearing about events from ${escapeHtml(senderIdentity.fromName)}</a></p>`,
    '</div>',
  ].join('')

  return { subject, body, html, destination: input.destination }
}

/**
 * The unsubscribe address, built from the path in configuration and the token
 * GA1 already mints. No route is written down here: the path is a row.
 */
export function unsubscribeUrl(origin: string, unsubscribePath: string, token: string): string {
  const base = origin.replace(/\/+$/, '')
  const path = unsubscribePath.startsWith('/') ? unsubscribePath : `/${unsubscribePath}`
  return `${base}${path}/${token}`
}
