/**
 * EVERY EMAIL TO A PERSON IS A LETTER: IT GREETS THEM AND IT SIGNS OFF (the CONTROLLER's 08:58 gap 3, 31 October
 * 2026; communication law 3: "a human greeting on the first line, always").
 *
 * Every customer- and organiser-facing email the platform sends opens 'Hi <first name>,' ('Hi there,' when no name
 * is held) and closes 'Kind regards,' then 'The EventLinqs team'. The inventory of 31 October found 25 senders and
 * none closed that way; five greeted. The words live here once, and every sender takes them from here.
 *
 * WHO IS A PERSON is read from the recipient matrix's roles (src/lib/notifications/recipient-matrix.ts): the buyer,
 * the ticket holder, the account holder, the organiser and the prospect. EventLinqs' own inboxes (the platform owner
 * and support) receive operational alerts, which are not letters.
 *
 * THE CHECK, letterProblems, reads the message the way a person does: the visible lines, in order, with the hidden
 * preheader and the head left out. The first line (after a letterhead wordmark, which is the logo) is the greeting; 'Kind regards,' is followed at once by 'The
 * EventLinqs team'. It judges the plain-text part the same way. tests/unit/email/every-letter-greets.test.ts renders
 * every template with fixture data through it, and scripts/guards/every-letter-greets.mjs fails the build when a
 * file that sends to a person is missing from that test.
 *
 * A leaf, apart from the escape helper: the transports, the templates and the test read one copy.
 */
import { escapeHtml } from './escape'

/** The matrix roles that are people, not EventLinqs' own inboxes. */
export const LETTER_ROLES = ['buyer', 'ticket_holder', 'account_holder', 'organiser', 'prospect'] as const

export function isLetterRole(role: string): boolean {
  return (LETTER_ROLES as readonly string[]).includes(role)
}

export const SIGN_OFF = 'Kind regards,'
export const SIGNATURE = 'The EventLinqs team'

/**
 * The first name, from whatever name a sender holds: 'Amara Okafor' gives 'Amara'. An address, a blank, or a name
 * that is only punctuation gives null, so the letter says 'Hi there,' rather than 'Hi amara@example.com,'.
 */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = String(name ?? '').trim().split(/\s+/)[0] ?? ''
  if (!first || first.includes('@') || !/\p{L}/u.test(first)) return null
  return first.replace(/,+$/, '').slice(0, 40)
}

/** 'Hi Amara,' or 'Hi there,'. Pass the first name, or a full name through firstNameOf. */
export function greetingLine(firstName: string | null | undefined): string {
  const first = firstNameOf(firstName)
  return first ? `Hi ${first},` : 'Hi there,'
}

const GREETING_STYLE = 'margin:0 0 16px;font-size:16px;line-height:1.5;color:#0A1628'
const SIGN_OFF_STYLE = 'margin:24px 0 0;font-size:16px;line-height:1.5;color:#0A1628'

/**
 * The greeting as the email's first paragraph. A template whose paragraphs each carry their own font passes its own
 * paragraph style, so the greeting reads in the letter's type rather than the client's default.
 */
export function greetingHtml(firstName: string | null | undefined, style: string = GREETING_STYLE): string {
  return `<p style="${style}">${escapeHtml(greetingLine(firstName))}</p>`
}

/** The sign off, as the last paragraph of the letter, above any footer. */
export function signOffHtml(style: string = SIGN_OFF_STYLE): string {
  return `<p style="${style}">${SIGN_OFF}<br>${SIGNATURE}</p>`
}

/** The plain-text forms: the greeting with a blank line after it, and the sign off with one before it. */
export function greetingText(firstName: string | null | undefined): string {
  return `${greetingLine(firstName)}\n\n`
}

export function signOffText(): string {
  return `\n\n${SIGN_OFF}\n${SIGNATURE}`
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }

/** The lines a person reads, in order: the head, styles, scripts and hidden preheaders left out. */
export function visibleLines(html: string): string[] {
  const body = html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<(style|script|title)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(div|span|p|td)\b[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|th|h[1-6]|li|table|ul|ol|a)>/gi, (m) => (m.toLowerCase() === '</a>' ? m : `${m}\n`))
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
  return body
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const GREETING = /^Hi (there|[^\s,][^,]{0,40}),$/

/** A letterhead wordmark ('EventLinqs', 'EVENTLINQS.') is the logo, not a line of the message. */
const WORDMARK = /^eventlinqs\.?$/i

function judgeLines(all: string[], part: string): string[] {
  const problems: string[] = []
  const lines = WORDMARK.test(all[0] ?? '') ? all.slice(1) : all
  if (!GREETING.test(lines[0] ?? '')) {
    problems.push(`${part}: the first line is '${(lines[0] ?? '').slice(0, 60)}', not 'Hi <first name>,' or 'Hi there,'`)
  }
  const at = lines.indexOf(SIGN_OFF)
  if (at < 0 || lines[at + 1] !== SIGNATURE) {
    problems.push(`${part}: no '${SIGN_OFF}' followed by '${SIGNATURE}'`)
  }
  return problems
}

/** Every way a letter fails the rule, empty when it greets and signs off in both parts. */
export function letterProblems(message: { html?: string | null; text?: string | null }): string[] {
  const problems: string[] = []
  if (message.html) problems.push(...judgeLines(visibleLines(message.html), 'html'))
  if (message.text) {
    problems.push(...judgeLines(message.text.split('\n').map((l) => l.trim()).filter(Boolean), 'text'))
  }
  if (!message.html && !message.text) problems.push('the message has no body')
  return problems
}
