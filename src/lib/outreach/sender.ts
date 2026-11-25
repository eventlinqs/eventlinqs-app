/**
 * THE OUTREACH SENDER: TAKES WHAT AN APPROVED PLAY HAS QUEUED AND SENDS IT, INSIDE THE DATABASE's RULES (window 6,
 * 28 October 2026; the engine plan's FULL AUTOMATION, Lawal 20:16).
 *
 * THE DATABASE IS THE GATE, NOT THIS FILE. Each message is first CLAIMED (queued to sending), and that transition runs
 * every check (migrations 213001 and 224001): the sender's mode, the play's daily cap counting what is being sent, the
 * cadence day, the basis, the suppression list, every message rule. Only a claimed message is handed to the transport,
 * and it ends sent (with the Message-ID we set) or failed (with what the transport said). A claim the database refuses
 * stays queued and the refusal is reported in its own words.
 *
 * THE MODE CHOOSES THE TRANSPORT, ONCE (the campaigner's rule, src/lib/campaigner/sink.ts: "test mode is a path, not a
 * flag checked somewhere"):
 *   hold   no transport at all: nothing is claimed, nothing leaves.
 *   test   only addresses at the test domain, through Graph when its credentials exist (to prove the headers survive
 *          Exchange), else into a recorded sink; any other address is refused by the transport AND by the database.
 *   live   Graph. Without credentials the run reports that and claims nothing.
 *
 * BUSINESS HOURS IN THE RECIPIENT's ZONE (the plan: "sends spread through business hours in the recipient's timezone"):
 * The sending window, a stored setting (law 44, Lawal's 01:16 of 21 November 2026; outreach_sender.send_days,
 * send_from_minute, send_until_minute; Monday to Saturday, 06:00 to before 09:00 by default), read in the time zone of
 * the city of a venue the organiser runs, else Melbourne.
 * The hours are EventLinqs' own choice (UNSOURCED: no rule names them); outside them a message stays queued.
 */
import { slotDay, slotFromEarlierDay, wordsNameATime } from '@/lib/ops/stale-slot'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readVoicePolicy, wordsProblems } from './voice-gate'
import type { Database } from '@/types/database'
import { buildOutreachMime, mimeForGraph, newMessageId } from './mime'
import { graphSendMime, type GraphConfig } from './graph'
import { isSegmentANight, melbourneDayOf } from './segment-a-letter'
import { firstLetterBlocked } from './one-first-letter'
import { FIRST_LETTER_SENT, readFirstLetterRecord } from './first-letter-record'
import { HELLO_MAILBOX, mailboxFor, OUR_MAILBOXES } from './addresses'
import { answerMayLeave } from './answer-timing'
import { conversationOf, type ConversationMessage } from './conversation'
import { isLifecycleKey, lifecycleStillAsks } from './lifecycle-letters'
import { eventSlugOf, letterExpiry } from './event-validity'
import { decisionWords, readContactPolicy, type PolicyRule } from './contact-policy'

type Admin = SupabaseClient<Database>
type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export type SenderMode = 'hold' | 'test' | 'live'
/** One message as it leaves: `from` is the mailbox it goes from (law 33 (a), ./addresses.ts mailboxFor). */
export type OutgoingEmail = { to: string; base64Mime: string; messageId: string; from?: string }
export type OutreachTransport = { kind: 'graph' | 'recorded'; send: (m: OutgoingEmail) => Promise<void> }

export class OutsideTestDomain extends Error {
  constructor(address: string, domain: string) {
    super(`test mode reaches only @${domain}; ${address} refused`)
    this.name = 'OutsideTestDomain'
  }
}

const recorded: OutgoingEmail[] = []
export function recordedOutreachMail(): readonly OutgoingEmail[] {
  return recorded
}
export function clearRecordedOutreachMail(): void {
  recorded.length = 0
}

function atDomain(address: string, domain: string): boolean {
  return address.toLowerCase().endsWith(`@${domain.toLowerCase()}`)
}

/** The transport for a mode, chosen once per run. hold, and live without credentials, have none. */
export function transportForMode(mode: SenderMode, testDomain: string, graph: GraphConfig | null, fetchImpl?: Fetch): OutreachTransport | null {
  if (mode === 'hold') return null
  if (mode === 'test') {
    return {
      kind: graph ? 'graph' : 'recorded',
      send: async (m) => {
        if (!atDomain(m.to, testDomain)) throw new OutsideTestDomain(m.to, testDomain)
        if (graph) await graphSendMime(m.from ? { ...graph, mailbox: m.from } : graph, m.base64Mime, fetchImpl)
        else recorded.push(m)
      },
    }
  }
  if (!graph) return null
  return { kind: 'graph', send: (m) => graphSendMime(m.from ? { ...graph, mailbox: m.from } : graph, m.base64Mime, fetchImpl) }
}

/**
 * WHETHER BUSINESS HOURS APPLY TO AN ADDRESS (the PM's 00:10 of 21 November 2026, item 2, on Lawal's 'start now'):
 * the hours protect a recipient, and our own test mailbox is not one. An address on the sender's own test domain
 * (outreach_sender.test_domain) is sent at any hour; every other address, and any address when the domain is not
 * known, keeps the sending window in its city.
 */
export function businessHoursApply(address: string | null, testDomain: string | null): boolean {
  if (!address || !testDomain) return true
  return !atDomain(address, testDomain)
}

/**
 * THE SENDING WINDOW (law 44; Lawal, 21 November 2026, 01:16: "Monday to Saturday we are sending ... Sunday is off ...
 * You send my emails before the start of work hours ... never between nine to five ... as early as six AM"): the days
 * of the week (1 Monday to 7 Sunday) and the minutes of the day, from the first to before the last, in the recipient's
 * city. Stored on outreach_sender; Monday to Saturday, 06:00 to before 09:00, when the row holds none.
 */
export type SendWindow = { readonly days: readonly number[]; readonly fromMinute: number; readonly untilMinute: number }

export const DEFAULT_SEND_WINDOW: SendWindow = { days: [1, 2, 3, 4, 5, 6], fromMinute: 6 * 60, untilMinute: 9 * 60 }

/** The window the sender row holds, else the default; a malformed stored window is never guessed at: the default holds. */
export function sendWindowOf(row: { send_days?: readonly number[] | null; send_from_minute?: number | null; send_until_minute?: number | null } | null | undefined): SendWindow {
  const days = row?.send_days
  const from = row?.send_from_minute
  const until = row?.send_until_minute
  if (!Array.isArray(days) || days.length === 0 || !days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) return DEFAULT_SEND_WINDOW
  if (!Number.isInteger(from) || !Number.isInteger(until) || (from as number) < 0 || (until as number) > 1440 || (from as number) >= (until as number)) return DEFAULT_SEND_WINDOW
  return { days: [...days], fromMinute: from as number, untilMinute: until as number }
}

const ISO_DAY: Readonly<Record<string, number>> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

/** The day of the week (1 Monday to 7 Sunday) and the minute of the day of an instant in a zone. */
export function dayAndMinuteIn(at: Date, timeZone: string): { readonly day: number; readonly minute: number } {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(at)
  const day = ISO_DAY[parts.find((p) => p.type === 'weekday')?.value ?? ''] ?? 0
  const minute = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') * 60 + Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return { day, minute }
}

/** True inside the sending window in the given zone (by default Monday to Saturday, 06:00 to before 09:00). */
export function inBusinessHours(at: Date, timeZone: string, window: SendWindow = DEFAULT_SEND_WINDOW): boolean {
  const { day, minute } = dayAndMinuteIn(at, timeZone)
  return window.days.includes(day) && minute >= window.fromMinute && minute < window.untilMinute
}

/** The window in words, for a refusal: 'Monday to Saturday, 06:00 to 09:00'. */
export function sendWindowWords(w: SendWindow): string {
  const names = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const run = w.days.length > 1 && w.days.every((d, i) => i === 0 || d === w.days[i - 1] + 1)
  const days = w.days.length === 7 ? 'every day' : run ? `${names[w.days[0]]} to ${names[w.days[w.days.length - 1]]}` : w.days.map((d) => names[d]).join(', ')
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return `${days}, ${hhmm(w.fromMinute)} to ${hhmm(w.untilMinute)}`
}

export type SenderReport = {
  /** Answers not yet 50 minutes old (./answer-timing.ts): left queued for a later run. */
  tooSoon?: number
  /** A sent message whose mailbox could not be recorded, with why. */
  mailboxNotRecorded?: string[]
  mode: SenderMode
  transport: OutreachTransport['kind'] | 'none'
  closedStuck: number
  considered: number
  sent: string[]
  failed: { id: string; reason: string }[]
  refused: { id: string; reason: string }[]
  outsideHours: number
  /** Law 42: letters whose slot fell on a missed day, re planned to today or held for a redraft, each with its reason. */
  replanned?: string[]
  /**
   * Letters the contact policy held at the minute they would have left (./contact-policy.ts): each set aside, never sent,
   * with its rule and next eligible moment; each is also in refused, with its reason, for the press that sent it.
   */
  policyHeld?: { id: string; rule: PolicyRule; nextEligibleAt: string | null }[]
  note?: string
}

type Queued = {
  id: string
  contact_id: string
  step: number | null
  purpose: string | null
  comms_category: string | null
  subject: string | null
  body: string
  in_reply_to: string | null
  scheduled_for?: string | null
  /** What the letter is about (./contact-policy.ts contextKeys): 'event:<events.id>' names its night. */
  context_key?: string | null
  outreach_templates: { key: string } | null
}


/**
 * THE TIMING RULE, AGAIN AT THE MOMENT OF SENDING (the communication standard's Part 2 rule 4: no message about an event
 * lands on or after its day, and a segment A letter goes only while its night is 3 or more days ahead). A segment A letter
 * queued on a Friday afternoon and held over a weekend could otherwise land too close: before it is claimed, the night it
 * names (its /events/ page) is read again, and a letter that would now land too close is set aside with why, never sent.
 * Null means it may go.
 */
async function segmentATooClose(db: Admin, t: Queued, now: Date): Promise<string | null> {
  const key = t.outreach_templates?.key ?? ''
  if (!key.startsWith('segment_a_') && !isLifecycleKey(key)) {
    // EVERY OTHER LETTER THAT NAMES AN EVENT (event-validity.ts; Lawal's 19:13 of 22 November 2026, section 11): read
    // again now, and never sent once the event is no longer published or its day has come (its report, message 8, only
    // inside its own window).
    const named = eventSlugOf(t.body ?? '')
    if (!named) return null
    const ev = await db.from('events').select('start_date, end_date, status, timezone').eq('slug', named).maybeSingle()
    if (ev.error) return `the event it names could not be read again: ${ev.error.message}`
    const row = ev.data as { start_date: string; end_date: string | null; status: string | null; timezone: string | null } | null
    return letterExpiry(key, row ? { startDate: row.start_date, endDate: row.end_date, status: row.status, timezone: row.timezone } : null, now)
  }
  // THE NIGHT IT NAMES: its own context first ('event:<events.id>', as law 49's and segment A's plays write it), then the
  // /events/ link in its words. Lawal's approved photo request of 22 November (lifecycle_perm version 2) names its night in
  // words and carries no link, so reading the words alone set aside every one at send and the clock drafted it again each
  // run (26 November 2026, 06:00: The JazzLab's, read on production; no version 2 request had ever gone).
  const eventId = /^event:([0-9a-f-]{36})$/.exec(t.context_key ?? '')?.[1] ?? null
  const slug = eventId ? null : t.body.match(/\/events\/([a-z0-9-]+)/)?.[1]
  if (!eventId && !slug) return 'it names no night of theirs to check the timing against'
  const ev = eventId
    ? await db.from('events').select('start_date, timezone').eq('id', eventId).maybeSingle()
    : await db.from('events').select('start_date, timezone').eq('slug', slug as string).maybeSingle()
  if (ev.error || !ev.data) return `its night could not be read again: ${ev.error?.message ?? 'no such night'}`
  // A law 49 letter goes only while its night is more than 7 days ahead (no new ask inside T-7), by the event's clock.
  if (isLifecycleKey(key)) {
    return lifecycleStillAsks(ev.data.start_date as string, (ev.data.timezone as string | null) ?? null, now)
      ? null
      : 'its night is now inside its final week, where no new ask goes (law 49, T-7); set aside, never sent'
  }
  const landsOn = melbourneDayOf(now.toISOString())
  return isSegmentANight(ev.data.start_date as string, landsOn, (ev.data.timezone as string | null) ?? null)
    ? null
    : `landing on ${landsOn} it would be less than 3 days before its night (the standard's Part 2 rule 4); set aside, never sent`
}

/** One letter a run, so they go 15 minutes apart (the PM's 08:20 of 18 November 2026; the run is every 15 minutes). */
export const SEND_BATCH = 1

/** The zone of the city of a venue the contact's organiser runs, else Melbourne. */
export async function recipientZone(db: Admin, contactId: string): Promise<string> {
  const contact = await db.from('organiser_contacts').select('organiser_id').eq('id', contactId).single()
  if (contact.error) return 'Australia/Melbourne'
  const venues = await db.from('organiser_venues').select('venue_id').eq('organiser_id', contact.data.organiser_id).limit(1)
  const venueId = venues.data?.[0]?.venue_id
  if (!venueId) return 'Australia/Melbourne'
  const venue = await db.from('venues').select('city_slug').eq('id', venueId).single()
  const slug = venue.data?.city_slug
  if (!slug) return 'Australia/Melbourne'
  const city = await db.from('cities').select('timezone').eq('slug', slug).maybeSingle()
  return city.data?.timezone ?? 'Australia/Melbourne'
}

/**
 * THE CONVERSATION (./conversation.ts; Lawal, 25 November 2026, 14:41 and 14:43): every message between us and this
 * contact, ours sent and theirs received, oldest first, with the mailbox of ours each went through. That mailbox is
 * read from its record (outreach_message_mailboxes, kept from 25 November 2026: the inbox run, the sender and the Sent
 * Items sync write it); for an older message it is the one the engine chose then: before the addresses split (#309)
 * every letter left from hello@, an engine send went from its category's address, and their message reached the mailbox
 * of our letter it answered. A message sent by hand before the record began has none and is passed over. A read that
 * fails is said, and the message is not sent from a guessed address.
 */
export async function readConversation(
  db: Admin,
  contactId: string,
  excludeTouchId: string,
): Promise<{ readonly ids: readonly string[]; readonly mailbox: string | null } | { readonly unread: string }> {
  const sent = await db
    .from('outreach_touches')
    .select('id, internet_message_id, sent_at, comms_category, purpose, provider')
    .eq('contact_id', contactId)
    .eq('state', 'sent')
    .neq('id', excludeTouchId)
    .not('internet_message_id', 'is', null)
    .order('sent_at', { ascending: true })
  if (sent.error) return { unread: `our messages to them could not be read: ${sent.error.message}` }
  const theirs = await db.from('outreach_replies').select('source_message_id, received_at, touch_id').eq('contact_id', contactId).not('source_message_id', 'is', null)
  if (theirs.error) return { unread: `their messages could not be read: ${theirs.error.message}` }
  type Ours = { id: string; internet_message_id: string | null; sent_at: string | null; comms_category: string | null; purpose: string | null; provider: string | null }
  type Theirs = { source_message_id: string | null; received_at: string | null; touch_id: string | null }
  const ours = ((sent.data ?? []) as Ours[]).filter((t) => t.internet_message_id)
  const replies = ((theirs.data ?? []) as Theirs[]).filter((r) => r.source_message_id)
  // A message of ours sent by hand and on record only by its mailbox row (its words refused by the message record).
  const hand = await db.from('outreach_message_mailboxes').select('internet_message_id, mailbox, message_at').eq('contact_id', contactId).eq('direction', 'sent')
  if (hand.error) return { unread: `the messages sent to them by hand could not be read: ${hand.error.message}` }
  const ids = [...ours.map((t) => t.internet_message_id as string), ...replies.map((r) => r.source_message_id as string)]
  const recorded = new Map<string, string>()
  if (ids.length > 0) {
    const r = await db.from('outreach_message_mailboxes').select('internet_message_id, mailbox').in('internet_message_id', ids)
    if (r.error) return { unread: `the mailboxes of their conversation could not be read: ${r.error.message}` }
    for (const m of (r.data ?? []) as { internet_message_id: string; mailbox: string }[]) recorded.set(m.internet_message_id, m.mailbox)
  }
  const engineChose = (t: Ours): string | null => {
    const at = t.sent_at ? Date.parse(t.sent_at) : NaN
    if (Number.isFinite(at) && at < ONE_ADDRESS_UNTIL) return HELLO_MAILBOX
    if (t.provider !== 'graph') return null
    const f = mailboxFor({ category: t.comms_category, purpose: t.purpose ?? '' })
    return 'mailbox' in f ? f.mailbox : null
  }
  const ofTouch = new Map<string, string | null>()
  const messages: ConversationMessage[] = []
  for (const t of ours) {
    const mailbox = recorded.get(t.internet_message_id as string) ?? engineChose(t)
    ofTouch.set(t.id, mailbox)
    messages.push({ id: t.internet_message_id as string, at: t.sent_at ?? '', mailbox })
  }
  for (const r of replies) {
    const mailbox = recorded.get(r.source_message_id as string) ?? (r.touch_id ? ofTouch.get(r.touch_id) ?? null : null)
    messages.push({ id: r.source_message_id as string, at: r.received_at ?? '', mailbox })
  }
  const known = new Set(messages.map((x) => x.id))
  for (const h of (hand.data ?? []) as { internet_message_id: string; mailbox: string; message_at: string | null }[]) {
    if (!known.has(h.internet_message_id)) messages.push({ id: h.internet_message_id, at: h.message_at ?? '', mailbox: h.mailbox })
  }
  return conversationOf(messages, OUR_MAILBOXES)
}

/**
 * Until law 33 (a)'s addresses reached main (#309, squash 978718d63, 19 November 2026 at 19:24:06 in Melbourne), every
 * letter left from the one sender address, hello@ (outreach_sender.from_address); a letter sent before it was answered
 * at hello@ whatever its category now says.
 */
export const ONE_ADDRESS_UNTIL = Date.parse('2026-11-19T08:24:06Z')

export async function runOutreachSender(
  db: Admin,
  deps: {
    now: Date
    origin: string
    graph: GraphConfig | null
    fetchImpl?: Fetch
    fromName?: string
    /**
     * ONLY THESE LETTERS (train AK, the PM's 12:40 and 12:47 of 20 November 2026): Lawal's Send press runs this one
     * path for the letter he pressed, with every check below, never a second path. Absent, the run takes the queue.
     */
    only?: readonly string[]
  },
): Promise<SenderReport> {
  const sender = await db.from('outreach_sender').select('mode, from_address, test_domain, send_days, send_from_minute, send_until_minute').eq('id', true).single()
  if (sender.error) throw new Error(`outreach_sender: ${sender.error.message}`)
  const mode = sender.data.mode as SenderMode
  const report: SenderReport = { mode, transport: 'none', closedStuck: 0, considered: 0, sent: [], failed: [], refused: [], outsideHours: 0 }

  const stuck = await db.rpc('outreach_close_stuck_sends', { p_minutes: 15 })
  if (stuck.error) throw new Error(`outreach_close_stuck_sends: ${stuck.error.message}`)
  report.closedStuck = stuck.data ?? 0

  const transport = transportForMode(mode, sender.data.test_domain, deps.graph, deps.fetchImpl)
  if (!transport) {
    report.note = mode === 'hold' ? 'the sender is on hold: nothing is claimed' : 'live without Graph credentials: nothing is claimed'
    return report
  }
  report.transport = transport.kind

  const queued = db
    .from('outreach_touches')
    .select('id, contact_id, step, purpose, comms_category, subject, body, in_reply_to, scheduled_for, context_key, outreach_templates(key)')
    .eq('state', 'queued')
    .lte('scheduled_for', deps.now.toISOString())
  const due = await (deps.only ? queued.in('id', [...deps.only]) : queued).order('scheduled_for', { ascending: true }).limit(SEND_BATCH)
  if (due.error) throw new Error(`the queue: ${due.error.message}`)

  for (const t of (due.data ?? []) as unknown as Queued[]) {
    report.considered++
    const addressed = await db.from('organiser_contacts').select('address').eq('id', t.contact_id).maybeSingle()
    const hoursApply = businessHoursApply(addressed.data?.address ?? null, sender.data.test_domain)
    const zone = await recipientZone(db, t.contact_id)
    // LAW 42, A MISSED DAY IS NEVER CAUGHT UP (Lawal, 20 November 2026, 23:58): a letter whose slot fell on an earlier day
    // in its recipient's city is never sent as that day's. It is re planned from today, so it goes only inside today's
    // window by the rules below; a letter whose words name a day or a date is held to be drafted again from today's facts.
    if (slotFromEarlierDay(t.scheduled_for ?? null, deps.now, zone)) {
      const missed = slotDay(t.scheduled_for ?? null, zone)
      const named = wordsNameATime(`${t.subject ?? ''}\n${t.body}`)
      report.replanned ??= []
      if (named) {
        const why = `its slot of ${missed} passed unsent and its words name a time ('${named}'): drafted again from today's facts (law 42)`
        await db.from('outreach_touches').update({ state: 'held', held_because: [why] }).eq('id', t.id).eq('state', 'queued')
        report.replanned.push(`${t.id}: held, ${why}`)
        continue
      }
      await db.from('outreach_touches').update({ scheduled_for: deps.now.toISOString() }).eq('id', t.id).eq('state', 'queued')
      report.replanned.push(`${t.id}: its slot of ${missed} passed unsent; re planned from today (law 42)`)
    }
    // AN ANSWER IS NOT OUTREACH (Lawal, 25 November 2026, 14:38 and 15:14; ./answer-timing.ts): a message answering one
    // of theirs keeps the answering hours, 07:00 to 21:00 in Melbourne every day, and never leaves before it is 50
    // minutes old (a confirmation the law asks for excepted); every other letter keeps law 44's window in its city.
    const answered = t.in_reply_to
      ? await db.from('outreach_replies').select('received_at').eq('source_message_id', t.in_reply_to).maybeSingle()
      : null
    const receivedAt = (answered?.data as { received_at?: string | null } | null | undefined)?.received_at ?? null
    if (receivedAt) {
      const leave = hoursApply ? answerMayLeave({ receivedAt: new Date(receivedAt), templateKey: t.outreach_templates?.key ?? null, now: deps.now }) : 'now'
      if (leave === 'outside hours') {
        report.outsideHours++
        continue
      }
      if (leave === 'too soon') {
        report.tooSoon = (report.tooSoon ?? 0) + 1
        continue
      }
    } else if (hoursApply && !inBusinessHours(deps.now, zone, sendWindowOf(sender.data))) {
      report.outsideHours++
      continue
    }
    // ONE SEND PATH, NO DOUBLES (the PM's 09:15 of 18 November 2026, item 2): a first letter to a contact who already has a
    // sent message (Lawal's own, recorded from hello@'s Sent Items by ./sent-sync.ts, or an earlier send) is never sent.
    if (t.outreach_templates?.key === 'segment_a_first') {
      const already = await db.from('outreach_touches').select('id, sent_at').eq('contact_id', t.contact_id).eq('state', 'sent').neq('id', t.id).limit(1)
      if (already.error) {
        report.refused.push({ id: t.id, reason: `whether they were already written could not be read: ${already.error.message}` })
        continue
      }
      const prior = (already.data ?? [])[0] as { id: string; sent_at: string | null } | undefined
      if (prior) {
        const why = `already written: a message to this contact went ${prior.sent_at ?? 'earlier'}, so no first letter goes again`
        await db.from('outreach_touches').update({ state: 'void', void_reason: why }).eq('id', t.id).eq('state', 'queued')
        report.refused.push({ id: t.id, reason: why })
        continue
      }
    }
    // ONE FIRST LETTER PER ORGANISER (the PM's 09:45 of 19 November 2026, item 1 (d)): a first letter never goes to an
    // organiser, or an organisation domain, already written to on another address or that has replied; a later night
    // rides in that thread. Here, at the one send path, so no planner, play or list can go round it.
    if (t.step === 1) {
      const record = await readFirstLetterRecord(db, { contactId: t.contact_id, touchId: t.id }, FIRST_LETTER_SENT)
      const why = record === null ? 'whether their organisation was already written to could not be read; not sent on a guess' : firstLetterBlocked(record)
      if (why) {
        if (record !== null) await db.from('outreach_touches').update({ state: 'void', void_reason: why }).eq('id', t.id).eq('state', 'queued')
        report.refused.push({ id: t.id, reason: why })
        continue
      }
    }
    // THE ONE CONTACT POLICY, AGAIN AT THE MINUTE IT WOULD LEAVE (Lawal, 23 November 2026, 01:51; ./contact-policy.ts):
    // every message to the organiser, its replies, suppression, opt outs and bounces are read again now, so a letter queued
    // before a reply, a stop, a bounce or another unsolicited letter is set aside with why and when, never sent. A read that
    // fails leaves it queued and says so: never sent on a guess.
    const policy = await readContactPolicy(
      db,
      { touchId: t.id, contactId: t.contact_id, purpose: t.purpose ?? '', step: t.step, templateKey: t.outreach_templates?.key ?? null, moment: 'send' },
      deps.now,
    )
    if (policy.state === 'unread') {
      report.refused.push({ id: t.id, reason: `whether they may be written to now could not be read: ${policy.why}; not sent on a guess` })
      continue
    }
    if (policy.state === 'held') {
      const why = decisionWords(policy).slice(0, 480)
      await db.from('outreach_touches').update({ state: 'void', void_reason: why }).eq('id', t.id).eq('state', 'queued')
      report.refused.push({ id: t.id, reason: why })
      report.policyHeld ??= []
      report.policyHeld.push({ id: t.id, rule: policy.rule, nextEligibleAt: policy.nextEligibleAt })
      continue
    }
    // ITS WORDS, READ AGAIN AT SEND TIME (the PM's 20:40 of 19 November 2026, item 2): every queued message passes the
    // voice gate's word rules (voice-gate.ts wordsProblems) here, at the one send path, so no play, planner or template
    // version can send words the gateway refuses; one that fails is voided with why, never sent, and is drafted again.
    const words = wordsProblems(t.body ?? '', readVoicePolicy())
    if (words.length > 0) {
      const why = `its words fail the voice gate at send time: ${words.join('; ')}`.slice(0, 480)
      await db.from('outreach_touches').update({ state: 'void', void_reason: why }).eq('id', t.id).eq('state', 'queued')
      report.refused.push({ id: t.id, reason: why })
      continue
    }
    const tooClose = await segmentATooClose(db, t, deps.now)
    if (tooClose) {
      await db.from('outreach_touches').update({ state: 'void', void_reason: tooClose }).eq('id', t.id).eq('state', 'queued')
      report.refused.push({ id: t.id, reason: tooClose })
      continue
    }
    // The claim: the database runs every check here, or refuses and the message stays queued.
    // ITS ADDRESS FIRST (law 33 (a)): a message whose type has no address is refused before it is claimed, never sent
    // from a guessed mailbox; it stays queued with the refusal said.
    // ONE CHANNEL PER CONVERSATION (Lawal, 25 November 2026, 14:41 and 14:43): from the mailbox of the newest message
    // between us, in that thread; only a first message goes from its category's address.
    const conversation = await readConversation(db, t.contact_id, t.id)
    if ('unread' in conversation) {
      report.refused.push({ id: t.id, reason: `${conversation.unread}; not sent from a guessed address` })
      continue
    }
    const from = mailboxFor({ category: t.comms_category, purpose: t.purpose ?? '', conversation: conversation.mailbox })
    if ('refused' in from) {
      report.refused.push({ id: t.id, reason: from.refused })
      continue
    }
    // THEIR STATED ADDRESS (Lawal's 14:43, item 2): an address they asked us to use instead, in their own words, is
    // written to from then on; one that has asked to stop is never written to.
    const contact = await db.from('organiser_contacts').select('address, unsubscribe_token, stated_address').eq('id', t.contact_id).single()
    if (contact.error) {
      report.refused.push({ id: t.id, reason: `the contact could not be read: ${contact.error.message}` })
      continue
    }
    const stated = ((contact.data as { stated_address?: string | null }).stated_address ?? '').trim().toLowerCase() || null
    // AN ANSWER GOES TO THE ADDRESS THEY WROTE FROM (Lawal's 14:43, item 1; the PM's 16:28): someone of the organisation
    // who wrote from another address in the thread is answered there, as the record of their message says.
    let wroteFrom: string | null = null
    if (!stated && t.in_reply_to) {
      const theirs = await db.from('outreach_message_mailboxes').select('counterpart_address, direction').eq('internet_message_id', t.in_reply_to).maybeSingle()
      const row = theirs.data as { counterpart_address?: string | null; direction?: string } | null
      if (!theirs.error && row?.direction === 'received' && row.counterpart_address) wroteFrom = row.counterpart_address.trim().toLowerCase()
    }
    const to = stated ?? wroteFrom ?? contact.data.address
    // An address other than the contact's own is never written to once it has asked to stop.
    if (to.toLowerCase() !== String(contact.data.address).toLowerCase()) {
      const stopped = await db.from('outreach_unsubscribes').select('email').eq('email', to).limit(1)
      if (stopped.error) {
        report.refused.push({ id: t.id, reason: `whether ${to} asked to stop could not be read: ${stopped.error.message}; not sent on a guess` })
        continue
      }
      if ((stopped.data ?? []).length > 0) {
        const why = `${stated ? 'their stated address' : 'the address they wrote from'} ${to} asked to stop: nothing goes to it`
        await db.from('outreach_touches').update({ state: 'void', void_reason: why }).eq('id', t.id).eq('state', 'queued')
        report.refused.push({ id: t.id, reason: why })
        continue
      }
    }
    // ONE MESSAGE, HOWEVER OFTEN IT IS TRIED (the PM's 01:52 of 23 November 2026, item 4): the claim moves the row from
    // queued to sending only where it is still queued, so of two runs, a retried run or Lawal's press racing the cron, one
    // takes it and the other is told 'taken by another run'; the database refuses any other move into sending
    // (outreach_touch_is_lawful: 'only a queued message is taken for sending'), and a send whose outcome is unknown is
    // closed failed by outreach_close_stuck_sends, never queued again by any code here.
    const claim = await db.from('outreach_touches').update({ state: 'sending' }).eq('id', t.id).eq('state', 'queued').select('id').maybeSingle()
    if (claim.error || !claim.data) {
      report.refused.push({ id: t.id, reason: claim.error?.message.replace(/^refused: /, '') ?? 'taken by another run' })
      continue
    }
    const thread = [...conversation.ids]
    const inReplyTo = t.in_reply_to ?? thread.at(-1) ?? null
    const messageId = newMessageId()
    try {
      const mime = buildOutreachMime({
        fromAddress: from.mailbox,
        fromName: deps.fromName ?? 'Lawal Adams',
        to,
        subject: t.subject ?? '',
        text: t.body,
        messageId,
        inReplyTo,
        references: thread,
        date: deps.now,
        origin: deps.origin,
        unsubscribeToken: contact.data.unsubscribe_token,
      })
      await transport.send({ to, base64Mime: mimeForGraph(mime), messageId, from: from.mailbox })
    } catch (error) {
      const reason = (error as Error).message.slice(0, 500)
      await db.from('outreach_touches').update({ state: 'failed', failed_reason: reason }).eq('id', t.id).eq('state', 'sending')
      report.failed.push({ id: t.id, reason })
      continue
    }
    const done = await db
      .from('outreach_touches')
      // provider names the transport that sent it: outreach_touches_sent_is_whole refuses a sent record without one, and
      // until 18 November 2026 this write left it out, so every send was delivered and then left 'sending' (the first
      // two approved ACQ letters, 14:00 and 14:15; recorded by hand from Sent Items, go/acq-provider-DRY-RUN.sql).
      .update({ state: 'sent', sent_at: new Date().toISOString(), internet_message_id: messageId, in_reply_to: inReplyTo, ...(transport.kind === 'graph' ? { provider: 'graph' as const } : {}) })
      .eq('id', t.id)
      .eq('state', 'sending')
      .select('id')
      .maybeSingle()
    // Sent but not recorded: left sending, so outreach_close_stuck_sends closes it as outcome unknown and it is never resent.
    if (done.error || !done.data) report.failed.push({ id: t.id, reason: `sent, but the record failed: ${done.error?.message ?? 'no row'}` })
    else report.sent.push(t.id)
    // Its mailbox, recorded once, so the conversation keeps to it (insert only; a retry finds it there).
    // A record that fails is said, and never undoes or repeats the send.
    try {
      const kept = await db.from('outreach_message_mailboxes').upsert({ internet_message_id: messageId, mailbox: from.mailbox, direction: 'sent' }, { onConflict: 'internet_message_id', ignoreDuplicates: true })
      if (kept.error) (report.mailboxNotRecorded ??= []).push(`${t.id}: ${kept.error.message}`)
    } catch (err) {
      ;(report.mailboxNotRecorded ??= []).push(`${t.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return report
}

/**
 * THE EXPIRY SWEEP (Lawal's 19:13 of 22 November 2026, section 11; the trace of 19:2x found none): every held or queued
 * letter that names an event is read against it now, and one the event no longer makes true (event-validity.ts) is
 * voided with its reason, so an expired opportunity leaves the automation. The organiser contact is never touched: the
 * relationship stays for their next event. Bounded per run; a failed read is said and voids nothing.
 */
export async function expireLapsedLetters(db: Admin, now: Date): Promise<{ readonly voided: readonly string[]; readonly unread: readonly string[] }> {
  const voided: string[] = []
  const unread: string[] = []
  const { data, error } = await db
    .from('outreach_touches')
    .select('id, state, body, outreach_templates(key)')
    .in('state', ['held', 'queued'])
    .like('body', '%/events/%')
    .order('drafted_at')
    .limit(300)
  if (error) return { voided, unread: [`the letters could not be read: ${error.message}`] }
  const letters = (data ?? []) as unknown as { id: string; state: string; body: string; outreach_templates: { key: string } | null }[]
  const slugs = [...new Set(letters.map((l) => eventSlugOf(l.body)).filter((s): s is string => s !== null))]
  if (slugs.length === 0) return { voided, unread }
  const events = await db.from('events').select('slug, start_date, end_date, status, timezone').in('slug', slugs)
  if (events.error) return { voided, unread: [`the events they name could not be read: ${events.error.message}`] }
  const bySlug = new Map(((events.data ?? []) as { slug: string; start_date: string; end_date: string | null; status: string | null; timezone: string | null }[]).map((e) => [e.slug, e]))
  for (const l of letters) {
    const slug = eventSlugOf(l.body)
    if (!slug) continue
    const e = bySlug.get(slug)
    const why = letterExpiry(l.outreach_templates?.key ?? '', e ? { startDate: e.start_date, endDate: e.end_date, status: e.status, timezone: e.timezone } : null, now)
    if (!why) continue
    const { error: uerr } = await db.from('outreach_touches').update({ state: 'void', void_reason: why.slice(0, 480) }).eq('id', l.id).eq('state', l.state as 'held' | 'queued')
    if (uerr) unread.push(`${l.id}: ${uerr.message}`)
    else voided.push(`${l.id}: ${why}`)
  }
  return { voided, unread }
}
