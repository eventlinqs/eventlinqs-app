/**
 * THE RULES EVERY ORGANISER MESSAGE PASSES, AND THE FILLING OF A TEMPLATE (window 6, 28 October 2026).
 *
 * The rules are the project manager's, binding, in C:\dev\START-16OCT\EVENTLINQS-ORGANISER-MESSAGES-28OCT.md: "opens
 * Hi [first name], or Hi [venue] team,; one true line from the listing; you/your outnumber we/our; exactly one
 * question; no ROI claims, no promises of sales or reach; email body under 125 words, DM under 60; Lawal's full
 * signature ... and an unsubscribe line on every email; DMs end Lawal, EventLinqs (reply stop and I won't message
 * again); no em or en dashes; no exclamation marks; never I'm Lawal from, never we're new, never rules for the
 * recipient." A draft that fails any is HELD with the rule named (the project manager's 20:10), never sent; the
 * database refuses to queue or send a message whose held_because is not empty (20261028213001).
 *
 * THREE READINGS, where the file's own texts would fail its own rules as written, said here so nobody re-derives them:
 *   1. "Exactly one question" binds the FIRST message of a cadence (messages 1, 1b and 2, each built around one ask).
 *      Messages 3, 4, 5, 7, 8 and 10 carry no question at all, so elsewhere the rule is AT MOST one.
 *   2. "Under 125 words" (60 for a DM) counts the message, not the closing: message 1's own text with Lawal's
 *      five-line signature and the unsubscribe line would pass 125 on its own.
 *   3. "A signature and an unsubscribe line on every email" wins over the shorter "Kind regards, Lawal" closings of
 *      messages 7, 8 and 9: those are commercial messages too (Spam Act ss 17 and 18), and the database refuses an
 *      email with no unsubscribe link.
 *
 * PURE: no database, no network. The template's text comes from its row (outreach_templates), never from here.
 */

import { PLATFORM_ENTITY } from '@/lib/legal/platform-entity'

export type MessageChannel = 'email' | 'dm'
export type MessagePurpose = 'cadence' | 'relationship' | 'reply'

/** Lawal's signature, word for word from the messages file; the name and the ABN read from the one platform entity. */
export const LAWAL_SIGNATURE = [
  PLATFORM_ENTITY.legalName,
  `Founder, ${PLATFORM_ENTITY.tradingName}`,
  'eventlinqs.com.au',
  `ABN ${PLATFORM_ENTITY.abnFormatted}`,
  'Geelong, VIC, Australia',
].join('\n')

/** How every DM ends, word for word. */
export const DM_SIGN_OFF = "Lawal, EventLinqs (reply stop and I won't message again)"

export const EMAIL_CONTENT_MAX_WORDS = 125
export const DM_CONTENT_MAX_WORDS = 60

const YOU_WORDS = new Set(['you', 'your', 'yours', "you're", "you'll", "you'd", "you've", 'yourself', 'yourselves'])
const WE_WORDS = new Set(['we', 'our', 'ours', "we're", "we'll", "we'd", "we've", 'ourselves'])

/** Promises the file forbids: returns, sales, reach. Matched case-insensitively on word boundaries. */
const PROMISES = [
  /\bguarantee(d|s)?\b/i,
  /\bROI\b/,
  /\breturn on (your )?investment\b/i,
  /\b(more|extra|increase(d)?|boost(ed)?|double|grow) (your )?(sales|tickets sold|revenue|bookings|reach|audience)\b/i,
  /\bsell[- ]?out\b/i,
  /\breach (thousands|millions|\d[\d,]* people)\b/i,
]

/** Lines the file names as never. */
const NEVER = [
  { pattern: /\bI'?m Lawal from\b/i, rule: 'never "I\'m Lawal from"' },
  { pattern: /\bwe'?re (a )?new\b/i, rule: 'never "we\'re new"' },
]

/** Rules for the recipient: telling them what they must do. */
const INSTRUCTIONS = [/\byou (must|need to|have to|should)\b/i, /\bplease (ensure|make sure)\b/i, /\bmake sure (you|that)\b/i]

const PLACEHOLDER = /\[([^\]\n]{1,40})\]/g

export type Draft = {
  channel: MessageChannel
  purpose: MessagePurpose
  /** The cadence step, 1 to 3; null outside the cadence. */
  step: number | null
  subject: string | null
  /** The message from the greeting to the last line before the closing. */
  content: string
  /** The closing: "Kind regards," and the signature and unsubscribe line for an email; the sign-off for a DM. */
  closing: string
}

function words(text: string): string[] {
  return text
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '').replace(/\u2019/g, "'").toLowerCase())
    .filter(Boolean)
}

/** Every rule the draft fails, each named in plain words. Empty means it may queue. */
export function ruleFailures(draft: Draft): string[] {
  const failures: string[] = []
  const whole = `${draft.subject ?? ''}\n${draft.content}\n${draft.closing}`

  const unfilled = [...new Set([...whole.matchAll(PLACEHOLDER)].map((m) => m[1]))]
  if (unfilled.length > 0) failures.push(`a field could not be filled from verified facts: ${unfilled.map((f) => `[${f}]`).join(', ')}`)

  if (!/^Hi [^,\n]{1,80},/.test(draft.content)) failures.push('opens "Hi [first name]," or "Hi [venue] team,"')

  const w = words(draft.content)
  const you = w.filter((x) => YOU_WORDS.has(x)).length
  const we = w.filter((x) => WE_WORDS.has(x)).length
  if (we > 0 && you <= we) failures.push(`you and your outnumber we and our: found ${you} to ${we}`)

  const questions = (draft.content.match(/\?/g) ?? []).length
  if (draft.purpose === 'cadence' && draft.step === 1) {
    if (questions !== 1) failures.push(`exactly one question: found ${questions}`)
  } else if (questions > 1) {
    failures.push(`at most one question: found ${questions}`)
  }

  for (const p of PROMISES) if (p.test(whole)) failures.push('no ROI claims and no promises of sales or reach')
  for (const n of NEVER) if (n.pattern.test(whole)) failures.push(n.rule)
  for (const i of INSTRUCTIONS) if (i.test(draft.content)) failures.push('never rules for the recipient')

  const max = draft.channel === 'email' ? EMAIL_CONTENT_MAX_WORDS : DM_CONTENT_MAX_WORDS
  if (w.length >= max) failures.push(`${draft.channel === 'email' ? 'an email' : 'a DM'} is under ${max} words: found ${w.length}`)

  if (draft.channel === 'email') {
    if (!draft.subject || draft.subject.trim().length < 3) failures.push('an email has a subject')
    if (!draft.closing.includes(LAWAL_SIGNATURE)) failures.push("Lawal's full signature on every email")
    if (!draft.closing.includes('https://www.eventlinqs.com.au/unsubscribe/outreach')) failures.push('an unsubscribe line on every email')
  } else if (!draft.closing.trim().endsWith(DM_SIGN_OFF)) {
    failures.push(`DMs end "${DM_SIGN_OFF}"`)
  }

  if (/[\u2013\u2014]/.test(whole)) failures.push('no em or en dashes')
  if (whole.includes('!')) failures.push('no exclamation marks')

  return [...new Set(failures)]
}

/**
 * Fill a template's [fields] from verified facts. A field with no value is left as written, so ruleFailures names it
 * and the draft is held: a message is never sent with a generic stand-in for a fact we do not have.
 */
export function fillTemplate(text: string, fields: Record<string, string | null | undefined>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    const value = fields[name.trim().toLowerCase()]
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : whole
  })
}

/** The unsubscribe line every email ends with. */
export function unsubscribeLine(unsubscribeUrl: string): string {
  return `If you'd rather not hear from me again, unsubscribe here: ${unsubscribeUrl}`
}

/** The email closing: the template's own sign-off line, then the signature, then the unsubscribe line. */
export function emailClosing(signOff: string, unsubscribeUrl: string): string {
  return `${signOff}\n${LAWAL_SIGNATURE}\n\n${unsubscribeLine(unsubscribeUrl)}`
}

/** The whole body as stored and sent: content, a blank line, the closing. */
export function composeBody(draft: Pick<Draft, 'content' | 'closing'>): string {
  return `${draft.content.trim()}\n\n${draft.closing.trim()}`
}

/** Where the closing starts in a template: "Kind regards,", a bare [signature] line, or the DM sign-off. */
export function splitClosing(body: string): { content: string; closing: string } {
  const lines = body.split('\n')
  const at = lines.findIndex((line) => {
    const l = line.trim()
    return /^Kind regards,?$/.test(l) || l === '[signature]' || l === LAWAL_SIGNATURE.split('\n')[0] || l === DM_SIGN_OFF
  })
  if (at < 0) return { content: body.trim(), closing: '' }
  return { content: lines.slice(0, at).join('\n').trim(), closing: lines.slice(at).join('\n').trim() }
}

export type TemplateRow = { channel: MessageChannel; purpose: MessagePurpose; step: number | null; subject: string | null; body: string }

export type Rendered = Draft & { body: string; heldBecause: string[] }

/**
 * A template row filled for one contact: the signature and the unsubscribe line are the platform's, every other field
 * comes from verified facts. heldBecause names every rule the result fails; empty means it may queue.
 */
export function renderTemplate(template: TemplateRow, fields: Record<string, string | null | undefined>, unsubscribeUrl: string | null): Rendered {
  const all: Record<string, string | null | undefined> = {}
  for (const [k, v] of Object.entries(fields)) all[k.trim().toLowerCase()] = v
  all.signature = LAWAL_SIGNATURE
  all.unsubscribe = unsubscribeUrl ? unsubscribeLine(unsubscribeUrl) : null
  const subject = template.subject ? fillTemplate(template.subject, all) : null
  const { content, closing } = splitClosing(fillTemplate(template.body, all))
  const draft: Draft = { channel: template.channel, purpose: template.purpose, step: template.step, subject, content, closing }
  return { ...draft, body: composeBody(draft), heldBecause: ruleFailures(draft) }
}
