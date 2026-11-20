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
import { firstLetterBlocked, organisationDomain, type LetterRecord } from './one-first-letter'
import { mailboxFor } from './addresses'

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
  outreach_templates: { key: string } | null
}

/**
 * What the one-first-letter rule reads (./one-first-letter.ts): the candidate's contact and organiser, and every message
 * sent to, and every reply from, a contact of the same organiser or an address at the same organisation domain. A read
 * that fails answers null, and the letter is not sent on a guess.
 */
async function readFirstLetterRecord(db: Admin, t: Queued): Promise<LetterRecord | null> {
  const me = await db.from('organiser_contacts').select('id, organiser_id, address').eq('id', t.contact_id).single()
  if (me.error) return null
  const organiserId = me.data.organiser_id as string
  const address = (me.data.address as string | null) ?? ''
  const theirs = await db.from('organiser_contacts').select('id, organiser_id, address').eq('organiser_id', organiserId)
  if (theirs.error) return null
  const domain = organisationDomain(address)
  const sameDomain = domain ? await db.from('organiser_contacts').select('id, organiser_id, address').ilike('address', `%@${domain}`) : { data: [], error: null }
  if (sameDomain.error) return null
  const contacts = new Map<string, { organiserId: string; address: string }>()
  for (const c of [...(theirs.data ?? []), ...(sameDomain.data ?? [])]) {
    contacts.set(c.id as string, { organiserId: c.organiser_id as string, address: (c.address as string | null) ?? '' })
  }
  const ids = [...contacts.keys()]
  const sent = await db.from('outreach_touches').select('contact_id, sent_at').in('contact_id', ids).eq('state', 'sent').neq('id', t.id)
  if (sent.error) return null
  const replies = await db.from('outreach_replies').select('contact_id, received_at').in('contact_id', ids)
  if (replies.error) return null
  const who = (id: string) => contacts.get(id) ?? { organiserId: '', address: '' }
  return {
    candidate: { contactId: t.contact_id, organiserId, address },
    sent: (sent.data ?? []).map((s) => ({ contactId: s.contact_id as string, ...who(s.contact_id as string), sentAt: (s.sent_at as string | null) ?? null })),
    replies: (replies.data ?? []).map((r) => ({ contactId: r.contact_id as string, ...who(r.contact_id as string), receivedAt: (r.received_at as string | null) ?? null })),
  }
}

/**
 * THE TIMING RULE, AGAIN AT THE MOMENT OF SENDING (the communication standard's Part 2 rule 4: no message about an event
 * lands on or after its day, and a segment A letter goes only while its night is 3 or more days ahead). A segment A letter
 * queued on a Friday afternoon and held over a weekend could otherwise land too close: before it is claimed, the night it
 * names (its /events/ page) is read again, and a letter that would now land too close is set aside with why, never sent.
 * Null means it may go.
 */
async function segmentATooClose(db: Admin, t: Queued, now: Date): Promise<string | null> {
  if (!t.outreach_templates?.key.startsWith('segment_a_')) return null
  const slug = t.body.match(/\/events\/([a-z0-9-]+)/)?.[1]
  if (!slug) return 'it names no night of theirs to check the timing against'
  const ev = await db.from('events').select('start_date, timezone').eq('slug', slug).maybeSingle()
  if (ev.error || !ev.data) return `its night could not be read again: ${ev.error?.message ?? 'no such night'}`
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

/** The earlier messages to this contact, oldest first, so a reply sits in the thread. */
async function threadIds(db: Admin, contactId: string, excludeId: string): Promise<string[]> {
  const r = await db
    .from('outreach_touches')
    .select('internet_message_id, sent_at')
    .eq('contact_id', contactId)
    .eq('state', 'sent')
    .neq('id', excludeId)
    .not('internet_message_id', 'is', null)
    .order('sent_at', { ascending: true })
  return (r.data ?? []).map((x) => x.internet_message_id as string)
}

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
    .select('id, contact_id, step, purpose, comms_category, subject, body, in_reply_to, scheduled_for, outreach_templates(key)')
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
    if (hoursApply && !inBusinessHours(deps.now, zone, sendWindowOf(sender.data))) {
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
      const record = await readFirstLetterRecord(db, t)
      const why = record === null ? 'whether their organisation was already written to could not be read; not sent on a guess' : firstLetterBlocked(record)
      if (why) {
        if (record !== null) await db.from('outreach_touches').update({ state: 'void', void_reason: why }).eq('id', t.id).eq('state', 'queued')
        report.refused.push({ id: t.id, reason: why })
        continue
      }
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
    const from = mailboxFor({ category: t.comms_category, purpose: t.purpose ?? '' })
    if ('refused' in from) {
      report.refused.push({ id: t.id, reason: from.refused })
      continue
    }
    const claim = await db.from('outreach_touches').update({ state: 'sending' }).eq('id', t.id).eq('state', 'queued').select('id').maybeSingle()
    if (claim.error || !claim.data) {
      report.refused.push({ id: t.id, reason: claim.error?.message.replace(/^refused: /, '') ?? 'taken by another run' })
      continue
    }
    const contact = await db.from('organiser_contacts').select('address, unsubscribe_token').eq('id', t.contact_id).single()
    const thread = await threadIds(db, t.contact_id, t.id)
    const inReplyTo = t.in_reply_to ?? thread.at(-1) ?? null
    const messageId = newMessageId()
    try {
      if (contact.error) throw new Error(`the contact: ${contact.error.message}`)
      const mime = buildOutreachMime({
        fromAddress: from.mailbox,
        fromName: deps.fromName ?? 'Lawal Adams',
        to: contact.data.address,
        subject: t.subject ?? '',
        text: t.body,
        messageId,
        inReplyTo,
        references: thread,
        date: deps.now,
        origin: deps.origin,
        unsubscribeToken: contact.data.unsubscribe_token,
      })
      await transport.send({ to: contact.data.address, base64Mime: mimeForGraph(mime), messageId, from: from.mailbox })
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
  }
  return report
}
