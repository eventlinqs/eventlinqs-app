import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { midnightIn } from '@/lib/dates/zone-midnight'
import { readTouchVoice } from './daily-queue'
import { dayAndMinuteIn, DEFAULT_SEND_WINDOW, inBusinessHours, recipientZone, sendWindowOf, type SendWindow } from './sender'
import { mailboxFor } from './addresses'
import { answerAt, answerClassOf } from './answer-timing'
import letters from './letter-approvals.generated.json'
import standing from './standing-approvals.generated.json'
import { readVoicePolicy, voiceProblems, type VoicePolicy } from './voice-gate'

/**
 * NO DAILY PRESS: AN APPROVED HELD FIRST LETTER QUEUES ITSELF (the PM's item 2 of 00:05:52, 21 November 2026, on law 23,
 * law 38 and Lawal's start of 20 November, 23:55: "Start now ... Then at least ten new Victorian organisers each business
 * day from lawal@, on the approved template"). Lawal approves a template once; the engine sends. His Send and Send All
 * stay his buttons, never a step the engine waits on.
 *
 * A held first letter queues itself into the next business window in its recipient's city ONLY when every one of these
 * holds, read now, and nothing here writes any of them:
 *   1. the sender is live (in test or hold mode nothing is queued, so a letter is never failed by test mode);
 *   2. its words pass every rule of the voice policy in force (voice-gate.ts voiceProblems, the gateway's validate);
 *   3. it is CLEARED as the gateway's send-check clears it, ported here line for line (C:\dev\comms-gateway\gateway.py):
 *      a letter with an approval of its own (Lawal's, found by the gateway's own content hash, chash) is judged by that
 *      approval alone: sending authorised, under the policy in force; only a letter with none clears under his standing
 *      approval of its exact template (standing_clear, template_pattern): the approval is on, carries his words, was
 *      given under the policy in force, and the letter's subject and body are that template with only its fields
 *      filled, each field in its one form, the guide link its own city;
 *   4. the organiser's page check is recorded by a person (organiser_contacts.no_marketing_statement_checked, the
 *      conspicuous publication basis); the engine never ticks it.
 * Its slot is written fresh from today (law 42): now when the window is open, else the next 9:00 on a weekday in the
 * recipient's city. The database's own rules then judge the queue, and the sender judges the send again (one first
 * letter per organiser, suppression and unsubscribe, the daily cap, business hours, the words, its mailbox from lawal@).
 */
type Admin = SupabaseClient<Database>

export type StandingApproval = {
  readonly key: string
  readonly version: number
  readonly on: boolean
  readonly words: string
  readonly quoted_at: string
  readonly policy_version: string
  readonly subject: string
  readonly body: string
}

/** Lawal's standing approvals, copied unchanged from the gateway's own record (standing-approvals.generated.json). */
export function standingApprovals(): readonly StandingApproval[] {
  return ((standing as { templates?: StandingApproval[] }).templates ?? []) as readonly StandingApproval[]
}

export type LetterApproval = {
  readonly id: string
  readonly content_hash: string
  readonly policy_version: string
  readonly by: string
  readonly authorised_send?: boolean
  readonly at: string
}

/** Lawal's own approvals of acquisition first letters, copied unchanged from the gateway's record. */
export function letterApprovals(): readonly LetterApproval[] {
  return ((letters as { approvals?: LetterApproval[] }).approvals ?? []) as readonly LetterApproval[]
}

/** One value as Python's json.dumps writes it (sort_keys, ensure_ascii, its default separators). */
function pythonJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    let out = '"'
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i)
      if (c === 0x22) out += '\\"'
      else if (c === 0x5c) out += '\\\\'
      else if (c === 0x0a) out += '\\n'
      else if (c === 0x0d) out += '\\r'
      else if (c === 0x09) out += '\\t'
      else if (c === 0x08) out += '\\b'
      else if (c === 0x0c) out += '\\f'
      else if (c < 0x20 || c > 0x7e) out += `\\u${c.toString(16).padStart(4, '0')}`
      else out += value[i]
    }
    return `${out}"`
  }
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(', ')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${pythonJson(k)}: ${pythonJson(v)}`).join(', ')}}`
}

/** The gateway's content hash of a message (gateway.py chash), byte for byte. */
export function gatewayContentHash(msg: Readonly<Record<string, unknown>>): string {
  const keep: Record<string, unknown> = {}
  for (const k of ['channel', 'category', 'from', 'to', 'subject', 'greeting_name', 'body', 'thread_ref']) keep[k] = msg[k] ?? null
  return createHash('sha256').update(pythonJson(keep), 'utf8').digest('hex').slice(0, 16)
}

/**
 * A held first letter as the gateway is given it: an email from its category's mailbox (law 33 (a): an ACQ letter from
 * lawal@, a source ask, PERM, from hello@) to the organiser's address (a list of one, as the approved message files carry
 * it: C:\dev\EVIDENCE\EL-20NOV\acq\letters-today), greeted by its first line.
 */
export function gatewayFirstLetter(letter: { readonly subject: string; readonly body: string; readonly to: string | null; readonly category?: string | null }): Record<string, unknown> {
  const from = mailboxFor({ category: letter.category ?? 'ACQ', purpose: 'cadence' })
  const greeting = /^Hi ([^,\n]{1,80}),$/.exec(letter.body.split('\n')[0] ?? '')?.[1] ?? null
  return { channel: 'email', category: 'first_contact', from: 'mailbox' in from ? from.mailbox : null, to: letter.to ? [letter.to] : null, subject: letter.subject, greeting_name: greeting, body: letter.body, thread_ref: null }
}

/**
 * The gateway's send-check on a letter's own approval (gateway.py send-check): null when the letter has none, so the
 * standing approval decides; otherwise that approval alone decides, never the standing one.
 */
export function ownApprovalClear(
  letter: { readonly subject: string; readonly body: string; readonly to: string | null; readonly category?: string | null },
  policyVersion: string,
  approvals: readonly LetterApproval[] = letterApprovals(),
): { readonly cleared: boolean; readonly reason: string } | null {
  const hash = gatewayContentHash(gatewayFirstLetter(letter))
  const ap = approvals.find((a) => a.content_hash === hash)
  if (!ap) return null
  const why: string[] = []
  if (ap.policy_version !== policyVersion) why.push('voice policy changed since approval: revalidated, approve again')
  if (!ap.authorised_send) why.push('approved as a draft only; sending not authorised')
  if (ap.by !== 'lawal') why.push('only Lawal approves a founder-voice message')
  if (why.length > 0) return { cleared: false, reason: why.join('; ') }
  return { cleared: true, reason: `Lawal's own approval ${ap.id} of ${ap.at}` }
}

const TEMPLATE_FIELD = /\[([^\]\n]{1,40})\]/g

/** Each field the approved template names and the one form its fill may take (gateway.py FIELD_FORMS, unchanged). */
const FIELD_FORMS: Readonly<Record<string, string>> = {
  organiser: '[A-Za-z0-9][^\\n\\[\\]]{0,118}',
  city: '[A-Z][A-Za-z ]{1,39}',
  'city slug': '[a-z0-9]+(?:-[a-z0-9]+)*',
  'what they run, or events': 'events',
  'unsubscribe link': 'https://www\\.eventlinqs\\.com\\.au/unsubscribe/outreach\\?t=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  // The source ask's fields (source_ask v1; the founder, 12:14 and 14:55 of 23 November 2026): the listings its subject
  // names, the website whose events it would include, and its ask, one paragraph ending in its one question.
  listings: '[A-Za-z0-9][^\\n\\[\\]]{0,79}',
  site: '[A-Za-z0-9][^\\n\\[\\]]{0,79}',
  ask: '[A-Z][^\\n\\[\\]]{19,599}\\?',
  // The reply templates' fields (Lawal's 07:02 and 07:03 of 25 November 2026, replies go by themselves): the name the
  // greeting takes (the voice gate holds it to the verified recipient), the subject of the thread it answers, and the
  // ticketing provider their own words named (replies.ts providerNamed: one of the listing page's own names).
  'first name': '[A-Z][^\\n\\[\\],]{0,80}',
  'thread subject': '[^\\n\\[\\]]{1,200}',
  provider: '[A-Z][A-Za-z0-9 .]{1,30}',
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`)

/** The approved text as a pattern: every word exact, every field a named group of its one form (gateway.py template_pattern). */
export function templatePattern(text: string): { readonly pattern: RegExp; readonly names: readonly string[] } | null {
  const parts: string[] = []
  const names: string[] = []
  let at = 0
  for (const m of text.matchAll(TEMPLATE_FIELD)) {
    const start = m.index ?? 0
    let name = m[1].trim().toLowerCase()
    if (text.slice(Math.max(0, start - 6), start) === '/city/' && name === 'city') name = 'city slug'
    const form = FIELD_FORMS[name]
    if (form === undefined) return null
    parts.push(escapeRegExp(text.slice(at, start)))
    parts.push(`(?<f${names.length}>${form})`)
    names.push(name)
    at = start + m[0].length
  }
  parts.push(escapeRegExp(text.slice(at)))
  return { pattern: new RegExp(`^(?:${parts.join('')})$`, 's'), names }
}

/** Whether a letter clears under Lawal's standing approval of its exact template (gateway.py standing_clear). */
export function standingClear(
  msg: { readonly template: string; readonly subject: string; readonly body: string },
  policyVersion: string,
  entries: readonly StandingApproval[] = standingApprovals(),
): { readonly cleared: boolean; readonly reason: string } {
  const named = msg.template.trim()
  if (!named) return { cleared: false, reason: 'the letter names no approved template' }
  const entry = entries.find((e) => `${e.key} v${e.version}` === named)
  if (!entry) return { cleared: false, reason: `no standing approval for ${named}` }
  if (!entry.on) return { cleared: false, reason: `the standing approval for ${named} is off: it is switched on only with Lawal's own words quoted` }
  if (!String(entry.words ?? '').trim()) return { cleared: false, reason: `the standing approval for ${named} carries no words of Lawal's` }
  if (entry.policy_version !== policyVersion) return { cleared: false, reason: 'the voice policy changed since the standing approval: Lawal approves again' }
  const values = new Map<string, string>()
  for (const [part, text] of [['subject', entry.subject ?? ''], ['body', entry.body ?? '']] as const) {
    const made = templatePattern(text)
    if (!made) return { cleared: false, reason: `${named} names a field this check cannot judge` }
    const got = made.pattern.exec(part === 'subject' ? msg.subject : msg.body)
    if (!got) return { cleared: false, reason: `the letter's ${part} is not ${named} with only its fields filled` }
    for (const [i, name] of made.names.entries()) {
      const v = got.groups?.[`f${i}`] ?? ''
      const before = values.get(name)
      if (before === undefined) values.set(name, v)
      else if (before !== v) return { cleared: false, reason: `the field '${name}' is filled two ways` }
    }
  }
  const city = values.get('city')
  const slug = values.get('city slug')
  if (city !== undefined && slug !== undefined && slug !== city.toLowerCase().replace(/ /g, '-')) {
    return { cleared: false, reason: "the guide link is not the letter's own city" }
  }
  return { cleared: true, reason: `standing approval of ${named}: '${entry.words.trim().slice(0, 160)}'` }
}

/** The next moment the sending window is open in the zone, from now (law 42: from today, never a day before; law 44). */
export function nextWindowStart(now: Date, zone: string, window: SendWindow = DEFAULT_SEND_WINDOW): Date {
  if (inBusinessHours(now, zone, window)) return now
  let midnight = midnightIn(now, zone)
  for (let i = 0; i < 9; i++) {
    let opens = new Date(midnight.getTime() + window.fromMinute * 60_000)
    const m = dayAndMinuteIn(opens, zone).minute
    if (m !== window.fromMinute) opens = new Date(opens.getTime() + (window.fromMinute - m) * 60_000)
    if (opens.getTime() > now.getTime() && inBusinessHours(opens, zone, window)) return opens
    midnight = midnightIn(new Date(midnight.getTime() + 36 * 3_600_000), zone)
  }
  throw new Error(`no business window found in nine days in ${zone}`)
}

export type SelfQueueReport = {
  readonly note?: string
  readonly queued: { readonly id: string; readonly at: string; readonly why: string }[]
  readonly waiting: { readonly id: string; readonly reasons: readonly string[] }[]
  /** First letters already queued for later than the window's next opening, brought to it (law 42 (b), law 44). */
  readonly replanned?: { readonly id: string; readonly from: string; readonly to: string }[]
}

type HeldFirst = { id: string; contact_id: string; comms_category?: string | null; subject: string | null; body: string; outreach_templates: { key: string; version: number } | null }

/**
 * THE FIRST LETTERS THE ENGINE SENDS ITSELF: an acquisition first letter (ACQ), and the source ask (PERM-SOURCE: the
 * founder, 12:14 and 14:55 of 23 November 2026; source_ask v1 is a standing template). Every other PERM letter keeps its
 * own path (law 49's plays queue their own). As a PostgREST filter on outreach_touches.
 */
export const SELF_QUEUED_FIRST_LETTERS = 'comms_category.eq.ACQ,comms_subtype.eq.PERM-SOURCE'

export async function queueApprovedHeldLetters(
  db: Admin,
  deps: { readonly now: Date; readonly policy?: VoicePolicy; readonly approvals?: readonly StandingApproval[]; readonly letterApprovals?: readonly LetterApproval[] },
): Promise<SelfQueueReport> {
  const report: SelfQueueReport = { queued: [], waiting: [] }
  const sender = await db.from('outreach_sender').select('mode, send_days, send_from_minute, send_until_minute').eq('id', true).single()
  if (sender.error) throw new Error(`outreach_sender: ${sender.error.message}`)
  if (sender.data.mode !== 'live') return { ...report, note: `the sender is ${sender.data.mode}: no letter queues itself` }
  let policy: VoicePolicy
  try {
    policy = deps.policy ?? readVoicePolicy()
  } catch (error) {
    return { ...report, note: error instanceof Error ? error.message : String(error) }
  }
  const held = await db
    .from('outreach_touches')
    .select('id, contact_id, comms_category, subject, body, outreach_templates(key, version)')
    .eq('state', 'held')
    .eq('step', 1)
    .or(SELF_QUEUED_FIRST_LETTERS)
    .limit(200)
  if (held.error) throw new Error(`the held first letters: ${held.error.message}`)
  for (const t of (held.data ?? []) as unknown as HeldFirst[]) {
    const reasons: string[] = []
    const voice = await readTouchVoice(db, t.id)
    if (!voice) {
      report.waiting.push({ id: t.id, reasons: ['it is no longer waiting'] })
      continue
    }
    reasons.push(...voiceProblems(voice, policy))
    const template = t.outreach_templates ? `${t.outreach_templates.key} v${t.outreach_templates.version}` : ''
    const contact = await db.from('organiser_contacts').select('basis, no_marketing_statement_checked, address, engine_check_note, engine_checked_on').eq('id', t.contact_id).maybeSingle()
    const own = ownApprovalClear({ subject: t.subject ?? '', body: t.body, to: contact.data?.address ?? null, category: t.comms_category ?? 'ACQ' }, policy.version, deps.letterApprovals ?? letterApprovals())
    const clear = own ?? standingClear({ template, subject: t.subject ?? '', body: t.body }, policy.version, deps.approvals ?? standingApprovals())
    if (!clear.cleared) reasons.push(clear.reason)
    if (contact.error || !contact.data) reasons.push('its contact could not be read')
    else if (!contact.data.basis) reasons.push('no basis for writing is recorded for its contact')
    else if (contact.data.basis === 'conspicuous_publication' && !contact.data.no_marketing_statement_checked) {
      // The engine's own page check clears it (./engine-recheck.ts, the 23:45 turn), never a person (the PM's 15:48, F5 (c)).
      const note = contact.data.engine_check_note
      reasons.push(
        note
          ? `the engine's page check has not cleared its address yet (${contact.data.engine_checked_on}: ${note}); it is read again in the next pool turn`
          : "the engine's page check has not read its address yet; it is read in the next pool turn",
      )
    }
    if (reasons.length > 0) {
      report.waiting.push({ id: t.id, reasons })
      continue
    }
    const at = nextWindowStart(deps.now, await recipientZone(db, t.contact_id), sendWindowOf(sender.data)).toISOString()
    const moved = await db.from('outreach_touches').update({ state: 'queued', scheduled_for: at }).eq('id', t.id).eq('state', 'held').select('id').maybeSingle()
    if (moved.error || !moved.data) {
      report.waiting.push({ id: t.id, reasons: [moved.error?.message.replace(/^refused: /, '') ?? 'it was no longer held'] })
      continue
    }
    report.queued.push({ id: t.id, at, why: clear.reason })
  }
  // RE PLANNED TO THE WINDOW IN FORCE (law 42 (b); law 44, Lawal's 01:16 of 21 November 2026): a first letter queued for
  // later than the next opening of the current window, as one queued under an earlier window is, goes at that opening.
  // Follow ups keep their own day; a letter slotted at or before the opening is never touched.
  const window = sendWindowOf(sender.data)
  const queued = await db.from('outreach_touches').select('id, contact_id, scheduled_for').eq('state', 'queued').eq('step', 1).or(SELF_QUEUED_FIRST_LETTERS).limit(200)
  if (queued.error) throw new Error(`the queued first letters: ${queued.error.message}`)
  const replanned: { id: string; from: string; to: string }[] = []
  for (const q of (queued.data ?? []) as { id: string; contact_id: string; scheduled_for: string | null }[]) {
    if (!q.scheduled_for) continue
    const opens = nextWindowStart(deps.now, await recipientZone(db, q.contact_id), window)
    if (new Date(q.scheduled_for).getTime() <= opens.getTime()) continue
    const moved = await db.from('outreach_touches').update({ scheduled_for: opens.toISOString() }).eq('id', q.id).eq('state', 'queued').select('id').maybeSingle()
    if (!moved.error && moved.data) replanned.push({ id: q.id, from: q.scheduled_for, to: opens.toISOString() })
  }
  return replanned.length > 0 ? { ...report, replanned } : report
}

/**
 * REPLIES GO BY THEMSELVES (Lawal, 25 November 2026, 07:02, verbatim through the PM's 07:03: "The system should be able
 * to send it from my mailbox and not have to have me approve it. That needs changing right now."; 07:03: "Change that
 * rule. It doesn't work ... It has to make my system convenient."). An answer to an organiser's own message, drafted in
 * their thread from one of the reply templates, queues itself into the next sending window, with no founder tap, when
 * every one of these holds, read now:
 *   1. the sender is live;
 *   2. it answers a message of theirs (in_reply_to): the database holds a reply only where they wrote to us;
 *   3. its words pass every rule of the voice policy in force, and its draft carries no rule it failed (held_because);
 *   4. it clears under Lawal's standing approval of its exact template, with only its fields filled (standingClear):
 *      a template whose words are not true today stays off in the approvals record, so its drafts stay held.
 * The CRM directive's section 9 is kept before this: a reply that speaks of money or a contract is never drafted
 * (./replies.ts MONEY_OR_CONTRACT), and goes to the PM. The sender then sends it from the address the letter it answers
 * went from, in their thread (./sender.ts readConversation), and records the provider's own confirmation.
 *
 * ITS TIME (Lawal, 25 November 2026, 15:14 and 15:16; ./answer-timing.ts): an answer is not outreach, so it is queued
 * for its own class's time after their message arrived (a sale 50 to 60 minutes, a reply to our letter 1 to 2 hours,
 * general about 4 hours; never under 50 minutes), inside 07:00 to 21:00 in Melbourne, never law 44's window.
 */
export const REPLY_TEMPLATE_KEYS: readonly string[] = [
  'reply_cost', 'reply_existing_ticketing', 'reply_who_are_you', 'reply_why_listed', 'reply_not_now', 'reply_change', 'reply_stop', 'reply_take_down',
  'thank_you', 'withdrawal_confirmed',
]

type HeldReply = { id: string; contact_id: string; subject: string | null; body: string; in_reply_to: string | null; held_because: string[] | null; outreach_templates: { key: string; version: number } | null }

export async function queueApprovedReplies(
  db: Admin,
  deps: { readonly now: Date; readonly policy?: VoicePolicy; readonly approvals?: readonly StandingApproval[]; readonly random?: () => number },
): Promise<SelfQueueReport> {
  const report: SelfQueueReport = { queued: [], waiting: [] }
  const sender = await db.from('outreach_sender').select('mode').eq('id', true).single()
  if (sender.error) throw new Error(`outreach_sender: ${sender.error.message}`)
  if (sender.data.mode !== 'live') return { ...report, note: `the sender is ${sender.data.mode}: no reply queues itself` }
  let policy: VoicePolicy
  try {
    policy = deps.policy ?? readVoicePolicy()
  } catch (error) {
    return { ...report, note: error instanceof Error ? error.message : String(error) }
  }
  const held = await db
    .from('outreach_touches')
    .select('id, contact_id, subject, body, in_reply_to, held_because, outreach_templates(key, version)')
    .eq('state', 'held')
    .in('purpose', ['reply', 'relationship'])
    .not('in_reply_to', 'is', null)
    .limit(200)
  if (held.error) throw new Error(`the held replies: ${held.error.message}`)
  for (const t of (held.data ?? []) as unknown as HeldReply[]) {
    const key = t.outreach_templates?.key ?? ''
    if (!REPLY_TEMPLATE_KEYS.includes(key)) continue
    const reasons: string[] = [...(t.held_because ?? [])]
    const voice = await readTouchVoice(db, t.id)
    if (!voice) {
      report.waiting.push({ id: t.id, reasons: ['it is no longer waiting'] })
      continue
    }
    reasons.push(...voiceProblems(voice, policy))
    const clear = standingClear({ template: `${key} v${t.outreach_templates?.version}`, subject: t.subject ?? '', body: t.body }, policy.version, deps.approvals ?? standingApprovals())
    if (!clear.cleared) reasons.push(clear.reason)
    if (reasons.length > 0) {
      report.waiting.push({ id: t.id, reasons })
      continue
    }
    // Their message it answers, and our letter that one answered, give the class and the time.
    const theirs = await db.from('outreach_replies').select('received_at, outcome, wording, touch_id').eq('source_message_id', t.in_reply_to ?? '').maybeSingle()
    if (theirs.error || !theirs.data) {
      report.waiting.push({ id: t.id, reasons: [theirs.error ? `the message it answers could not be read: ${theirs.error.message}` : 'the message it answers is not on record'] })
      continue
    }
    const letter = theirs.data.touch_id ? await db.from('outreach_touches').select('comms_category').eq('id', theirs.data.touch_id as string).maybeSingle() : null
    const klass = answerClassOf({
      templateKey: key,
      outcome: (theirs.data.outcome as string | null) ?? null,
      answeredCategory: ((letter?.data as { comms_category?: string | null } | null | undefined)?.comms_category as string | null | undefined) ?? null,
      words: String(theirs.data.wording ?? ''),
    })
    const at = answerAt({ receivedAt: new Date(theirs.data.received_at as string), klass, now: deps.now, random: (deps.random ?? Math.random)() }).toISOString()
    const moved = await db.from('outreach_touches').update({ state: 'queued', scheduled_for: at }).eq('id', t.id).eq('state', 'held').select('id').maybeSingle()
    if (moved.error || !moved.data) {
      report.waiting.push({ id: t.id, reasons: [moved.error?.message.replace(/^refused: /, '') ?? 'it was no longer held'] })
      continue
    }
    report.queued.push({ id: t.id, at, why: `${clear.reason}; answered as ${klass}` })
  }
  return report
}
