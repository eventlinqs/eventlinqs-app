import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { answerClassOf, type AnswerClass } from './answer-timing'

type Admin = SupabaseClient<Database>

/**
 * HOW FAST WE ANSWERED, WEEKLY, IN THE 08:00 REPORT (Lawal, 25 November 2026, 15:09: "We can keep improving"; the PM's
 * 15:10 item 5: "A weekly line in the 08:00 report: median and slowest answer time per class, share on target, reply and
 * yes rates"; C:\dev\START-16OCT\COMMUNICATION-RESPONSE-TIMES-25NOV.md, "How we keep improving it"). Read from the CRM:
 * each answer sent in the last seven days, the message it answered and its class (./answer-timing.ts answerClassOf),
 * and the first letters, replies and yeses of the same seven days. A stop, take down or withdrawal confirmed is acted on
 * when read and has no answer time to measure.
 */
export type TimedClass = Exclude<AnswerClass, 'act_now'>

/** Each class's target, in minutes after the message arrived (the rule's table: about 1 hour, 1 to 2 hours, about 4 hours). */
export const ANSWER_TARGET_MINUTES: Readonly<Record<TimedClass, number>> = { sale: 60, letter: 120, general: 240 }

const CLASS_WORDS: Readonly<Record<TimedClass, string>> = { sale: 'a sale', letter: 'a reply to our letter', general: 'general' }

export type AnsweredRow = { readonly klass: TimedClass; readonly minutes: number }

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n * 100) / of)}%` : 'none sent')

/** The line, from the week's answers and counts. Pure. */
export function answerTimingLine(input: { readonly answers: readonly AnsweredRow[]; readonly letters: number; readonly replies: number; readonly yeses: number }): string {
  const parts = (Object.keys(ANSWER_TARGET_MINUTES) as TimedClass[]).map((k) => {
    const mins = input.answers.filter((a) => a.klass === k).map((a) => Math.max(0, Math.round(a.minutes)))
    if (mins.length === 0) return `${CLASS_WORDS[k]}: none answered`
    const target = ANSWER_TARGET_MINUTES[k]
    const on = mins.filter((m) => m <= target).length
    return `${CLASS_WORDS[k]}: ${mins.length} answered, median ${median(mins)} min, slowest ${Math.max(...mins)} min, ${on} of ${mins.length} within ${target} min`
  })
  return `${parts.join('; ')}. Replies to our letters: ${input.replies} to ${input.letters} first letters (${pct(input.replies, input.letters)}), yes ${input.yeses} (${pct(input.yeses, input.letters)}).`
}

const DAY = 86_400_000

/** The week's line, read from production; a read that fails says so and never prints a calm zero. */
export async function readAnswerTiming(db: Admin, now: Date): Promise<string> {
  const since = new Date(now.getTime() - 7 * DAY).toISOString()
  const sent = await db
    .from('outreach_touches')
    .select('id, sent_at, in_reply_to, outreach_templates(key)')
    .eq('state', 'sent')
    .in('purpose', ['reply', 'relationship'])
    .not('in_reply_to', 'is', null)
    .gte('sent_at', since)
    .limit(1000)
  if (sent.error) throw new Error(`the answers sent could not be read: ${sent.error.message}`)
  const answers = (sent.data ?? []) as unknown as { id: string; sent_at: string; in_reply_to: string; outreach_templates: { key: string } | null }[]
  const ids = [...new Set(answers.map((a) => a.in_reply_to))]
  const theirs = ids.length > 0 ? await db.from('outreach_replies').select('source_message_id, received_at, outcome, wording, touch_id').in('source_message_id', ids) : { data: [], error: null }
  if (theirs.error) throw new Error(`the messages answered could not be read: ${theirs.error.message}`)
  const byId = new Map(((theirs.data ?? []) as { source_message_id: string; received_at: string; outcome: string | null; wording: string | null; touch_id: string | null }[]).map((r) => [r.source_message_id, r]))
  const letterIds = [...new Set([...byId.values()].map((r) => r.touch_id).filter((x): x is string => Boolean(x)))]
  const letters = letterIds.length > 0 ? await db.from('outreach_touches').select('id, comms_category').in('id', letterIds) : { data: [], error: null }
  if (letters.error) throw new Error(`the letters answered could not be read: ${letters.error.message}`)
  const categoryOf = new Map(((letters.data ?? []) as { id: string; comms_category: string | null }[]).map((t) => [t.id, t.comms_category]))
  const rows: AnsweredRow[] = []
  for (const a of answers) {
    const r = byId.get(a.in_reply_to)
    if (!r) continue
    const klass = answerClassOf({ templateKey: a.outreach_templates?.key ?? null, outcome: r.outcome, answeredCategory: r.touch_id ? (categoryOf.get(r.touch_id) ?? null) : null, words: r.wording ?? '' })
    if (klass === 'act_now') continue
    rows.push({ klass, minutes: (Date.parse(a.sent_at) - Date.parse(r.received_at)) / 60_000 })
  }
  const firsts = await db.from('outreach_touches').select('id', { count: 'exact', head: true }).eq('state', 'sent').eq('purpose', 'cadence').eq('step', 1).gte('sent_at', since)
  if (firsts.error) throw new Error(`the first letters could not be counted: ${firsts.error.message}`)
  const replies = await db.from('outreach_replies').select('id', { count: 'exact', head: true }).gte('received_at', since)
  if (replies.error) throw new Error(`the replies could not be counted: ${replies.error.message}`)
  const yeses = await db.from('outreach_replies').select('id', { count: 'exact', head: true }).eq('outcome', 'yes').gte('received_at', since)
  if (yeses.error) throw new Error(`the yeses could not be counted: ${yeses.error.message}`)
  return answerTimingLine({ answers: rows, letters: firsts.count ?? 0, replies: replies.count ?? 0, yeses: yeses.count ?? 0 })
}

/** Monday in Melbourne: the weekly line's day. Pure. */
export function isReportWeekday(now: Date): boolean {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short' }).format(now) === 'Mon'
}
