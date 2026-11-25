import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Admin = SupabaseClient<Database>

/**
 * EVERY ACTIVE RECORD HAS A NEXT ACTION (Lawal's founder directive of 26 November 2026, 00:21, item H: "For each active
 * item, establish: current state, responsible workflow, next required action, scheduled execution time or triggering
 * condition, dependencies, failure or suppression reason ... A record must not silently disappear from processing
 * because its next action was never generated"; item I: "messages waiting indefinitely", "failed sending", "social
 * publication failures"; the PM's 00:21, H and I).
 *
 * Each active message, reply waiting on a person, and post schedule is given its owner, its next action and its time,
 * from its own row, by one rule each; a record whose next action has no owner that will act, or whose time has passed,
 * is a FAULT and the 08:00 report lists it. A finished, declined or set aside record (sent, void, published, a schedule
 * held with its reason) is terminal and never listed. Read only; nothing here changes a record.
 */
export type ActiveRecord = {
  readonly kind: 'message' | 'reply' | 'post'
  readonly id: string
  readonly state: string
  readonly owner: string
  readonly next: string
  readonly at: string | null
  /** Why it is a fault: no owner will act, or its time has passed. Null when it is on its way. */
  readonly fault: string | null
}

const HOUR = 3_600_000
/** A held letter older than this with nobody due to act is a fault. */
export const HELD_FAULT_HOURS = 24
/** A reply waiting on a person longer than this is a fault (the answer classes' slowest target is about four hours). */
export const PERSON_FAULT_HOURS = 4
/** A queued letter or a scheduled post this long past its time is a fault. */
export const LATE_FAULT_MINUTES = 60

/** The first letters the self queue queues by itself (./self-queue.ts SELF_QUEUED_FIRST_LETTERS). */
const SELF_QUEUED = new Set(['ACQ-FIRST', 'PERM-SOURCE'])

export type MessageRow = {
  readonly id: string
  readonly state: string
  readonly step: number | null
  readonly subtype: string | null
  readonly heldBecause: readonly string[]
  readonly draftedAt: string | null
  readonly scheduledFor: string | null
  readonly sendingAt?: string | null
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)
const ageHours = (iso: string | null | undefined, now: Date) => (now.getTime() - ms(iso)) / HOUR
const short = (id: string) => id.slice(0, 8)

/** One message's next action. Pure. */
export function messageNext(t: MessageRow, now: Date): ActiveRecord {
  const base = { kind: 'message' as const, id: t.id, state: t.state }
  if (t.state === 'queued') {
    const late = ms(t.scheduledFor) < now.getTime() - LATE_FAULT_MINUTES * 60_000
    return { ...base, owner: 'the sender', next: 'sent in its window', at: t.scheduledFor, fault: late ? `queued for ${t.scheduledFor} and not sent: waiting past its time` : null }
  }
  if (t.state === 'sending') {
    const stuck = ageHours(t.sendingAt ?? t.scheduledFor, now) * 60 > 15
    return { ...base, owner: 'the sender', next: 'ends sent or failed', at: null, fault: stuck ? 'being sent for over 15 minutes: the sender closes it as failed' : null }
  }
  if (t.state === 'failed') return { ...base, owner: 'the sender', next: 'queued again or set aside', at: null, fault: 'its send failed and nothing has queued it again or set it aside' }
  // held
  const old = ageHours(t.draftedAt, now) > HELD_FAULT_HOURS
  const reasons = t.heldBecause.filter((r) => r.trim() !== '')
  if (reasons.some((r) => /^held on the PM's order/i.test(r))) {
    return { ...base, owner: 'the PM', next: "the PM's decision", at: null, fault: old ? `held on the PM's order since ${t.draftedAt?.slice(0, 10)} with no decision time: ${reasons[0].slice(0, 120)}` : null }
  }
  if (reasons.length > 0) {
    return { ...base, owner: 'the drafter', next: "drafted again from today's facts", at: null, fault: old ? `held since ${t.draftedAt?.slice(0, 10)} for '${reasons[0].slice(0, 100)}' and nothing drafts it again` : null }
  }
  if ((t.step ?? 1) === 1 && t.subtype !== null && SELF_QUEUED.has(t.subtype)) {
    return { ...base, owner: 'the self queue', next: 'queues itself when its approval and page check clear', at: null, fault: old ? `held since ${t.draftedAt?.slice(0, 10)} and the self queue has not queued it` : null }
  }
  return { ...base, owner: 'the daily queue', next: 'approved and sent', at: null, fault: old ? `held since ${t.draftedAt?.slice(0, 10)} waiting for an approval nobody is due to give` : null }
}

/** One reply that waits on a person. Pure. */
export function replyNext(r: { readonly id: string; readonly receivedAt: string | null }, now: Date): ActiveRecord {
  const late = ageHours(r.receivedAt, now) > PERSON_FAULT_HOURS
  return { kind: 'reply', id: r.id, state: 'needs the PM', owner: 'the PM', next: 'decided and answered', at: null, fault: late ? `waiting on a person since ${r.receivedAt}` : null }
}

/** One scheduled post. Pure. */
export function postNext(p: { readonly id: string; readonly goAt: string | null; readonly platform: string }, now: Date): ActiveRecord {
  const late = ms(p.goAt) < now.getTime() - LATE_FAULT_MINUTES * 60_000
  return { kind: 'post', id: p.id, state: 'scheduled', owner: 'the publisher', next: `published on ${p.platform}`, at: p.goAt, fault: late ? `scheduled for ${p.goAt} on ${p.platform} and not published` : null }
}

/** The report's line. Pure. */
export function nextActionsLine(records: readonly ActiveRecord[]): string {
  const faults = records.filter((r) => r.fault !== null)
  const count = (k: ActiveRecord['kind']) => records.filter((r) => r.kind === k).length
  const head = `${records.length} active (${count('message')} messages, ${count('reply')} replies waiting on a person, ${count('post')} posts scheduled)`
  if (faults.length === 0) return `${head}; every one has its next action and its time.`
  const listed = faults.slice(0, 10).map((f) => `${f.kind} ${short(f.id)}: ${f.fault}`)
  return `${head}; ${faults.length} WITHOUT A NEXT ACTION OR PAST ITS TIME: ${listed.join('; ')}${faults.length > 10 ? `; and ${faults.length - 10} more` : ''}.`
}

/** Every active record, read from production; a read that fails throws, and the report says so. */
export async function readNextActions(db: Admin, now: Date): Promise<ActiveRecord[]> {
  const t = await db
    .from('outreach_touches')
    .select('id, state, step, comms_subtype, held_because, drafted_at, scheduled_for, sending_at')
    .in('state', ['held', 'queued', 'sending', 'failed'])
    .limit(2000)
  if (t.error) throw new Error(`the active messages could not be read: ${t.error.message}`)
  const r = await db.from('outreach_replies').select('id, received_at').eq('needs_lawal', true).is('action_taken', null).limit(500)
  if (r.error) throw new Error(`the replies waiting on a person could not be read: ${r.error.message}`)
  const p = await db.from('social_piece_schedules').select('id, go_at, platform').eq('state', 'scheduled').limit(500)
  if (p.error) throw new Error(`the scheduled posts could not be read: ${p.error.message}`)
  return [
    ...((t.data ?? []) as { id: string; state: string; step: number | null; comms_subtype: string | null; held_because: string[] | null; drafted_at: string | null; scheduled_for: string | null; sending_at: string | null }[]).map((x) =>
      messageNext({ id: x.id, state: x.state, step: x.step, subtype: x.comms_subtype, heldBecause: x.held_because ?? [], draftedAt: x.drafted_at, scheduledFor: x.scheduled_for, sendingAt: x.sending_at }, now),
    ),
    ...((r.data ?? []) as { id: string; received_at: string | null }[]).map((x) => replyNext({ id: x.id, receivedAt: x.received_at }, now)),
    ...((p.data ?? []) as { id: string; go_at: string | null; platform: string }[]).map((x) => postNext({ id: x.id, goAt: x.go_at, platform: x.platform }, now)),
  ]
}
