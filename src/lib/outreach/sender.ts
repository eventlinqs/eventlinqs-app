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
 * Monday to Friday, 9:00 to 17:00, read in the time zone of the city of a venue the organiser runs, else Melbourne.
 * The hours are EventLinqs' own choice (UNSOURCED: no rule names them); outside them a message stays queued.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildOutreachMime, mimeForGraph, newMessageId } from './mime'
import { graphSendMime, type GraphConfig } from './graph'

type Admin = SupabaseClient<Database>
type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export type SenderMode = 'hold' | 'test' | 'live'
export type OutgoingEmail = { to: string; base64Mime: string; messageId: string }
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
        if (graph) await graphSendMime(graph, m.base64Mime, fetchImpl)
        else recorded.push(m)
      },
    }
  }
  if (!graph) return null
  return { kind: 'graph', send: (m) => graphSendMime(graph, m.base64Mime, fetchImpl) }
}

/** True from 9:00 to before 17:00, Monday to Friday, in the given zone. */
export function inBusinessHours(at: Date, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(at)
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  return !['Sat', 'Sun'].includes(weekday) && hour >= 9 && hour < 17
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
  note?: string
}

type Queued = {
  id: string
  contact_id: string
  subject: string | null
  body: string
  in_reply_to: string | null
}

const BATCH = 25

/** The zone of the city of a venue the contact's organiser runs, else Melbourne. */
async function recipientZone(db: Admin, contactId: string): Promise<string> {
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
  deps: { now: Date; origin: string; graph: GraphConfig | null; fetchImpl?: Fetch; fromName?: string },
): Promise<SenderReport> {
  const sender = await db.from('outreach_sender').select('mode, from_address, test_domain').eq('id', true).single()
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

  const due = await db
    .from('outreach_touches')
    .select('id, contact_id, subject, body, in_reply_to')
    .eq('state', 'queued')
    .lte('scheduled_for', deps.now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(BATCH)
  if (due.error) throw new Error(`the queue: ${due.error.message}`)

  for (const t of (due.data ?? []) as Queued[]) {
    report.considered++
    if (!inBusinessHours(deps.now, await recipientZone(db, t.contact_id))) {
      report.outsideHours++
      continue
    }
    // The claim: the database runs every check here, or refuses and the message stays queued.
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
        fromAddress: sender.data.from_address,
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
      await transport.send({ to: contact.data.address, base64Mime: mimeForGraph(mime), messageId })
    } catch (error) {
      const reason = (error as Error).message.slice(0, 500)
      await db.from('outreach_touches').update({ state: 'failed', failed_reason: reason }).eq('id', t.id).eq('state', 'sending')
      report.failed.push({ id: t.id, reason })
      continue
    }
    const done = await db
      .from('outreach_touches')
      .update({ state: 'sent', sent_at: new Date().toISOString(), internet_message_id: messageId, in_reply_to: inReplyTo })
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
