import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { confirmPageChecked } from './crm'
import { readTouchVoice } from './daily-queue'
import type { GraphConfig } from './graph'
import { runOutreachSender } from './sender'
import { approvalProblems, readVoicePolicy, type VoicePolicy } from './voice-gate'

/**
 * SEND, ON LAWAL'S PRESS, A HELD FIRST LETTER (train AK, the PM's 12:40 and 12:47 of 20 November 2026; Lawal at 12:43:
 * 'I can send individually, and I can send all ... after reviewing'; C:\dev\EVIDENCE\EL-20NOV\ak\leaders-send.md). The
 * press never builds or sends a letter itself; it uses what production already holds, in this order:
 *   1. the founder only;
 *   2. the approval at the press, exactly as the Sent press holds it (voice-gate.ts approvalProblems): the words NOW pass
 *      the gateway's rules and are exactly the words he was shown (content hash) under the policy shown;
 *   3. his tick that their page says nothing against messages, recorded first (crm.ts confirmPageChecked); the database
 *      requires it before any letter leaves held;
 *   4. held to queued for now, then the sender's ONE path for this letter only (sender.ts runOutreachSender, only): the
 *      database's claim with its every check, business hours in their zone, one first letter per organiser, the words
 *      again, its mailbox from law 33's table (ACQ from lawal@), Graph;
 *   5. a letter the sender did not send goes back to held at once with the reason, so no scheduled run ever sends what
 *      his press did not.
 * Graph's sendMail answers 202 and no id: the receipt is our own Message-ID and the time it was accepted; the Sent Items
 * sync then records Graph's own id on the organiser's timeline.
 */
type Admin = SupabaseClient<Database>

export type SendHeldAnswer =
  | { readonly state: 'sent'; readonly touchId: string; readonly messageId: string; readonly at: string }
  | { readonly state: 'refused'; readonly touchId: string; readonly reason: string }

export type SendHeldInput = {
  readonly touchId: string
  readonly contentHash: string
  readonly policyVersion: string
  readonly byFounder: boolean
  readonly by: string
  readonly now: Date
  readonly origin: string
  readonly graph: GraphConfig | null
  readonly policy?: VoicePolicy | null
  readonly fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>
}

export async function sendHeldFirstLetter(db: Admin, input: SendHeldInput): Promise<SendHeldAnswer> {
  const refused = (reason: string): SendHeldAnswer => ({ state: 'refused', touchId: input.touchId, reason })
  if (!input.byFounder) return refused('only Lawal sends a first letter')
  let policy: VoicePolicy | null = input.policy ?? null
  if (!policy) {
    try {
      policy = readVoicePolicy()
    } catch {
      return refused('the voice policy could not be read, so nothing was sent')
    }
  }
  const voice = await readTouchVoice(db, input.touchId)
  if (!voice) return refused('it is no longer waiting')
  const row = await db.from('outreach_touches').select('state, step, comms_category').eq('id', input.touchId).maybeSingle()
  if (row.error || !row.data) return refused(`the letter could not be read${row.error ? `: ${row.error.message}` : ''}`)
  if (row.data.state !== 'held' || row.data.step !== 1 || row.data.comms_category !== 'ACQ') return refused('it is not a held first letter')
  const blocked = approvalProblems({ contentHash: input.contentHash, policyVersion: input.policyVersion, byFounder: true }, voice, policy)
  if (blocked.length > 0) return refused(blocked.join('; '))
  const checked = await confirmPageChecked(db, { touchId: input.touchId, by: input.by })
  if (checked.state === 'refused') return refused(checked.reason)
  const queued = await db
    .from('outreach_touches')
    .update({ state: 'queued', scheduled_for: input.now.toISOString() })
    .eq('id', input.touchId)
    .eq('state', 'held')
    .select('id')
    .maybeSingle()
  if (queued.error || !queued.data) return refused(queued.error?.message.replace(/^refused: /, '') ?? 'it was no longer held')
  let report: Awaited<ReturnType<typeof runOutreachSender>> | null = null
  let fault: string | null = null
  try {
    report = await runOutreachSender(db, { now: input.now, origin: input.origin, graph: input.graph, fetchImpl: input.fetchImpl, only: [input.touchId] })
  } catch (error) {
    fault = error instanceof Error ? error.message : String(error)
  }
  if (report && report.sent.includes(input.touchId)) {
    const done = await db.from('outreach_touches').select('internet_message_id, sent_at').eq('id', input.touchId).maybeSingle()
    return { state: 'sent', touchId: input.touchId, messageId: String(done.data?.internet_message_id ?? ''), at: String(done.data?.sent_at ?? input.now.toISOString()) }
  }
  // Not sent: back to held at once, so no scheduled run sends what his press did not.
  await db.from('outreach_touches').update({ state: 'held', scheduled_for: null }).eq('id', input.touchId).eq('state', 'queued')
  const why =
    fault ??
    report?.refused.find((r) => r.id === input.touchId)?.reason ??
    report?.failed.find((r) => r.id === input.touchId)?.reason ??
    (report && report.outsideHours > 0 ? 'outside the sending window in their city (law 44: Monday to Saturday, 06:00 to 09:00, unless set otherwise)' : null) ??
    report?.note ??
    'the sender did not take it'
  return refused(why)
}

/** One every 20 seconds: HubSpot's three a minute, far under Microsoft's 30 a minute and 4 at once (leaders-send.md). */
export const SEND_ALL_GAP_MS = 20_000

/**
 * SEND ALL CLEARED: the day's letters one at a time, each through sendHeldFirstLetter at its own moment, one every 20
 * seconds; one refusal never stops the others; every letter's answer is returned in order.
 */
export async function sendAllCleared(
  db: Admin,
  letters: readonly Pick<SendHeldInput, 'touchId' | 'contentHash' | 'policyVersion'>[],
  base: Omit<SendHeldInput, 'touchId' | 'contentHash' | 'policyVersion' | 'now'>,
  clock: { readonly now: () => Date; readonly wait: (ms: number) => Promise<void> } = { now: () => new Date(), wait: (ms) => new Promise((r) => setTimeout(r, ms)) },
): Promise<SendHeldAnswer[]> {
  const out: SendHeldAnswer[] = []
  for (const [i, l] of letters.entries()) {
    if (i > 0) await clock.wait(SEND_ALL_GAP_MS)
    try {
      out.push(await sendHeldFirstLetter(db, { ...base, ...l, now: clock.now() }))
    } catch (error) {
      out.push({ state: 'refused', touchId: l.touchId, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return out
}
