/**
 * ONE ORGANISER EMAIL AS A MIME MESSAGE, FOR GRAPH's sendMail (window 6, 28 October 2026).
 *
 * WHY MIME AND NOT GRAPH's JSON. Graph's JSON send takes custom headers only as internetMessageHeaders, and its own
 * example names only x- headers; the MIME form takes "the applicable Internet message headers and the MIME content, all
 * encoded in base64" (https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0, read 28 October
 * 2026). These emails need four standard headers the JSON form cannot be relied on to carry:
 *
 *   List-Unsubscribe and List-Unsubscribe-Post   RFC 8058 one-click (https://www.rfc-editor.org/rfc/rfc8058.html), the
 *                                                 names and value from src/lib/consent/one-click.ts, pointing at
 *                                                 /api/outreach/one-click-unsubscribe/<the contact's token>;
 *   Message-ID                                   our own, kept on the row, so a reply names the message it answers;
 *   In-Reply-To and References                   so messages 3 and 4 and every answer sit in the organiser's own thread.
 *
 * UNPROVEN UNTIL A TEST-MODE SEND TO OUR OWN ADDRESS, said plainly: that Exchange Online keeps the Message-ID we set
 * and the two List-Unsubscribe headers, and that its DKIM signature covers them. The first test send is read back from
 * the recipient side before the sender leaves test mode.
 *
 * Plain text only: these are one to one notes from Lawal, and a text body reads as one.
 * PURE: no network, no database.
 */
import { randomUUID } from 'node:crypto'
import { LIST_UNSUBSCRIBE_HEADER, LIST_UNSUBSCRIBE_POST_HEADER, LIST_UNSUBSCRIBE_POST_VALUE } from '@/lib/consent/one-click'

/** The route the List-Unsubscribe header points at (src/app/api/outreach/one-click-unsubscribe/[token]/route.ts). */
export const OUTREACH_ONE_CLICK_ROUTE = '/api/outreach/one-click-unsubscribe'

export type OutreachMime = {
  fromAddress: string
  fromName: string
  to: string
  subject: string
  text: string
  messageId: string
  inReplyTo?: string | null
  references?: string[]
  date: Date
  /** The site origin and the contact's token, for the one-click header pair. */
  origin: string
  unsubscribeToken: string
}

/** A Message-ID at our own domain: angle brackets included, as the header and the row carry it. */
export function newMessageId(domain = 'eventlinqs.com'): string {
  return `<${randomUUID()}@${domain}>`
}

/** The one-click URL for a contact. Only https, as RFC 8058 requires. */
export function outreachOneClickUrl(origin: string, token: string): string {
  const base = origin.replace(/\/+$/, '')
  if (!/^https:\/\//.test(base)) throw new Error(`one-click unsubscribe needs an https origin, not ${base}`)
  return `${base}${OUTREACH_ONE_CLICK_ROUTE}/${encodeURIComponent(token)}`
}

/** RFC 2047 encoded-word for a header value that is not plain ASCII. */
export function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, (line) => `${line}\r\n`).trimEnd()
}

/** A header value never carries a line break: a value with one is refused, never folded or passed. */
function header(name: string, value: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`header ${name} carries a line break`)
  return `${name}: ${value}`
}

export function buildOutreachMime(m: OutreachMime): string {
  if (!/^<[^<>\s@]+@[^<>\s@]+>$/.test(m.messageId)) throw new Error(`not a Message-ID: ${m.messageId}`)
  // Checked before encoding: an encoded word would hide the break, and a value with one is malformed whatever we do with it.
  for (const [name, value] of [['Subject', m.subject], ['From', m.fromName], ['To', m.to]] as const) {
    if (/[\r\n]/.test(value)) throw new Error(`header ${name} carries a line break`)
  }
  const lines = [
    header('From', `${encodeHeaderValue(m.fromName)} <${m.fromAddress}>`),
    header('To', `<${m.to}>`),
    header('Subject', encodeHeaderValue(m.subject)),
    header('Date', m.date.toUTCString().replace('GMT', '+0000')),
    header('Message-ID', m.messageId),
  ]
  if (m.inReplyTo) lines.push(header('In-Reply-To', m.inReplyTo))
  const refs = [...new Set([...(m.references ?? []), ...(m.inReplyTo ? [m.inReplyTo] : [])])]
  if (refs.length > 0) lines.push(header('References', refs.join(' ')))
  lines.push(
    header(LIST_UNSUBSCRIBE_HEADER, `<${outreachOneClickUrl(m.origin, m.unsubscribeToken)}>`),
    header(LIST_UNSUBSCRIBE_POST_HEADER, LIST_UNSUBSCRIBE_POST_VALUE),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  )
  const body = wrap76(Buffer.from(m.text.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64'))
  return `${lines.join('\r\n')}\r\n\r\n${body}\r\n`
}

/** What Graph's MIME send takes as its request body. */
export function mimeForGraph(mime: string): string {
  return Buffer.from(mime, 'utf8').toString('base64')
}
