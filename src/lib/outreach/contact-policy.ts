/**
 * ONE CONTACT POLICY, READ BY EVERY WORKFLOW BEFORE IT DRAFTS AND AGAIN AT SEND (Lawal, 23 November 2026, 01:51, through
 * the PM's 01:52, item 2: "do not replace it with another rigid rule"; "different message types must not become a
 * loophole for repeatedly contacting the same organiser").
 *
 * THE CASE BEHIND IT. At 01:30 on 23 November the database refused law 49's free promotion offer (lifecycle_acq, ACQ) for
 * all twelve organisers of Monday's cohort, because each had a permission letter (PERM-IMAGE) sent at step 1 on
 * 18 November (Geelong Gallery on 20 November) and the index of 28 October allowed one step 1 letter per contact. The
 * index now says only what makes a message a DUPLICATE (its purpose, its context, its step: migration 20261123020001).
 * Whether an organiser may be written to at all, and when, is decided here, once, for every purpose, by reading every
 * message to that ORGANISER (all its contacts) across all categories, its replies, its suppression, its opt outs and its
 * bounces.
 *
 * THE PRECEDENCE, exactly as ruled:
 *   1. suppression, opt out and bounce stop everything: an address of theirs on the suppression list
 *      (outreach_unsubscribes) or a stop or take down by reply from any of their contacts holds every category to every
 *      address of theirs; a hard bounce (outreach_delivery_events) holds every category to that address. The one message
 *      that may still go is the single confirmation of the stop to the contact who asked (the database allows it once:
 *      outreach_contact_refusal_for);
 *   2. a reply from any of their contacts moves the organiser out of cold sequences (purpose cadence, first letters and
 *      follow ups alike) into the reply's own handling (purpose reply, then relationship after a yes);
 *   3. a claimed organiser (organisers.organisation_id names their account: migration 20261028201001, section 7, and the
 *      pipeline's 'claimed' stage) or a partner (a contact of theirs said yes or interested, or gave their own words of
 *      consent, basis express_consent: the partner of planner.ts planRelationship) follows its own flow, never a cold one;
 *   4. then frequency: at most one unsolicited first touch (purpose cadence, step 1) to an organiser inside
 *      CONTACT_GAP_DAYS after any unanswered unsolicited message to any of their addresses, in any category; a sequence's
 *      own scheduled follow up (step 2 or 3) is excepted. Before drafting, a letter already queued or being sent counts as
 *      written; at send, only one being sent or sent does, so two queued letters never hold each other and the first to
 *      go holds the other;
 *   and, after 1, a partner's message (purpose relationship) waits while our newest message that asked something is not
 *      answered, at most the gap (ONE OPEN MESSAGE: Lawal, 26 November 2026, 00:01; oneOpenMessage below).
 * It answers allowed, or held with the rule, the reason in words and the next eligible moment (null: not by waiting).
 *
 * PURE at its core (contactDecision); readContactPolicy is its one reader, and a read that fails is never a guess.
 */
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Admin = SupabaseClient<Database>

/**
 * THE MINIMUM GAP, IN DAYS, between an unanswered unsolicited message to an organiser and the next unsolicited first
 * letter to them of another purpose, a sequence's own scheduled follow ups excepted. RULED by the PM at 03:47 of
 * 23 November 2026 (Lawal's 01:51: one contact policy, "not another rigid rule"), SOURCED: Unify's knowledge base,
 * "enabling re-enrollment into different sequences after 30-60 days (to avoid over-contacting prospects)", its default
 * period 45 to 90 days (https://support.unifygtm.com/articles/9341974144); and Outreach's sequence ruleset setting
 * "Prospects must not have been contacted within the last" (https://support.outreach.io/hc/en-us/articles/217723638),
 * the same control as a configurable latency. 30 is the low end of the cited range, chosen because our letters are about
 * dated events. One value here, changed only by a ruling or by its reversal condition below; never typed into a workflow.
 * REVERSAL, read by the engine: any organiser reply or opt out since the ruling that names frequency moves it to
 * CONTACT_GAP_DAYS_RAISED (45), the start of the cited default range (gapDaysFrom).
 */
export const CONTACT_GAP_DAYS = 30
export const CONTACT_GAP_DAYS_RAISED = 45
export const CONTACT_GAP_RULED_AT = '2026-11-23T03:47:00+11:00'
export const CONTACT_GAP_SOURCE =
  'Ruled by the PM, 03:47 of 23 November 2026: 30 days, the low end of Unify (support.unifygtm.com/articles/9341974144, re-enrollment after 30-60 days) and Outreach (support.outreach.io/hc/en-us/articles/217723638, a configurable "not contacted within the last" latency); 45 once a reply or opt out names frequency'

/** Words that name contact frequency in a reply or an opt out ("too many emails", "too often", "stop emailing me"). */
const NAMES_FREQUENCY = /\b(too (many|often|frequent(ly)?)|so many (e-?mails|messages|letters)|(stop|keep) (e-?mailing|emailing|writing|contacting|messaging)|every (day|week)|again and again|spam(ming)?)\b/i

/** The gap in force: raised to 45 when any reply or opt out since the ruling names frequency (the reversal). Pure. */
export function gapDaysFrom(texts: readonly (string | null | undefined)[]): number {
  return texts.some((t) => typeof t === 'string' && NAMES_FREQUENCY.test(t)) ? CONTACT_GAP_DAYS_RAISED : CONTACT_GAP_DAYS
}

const DAY_MS = 86_400_000

/** The one confirmation that may still reach a stopped contact (the database allows each once). */
const STOP_CONFIRMATIONS: ReadonlySet<string> = new Set(['reply_stop', 'reply_take_down'])

export type PolicyRule = 'suppressed' | 'opted out' | 'bounced' | 'replied' | 'own flow' | 'gap' | 'open'

/** The messages of ours that ask something of them: a cold letter or a partner's message. An answer of ours asks nothing. */
const ASKS: ReadonlySet<string> = new Set(['cadence', 'relationship'])

/** A partner's message that answers their own act (a withdrawal, its two promises kept): never held by one open message. */
const KEEPS_A_PROMISE: ReadonlySet<string> = new Set(['withdrawal_confirmed'])

export type PolicyDecision =
  | { readonly state: 'allowed' }
  | { readonly state: 'held'; readonly rule: PolicyRule; readonly reason: string; readonly nextEligibleAt: string | null }

export type PolicyCandidate = {
  /** At send, the queued letter itself, left out of its own history. */
  readonly touchId?: string | null
  readonly contactId: string
  /** cadence (unsolicited), relationship (a partner's), reply (an answer to them). */
  readonly purpose: string
  readonly step: number | null
  readonly templateKey: string | null
  /** draft: before a word is written; send: at the minute it would leave. */
  readonly moment: 'draft' | 'send'
}

export type PolicyHistory = {
  readonly organiserId: string
  /** Every contact of the organiser. */
  readonly contacts: readonly { readonly id: string; readonly address: string; readonly basis: string | null }[]
  /** Every non void message to any of them, the candidate itself left out. */
  readonly touches: readonly {
    readonly id: string
    readonly contactId: string
    readonly purpose: string
    readonly step: number | null
    readonly category: string | null
    readonly state: string
    readonly sentAt: string | null
    readonly scheduledFor: string | null
  }[]
  readonly replies: readonly { readonly contactId: string; readonly outcome: string; readonly receivedAt: string | null }[]
  /** Their addresses on the suppression list, with when. */
  readonly suppressed: readonly { readonly address: string; readonly at: string | null }[]
  /** Their contacts a hard bounce came back from, with when. */
  readonly bounced: readonly { readonly contactId: string; readonly at: string | null }[]
  /** organisers.organisation_id is set: they hold an EventLinqs account. */
  readonly claimed: boolean
  /** The gap in force, in days (gapDaysFrom: 45 once any reply or opt out since the ruling names frequency, else 30). */
  readonly gapDays?: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A Melbourne date in words, '18 Dec 2026', built from its parts so no locale's abbreviation can change it. Pure. */
export function melbourneDateWords(iso: string | null): string {
  if (!iso) return 'an earlier date'
  const parts = new Intl.DateTimeFormat('en-CA', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Australia/Melbourne' }).formatToParts(new Date(iso))
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  return `${n('day')} ${MONTHS[n('month') - 1] ?? '?'} ${n('year')}`
}

const held = (rule: PolicyRule, reason: string, nextEligibleAt: string | null = null): PolicyDecision => ({ state: 'held', rule, reason, nextEligibleAt })

/** An instant as a number, so two spellings of one timestamp (Z or +00:00) compare as one. Unknown reads as the epoch. */
const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) || 0 : 0)

const earliest = <T extends { at: string | null }>(xs: readonly T[]): T | undefined => [...xs].sort((a, b) => ms(a.at) - ms(b.at))[0]

/** Whether a reply is a person writing back (a bounce logged as an outcome is not). */
const isReply = (outcome: string) => outcome !== 'bounce'

/** The decision for one message to one contact, from everything already sent to and heard from its organiser. Pure. */
export function contactDecision(c: PolicyCandidate, h: PolicyHistory, now: Date): PolicyDecision {
  const me = h.contacts.find((x) => x.id === c.contactId)
  const myAddress = (me?.address ?? '').toLowerCase()
  const confirmation = c.purpose === 'reply' && c.templateKey !== null && STOP_CONFIRMATIONS.has(c.templateKey)

  // 1. Suppression, opt out and bounce stop everything.
  const suppressed = earliest(h.suppressed)
  if (suppressed && !(confirmation && h.suppressed.some((s) => s.address.toLowerCase() === myAddress))) {
    return held('suppressed', `${suppressed.address} asked to stop on ${melbourneDateWords(suppressed.at)}: nothing more goes to this organiser, in any category`)
  }
  const stops = h.replies.filter((r) => r.outcome === 'stop' || r.outcome === 'take_down').map((r) => ({ ...r, at: r.receivedAt }))
  const stop = earliest(stops)
  if (stop && !(confirmation && stops.some((s) => s.contactId === c.contactId))) {
    const who = h.contacts.find((x) => x.id === stop.contactId)?.address ?? 'one of their contacts'
    return held('opted out', `${who} asked by reply on ${melbourneDateWords(stop.at)} to stop: nothing more goes to this organiser, in any category`)
  }
  const bounce = earliest(h.bounced.filter((b) => b.contactId === c.contactId))
  if (bounce) return held('bounced', `${me?.address ?? 'this address'} bounced on ${melbourneDateWords(bounce.at)}: nothing more goes to it, in any category`)

  if (c.purpose === 'relationship') return c.templateKey !== null && KEEPS_A_PROMISE.has(c.templateKey) ? { state: 'allowed' } : oneOpenMessage(c, h, now)
  if (c.purpose !== 'cadence') return { state: 'allowed' }

  // 2. A reply moves the organiser out of cold sequences, into the reply's own handling.
  const reply = [...h.replies].filter((r) => isReply(r.outcome)).sort((a, b) => ms(b.receivedAt) - ms(a.receivedAt))[0]
  if (reply) {
    const who = h.contacts.find((x) => x.id === reply.contactId)?.address ?? 'one of their contacts'
    return held('replied', `${who} replied on ${melbourneDateWords(reply.receivedAt)} (${reply.outcome}): the organiser is answered in that thread, never written to cold again`)
  }

  // 3. A claimed or partner organiser follows its own flow.
  if (h.claimed) return held('own flow', 'the organiser holds an EventLinqs account: it is written to in its own flow, never a cold sequence')
  if (h.contacts.some((x) => x.basis === 'express_consent')) {
    return held('own flow', 'a contact of the organiser gave their own consent, so it is a partner: written to in the partner flow, never a cold sequence')
  }

  // 4. Frequency: one unsolicited first touch inside the gap, a sequence's own scheduled follow up excepted.
  if ((c.step ?? 1) > 1) return { state: 'allowed' }
  const gapDays = h.gapDays ?? CONTACT_GAP_DAYS
  const gap = gapDays * DAY_MS
  const cold = h.touches.filter((t) => t.purpose === 'cadence')
  const inFlight = cold.filter((t) => (c.moment === 'draft' ? ['queued', 'sending'] : ['sending']).includes(t.state))[0]
  if (inFlight) {
    const from = inFlight.scheduledFor && Date.parse(inFlight.scheduledFor) > now.getTime() ? Date.parse(inFlight.scheduledFor) : now.getTime()
    const at = new Date(from + gap).toISOString()
    const to = h.contacts.find((x) => x.id === inFlight.contactId)?.address ?? 'them'
    const kind = inFlight.category ? `${inFlight.category} ` : ''
    return held('gap', `an unsolicited ${kind}letter to ${to} is already on its way; one unsolicited first letter per ${gapDays} days, so the next may go from ${melbourneDateWords(at)}`, at)
  }
  const unanswered = cold
    .filter((t) => t.state === 'sent' && t.sentAt)
    .filter((t) => !h.replies.some((r) => isReply(r.outcome) && r.receivedAt !== null && ms(r.receivedAt) > ms(t.sentAt)))
    .sort((a, b) => ms(b.sentAt) - ms(a.sentAt))
  const last = unanswered[0]
  if (last && Date.parse(last.sentAt as string) + gap > now.getTime()) {
    const at = new Date(Date.parse(last.sentAt as string) + gap).toISOString()
    const to = h.contacts.find((x) => x.id === last.contactId)?.address ?? 'them'
    const kind = last.category ? `${last.category} ` : ''
    return held(
      'gap',
      `last written unsolicited on ${melbourneDateWords(last.sentAt)} (a ${kind}letter to ${to}) and not answered; one unsolicited first letter per ${gapDays} days, so the next may go from ${melbourneDateWords(at)}`,
      at,
    )
  }
  return { state: 'allowed' }
}

/**
 * ONE OPEN MESSAGE (Lawal, 26 November 2026, 00:01: "You can't be doing too many back-and-forth communications ... it's
 * better than just bombarding the user with too many emails"; the PM's 00:02, item A: "No second message to the same
 * contact while one is unanswered, except the approved follow ups when nothing came back"). A partner's message
 * (purpose relationship) waits while our newest message to the organiser that asked something (a cold letter or a
 * partner's message, to any of their addresses) is on its way or sent and not answered by any of them; it waits at most
 * the gap in force, never forever. Its due goals ride in the next message we send anyway (./goals.ts). A cold sequence's
 * own follow ups keep their place in the frequency rule below, and an answer to them (purpose reply) is never held by it.
 * Before drafting, a message queued or being sent counts as on its way; at send, only one being sent does. Pure.
 */
function oneOpenMessage(c: PolicyCandidate, h: PolicyHistory, now: Date): PolicyDecision {
  const gapDays = h.gapDays ?? CONTACT_GAP_DAYS
  const gap = gapDays * DAY_MS
  const asks = h.touches.filter((t) => ASKS.has(t.purpose))
  const inFlight = asks.find((t) => (c.moment === 'draft' ? ['queued', 'sending'] : ['sending']).includes(t.state))
  if (inFlight) {
    const from = inFlight.scheduledFor && Date.parse(inFlight.scheduledFor) > now.getTime() ? Date.parse(inFlight.scheduledFor) : now.getTime()
    const at = new Date(from + gap).toISOString()
    const to = h.contacts.find((x) => x.id === inFlight.contactId)?.address ?? 'them'
    const kind = inFlight.category ? `${inFlight.category} ` : ''
    return held('open', `a ${kind}message to ${to} is already on its way; one message at a time, so this waits for their answer, or ${melbourneDateWords(at)} at the latest`, at)
  }
  const last = asks.filter((t) => t.state === 'sent' && t.sentAt).sort((a, b) => ms(b.sentAt) - ms(a.sentAt))[0]
  if (!last) return { state: 'allowed' }
  const answered = h.replies.some((r) => isReply(r.outcome) && r.receivedAt !== null && ms(r.receivedAt) > ms(last.sentAt))
  const until = ms(last.sentAt) + gap
  if (answered || until <= now.getTime()) return { state: 'allowed' }
  const at = new Date(until).toISOString()
  const to = h.contacts.find((x) => x.id === last.contactId)?.address ?? 'them'
  const kind = last.category ? `${last.category} ` : ''
  return held(
    'open',
    `our ${kind}message to ${to} on ${melbourneDateWords(last.sentAt)} is not answered yet; one message at a time, so this waits for their answer, or ${melbourneDateWords(at)} at the latest`,
    at,
  )
}

/**
 * WHAT A MESSAGE IS ABOUT, as the duplicate key reads it (outreach_touches.context_key, migration 20261123020001): the one
 * spelling of each context, so two workflows writing about the same night write the same key. A follow up passes its
 * first letter's context, never its own. Pure.
 */
export const contextKeys = {
  event: (eventId: string) => `event:${eventId}`,
  play: (playId: string) => `play:${playId}`,
  page: (pageUrl: string, startsOn: string) => `page:${pageUrl}|${startsOn}`,
  report: (reportId: string) => `report:${reportId}`,
  kit: (pieceId: string) => `kit:${pieceId}`,
  withdrawal: (permissionId: string) => `withdrawal:${permissionId}`,
  reply: (internetMessageId: string) => `reply:${internetMessageId}`,
} as const

/** A decision in one line for a record or a log: the rule, the reason and the next eligible date. Pure. */
export function decisionWords(d: Extract<PolicyDecision, { state: 'held' }>): string {
  return `held by the contact policy (${d.rule}): ${d.reason}`
}

/** One organiser's messages read in one answer; more than this is never decided on a part. */
const HISTORY_CEILING = 1000

export type PolicyRead = { readonly state: 'read'; readonly history: PolicyHistory } | { readonly state: 'unread'; readonly why: string }

/**
 * Everything the policy reads for one contact's organiser, from production's own rows: its contacts, every non void
 * message to any of them (the candidate left out), their replies, their addresses on the suppression list, the hard
 * bounces of what was sent them, and whether the organiser holds an account. A read that fails, or a history at the
 * ceiling, answers unread with why, and nothing is decided on it.
 */
export async function readContactHistory(db: Admin, contactId: string, excludeTouchId: string | null = null): Promise<PolicyRead> {
  const me = await db.from('organiser_contacts').select('id, organiser_id').eq('id', contactId).maybeSingle()
  if (me.error || !me.data) return { state: 'unread', why: `the contact could not be read${me.error ? `: ${me.error.message}` : ''}` }
  const organiserId = me.data.organiser_id as string
  // The platform's own listings organisation and every test organiser are never written to (src/lib/growth/platform-organiser.ts,
  // the one reader of them; the guard growth-reads-skip-the-platform): nothing is decided for them.
  if ((await readPlatformOrganiserIds(db)).has(organiserId)) return { state: 'unread', why: "the platform's own listings organisation, or a test organiser" }
  const theirs = await db.from('organiser_contacts').select('id, address, basis').eq('organiser_id', organiserId).limit(HISTORY_CEILING)
  if (theirs.error) return { state: 'unread', why: `their contacts could not be read: ${theirs.error.message}` }
  const contacts = (theirs.data ?? []).map((x) => ({ id: x.id as string, address: String(x.address ?? ''), basis: (x.basis as string | null) ?? null }))
  if (!contacts.some((x) => x.id === contactId)) contacts.push({ id: contactId, address: '', basis: null })
  const ids = contacts.map((x) => x.id)
  const org = await db.from('organisers').select('organisation_id').eq('id', organiserId).maybeSingle()
  if (org.error) return { state: 'unread', why: `the organiser could not be read: ${org.error.message}` }
  const touches = await db
    .from('outreach_touches')
    .select('id, contact_id, purpose, step, comms_category, state, sent_at, scheduled_for')
    .in('contact_id', ids)
    .neq('state', 'void')
    .limit(HISTORY_CEILING)
  if (touches.error) return { state: 'unread', why: `their messages could not be read: ${touches.error.message}` }
  if ((touches.data ?? []).length >= HISTORY_CEILING) return { state: 'unread', why: `more than ${HISTORY_CEILING - 1} messages to them; not decided on a part` }
  const replies = await db.from('outreach_replies').select('contact_id, outcome, received_at').in('contact_id', ids).limit(HISTORY_CEILING)
  if (replies.error) return { state: 'unread', why: `their replies could not be read: ${replies.error.message}` }
  const addresses = contacts.map((x) => x.address.toLowerCase()).filter((a) => a.includes('@'))
  const unsubs = addresses.length
    ? await db.from('outreach_unsubscribes').select('email, created_at').in('email', addresses).limit(HISTORY_CEILING)
    : { data: [] as { email: string | null; created_at: string }[], error: null }
  if (unsubs.error) return { state: 'unread', why: `the suppression list could not be read: ${unsubs.error.message}` }
  const rows = (touches.data ?? []).filter((t) => t.id !== excludeTouchId)
  const sentIds = (touches.data ?? []).filter((t) => t.state === 'sent').map((t) => t.id as string)
  const bounces = sentIds.length
    ? await db.from('outreach_delivery_events').select('touch_id, occurred_at').in('touch_id', sentIds).eq('kind', 'bounce_hard').limit(HISTORY_CEILING)
    : { data: [] as { touch_id: string; occurred_at: string }[], error: null }
  if (bounces.error) return { state: 'unread', why: `their bounces could not be read: ${bounces.error.message}` }
  const contactOfTouch = new Map((touches.data ?? []).map((t) => [t.id as string, t.contact_id as string]))
  // THE REVERSAL (the PM's 03:47 of 23 November 2026): every reply and opt out since the ruling, from any organiser, read
  // for words that name frequency; one such moves the gap to 45. A failed read keeps the higher gap, never the lower.
  const sinceRuling = new Date(CONTACT_GAP_RULED_AT).toISOString()
  const said = await db.from('outreach_replies').select('wording, objection').gte('received_at', sinceRuling).limit(HISTORY_CEILING)
  const left = await db.from('outreach_unsubscribes').select('reason, comment').gte('created_at', sinceRuling).limit(HISTORY_CEILING)
  const gapDays =
    said.error || left.error
      ? CONTACT_GAP_DAYS_RAISED
      : gapDaysFrom([
          ...(said.data ?? []).flatMap((r) => [r.wording as string | null, r.objection as string | null]),
          ...(left.data ?? []).flatMap((u) => [u.reason as string | null, u.comment as string | null]),
        ])
  return {
    state: 'read',
    history: {
      organiserId,
      contacts,
      touches: rows.map((t) => ({
        id: t.id as string,
        contactId: t.contact_id as string,
        purpose: String(t.purpose ?? ''),
        step: (t.step as number | null) ?? null,
        category: (t.comms_category as string | null) ?? null,
        state: String(t.state),
        sentAt: (t.sent_at as string | null) ?? null,
        scheduledFor: (t.scheduled_for as string | null) ?? null,
      })),
      replies: (replies.data ?? []).map((r) => ({ contactId: r.contact_id as string, outcome: String(r.outcome ?? ''), receivedAt: (r.received_at as string | null) ?? null })),
      suppressed: (unsubs.data ?? []).filter((u) => u.email).map((u) => ({ address: String(u.email), at: (u.created_at as string | null) ?? null })),
      bounced: (bounces.data ?? []).map((b) => ({ contactId: contactOfTouch.get(b.touch_id as string) ?? '', at: (b.occurred_at as string | null) ?? null })),
      claimed: Boolean(org.data?.organisation_id),
      gapDays,
    },
  }
}

/** The policy for one message, read now: allowed, held with why and when, or unread with why (never sent on a guess). */
export async function readContactPolicy(db: Admin, c: PolicyCandidate, now: Date): Promise<PolicyDecision | { readonly state: 'unread'; readonly why: string }> {
  const read = await readContactHistory(db, c.contactId, c.touchId ?? null)
  if (read.state === 'unread') return read
  return contactDecision(c, read.history, now)
}
