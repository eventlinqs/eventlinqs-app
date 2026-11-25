import { midnightIn } from '@/lib/dates/zone-midnight'

/**
 * HOW FAST WE ANSWER (Lawal, 25 November 2026, 15:14: "I like yours ... Implement it now ... Make it very professional
 * and robust", and 15:16: "Nothing goes out within the first 45 minutes, minimum ... or 50 minutes. Choose whichever is
 * best"; the PM's 15:14 and 15:17; C:\dev\START-16OCT\COMMUNICATION-RESPONSE-TIMES-25NOV.md). An answer to someone who
 * wrote to us is not outreach: law 44's 06:00 to 09:00 window is for our letters, never for an answer.
 *
 *   - Sorted by what the person wants: an organiser asking to list, claim or sell (a sale) 50 to 60 minutes after it
 *     arrived; a yes, a question or a later on our letter 1 to 2 hours; general and partnership about 4 hours; a stop,
 *     a take down or a withdrawal confirmed when read.
 *   - Never under 50 minutes, plus a random 0 to 10 minutes, so no answer looks automated.
 *   - Answering hours 07:00 to 21:00 Melbourne, every day; what arrives after 21:00 (or before 07:00) is answered from
 *     07:30 the next morning in the order it arrived; never before its floor.
 *
 * The outreach run is every 15 minutes (vercel.json), so an answer leaves at the first run at or after its time: up to
 * 15 minutes later than the time chosen here. A run every 10 minutes changes the bill, which is Lawal's (law 20).
 */
export const ANSWER_ZONE = 'Australia/Melbourne'
export const ANSWER_OPENS_MINUTE = 7 * 60
/** The last minute an answer may leave: 21:00 itself, so the 21:00 run sends what is due by then. */
export const ANSWER_CLOSES_MINUTE = 21 * 60
export const MORNING_QUEUE_MINUTE = 7 * 60 + 30
export const ANSWER_FLOOR_MINUTES = 50

export type AnswerClass = 'sale' | 'letter' | 'general' | 'act_now'

/** Minutes after arrival, the earliest and the latest of each class's own time; the random part picks inside it. */
export const ANSWER_MINUTES: Readonly<Record<AnswerClass, { readonly from: number; readonly to: number }>> = {
  sale: { from: 50, to: 60 },
  letter: { from: 60, to: 105 },
  general: { from: 210, to: 225 },
  act_now: { from: 0, to: 0 },
}

/** The confirmations the law asks for after a stop, a take down or a withdrawal: sent when read, no floor. */
export const ACT_NOW_KEYS: ReadonlySet<string> = new Set(['reply_stop', 'reply_take_down', 'withdrawal_confirmed'])

/** Their own words asking to list, claim or sell with us (a sale), never a mention of selling elsewhere. */
const ASKS_TO_SELL =
  /\b(how (do|can|would) (i|we) (list|claim|sell)|(i|we)(['\u2019]d| would) (like|love) to (list|claim|sell)|(want|keen|ready|happy) to (list|claim|sell)|please (list|claim|set (it|this|us|me) up)|sign (me|us) up|set (it|this|us|me) up)\b/i
const PARTNERSHIP = /\b(partner(ship)?s?|sponsor(ship|s|ing)?|collaborat(e|ion)|media kit|advertis(e|ing))\b/i

export function answerClassOf(input: {
  readonly templateKey: string | null
  readonly outcome: string | null
  /** The category of our letter their message answers (comms/categories.ts), when it answers one. */
  readonly answeredCategory: string | null
  readonly words: string
}): AnswerClass {
  if ((input.templateKey && ACT_NOW_KEYS.has(input.templateKey)) || input.outcome === 'stop' || input.outcome === 'take_down') return 'act_now'
  if (ASKS_TO_SELL.test(input.words) || (input.outcome === 'yes' && input.answeredCategory === 'ACQ')) return 'sale'
  if (PARTNERSHIP.test(input.words)) return 'general'
  return 'letter'
}

const MIN = 60_000

/** The minute of the day of an instant in Melbourne. */
export function melbourneMinuteOf(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: ANSWER_ZONE, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(at)
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0') * 60 + Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
}

/** True from 07:00 to 21:00 (that minute included) in Melbourne, every day. */
export function inAnswerHours(at: Date): boolean {
  const m = melbourneMinuteOf(at)
  return m >= ANSWER_OPENS_MINUTE && m <= ANSWER_CLOSES_MINUTE
}

/** The instant of a minute of the Melbourne day holding `day`, corrected across a daylight saving change. */
function atMinuteOfDay(day: Date, minute: number): Date {
  const midnight = midnightIn(day, ANSWER_ZONE)
  const guess = new Date(midnight.getTime() + minute * MIN)
  const drift = minute - melbourneMinuteOf(guess)
  return drift === 0 ? guess : new Date(guess.getTime() + ((drift + 720 + 1440) % 1440 - 720) * MIN)
}

/** 07:30 the next morning after `after` (or this morning, when it is still before 07:30). */
function morningAfter(after: Date): Date {
  const today = atMinuteOfDay(after, MORNING_QUEUE_MINUTE)
  if (today.getTime() >= after.getTime()) return today
  return atMinuteOfDay(new Date(midnightIn(after, ANSWER_ZONE).getTime() + 36 * 3_600_000), MORNING_QUEUE_MINUTE)
}

/** In arrival order: a minute later for each hour since 21:00 it arrived, so the morning's answers keep their order. */
function overnightOrder(receivedAt: Date): number {
  const m = melbourneMinuteOf(receivedAt)
  // Arrived inside the hours and carried to the morning by its floor: before everything that came overnight.
  if (m >= ANSWER_OPENS_MINUTE && m < ANSWER_CLOSES_MINUTE) return 0
  const since = m >= ANSWER_CLOSES_MINUTE ? m - ANSWER_CLOSES_MINUTE : m + (1440 - ANSWER_CLOSES_MINUTE)
  return Math.min(10, Math.max(0, Math.floor(since / 60)))
}

/**
 * The time an answer goes. `random` is a number from 0 to 1 (Math.random in the engine), so each answer picks its own
 * minute inside its class's time; `now` is the moment it is queued, never earlier.
 */
export function answerAt(input: { readonly receivedAt: Date; readonly klass: AnswerClass; readonly now: Date; readonly random: number }): Date {
  const r = Math.min(Math.max(Number.isFinite(input.random) ? input.random : 0, 0), 1)
  const received = input.receivedAt.getTime()
  const now = input.now.getTime()
  const morning = (after: Date) => new Date(morningAfter(after).getTime() + overnightOrder(input.receivedAt) * MIN)
  if (input.klass === 'act_now') return inAnswerHours(input.now) ? input.now : morning(input.now)
  const w = ANSWER_MINUTES[input.klass]
  const floor = received + (ANSWER_FLOOR_MINUTES + r * 10) * MIN
  const wanted = Math.max(received + (w.from + r * (w.to - w.from)) * MIN, floor)
  let at: number
  if (!inAnswerHours(input.receivedAt)) {
    at = Math.max(morning(input.receivedAt).getTime(), floor)
  } else {
    const closes = atMinuteOfDay(input.receivedAt, ANSWER_CLOSES_MINUTE).getTime()
    // A later class whose own time falls after 21:00 still goes the same day, once its floor allows, at the close.
    at = wanted <= closes ? wanted : floor <= closes ? closes : morning(new Date(closes + MIN)).getTime()
  }
  at = Math.max(at, now)
  return inAnswerHours(new Date(at)) ? new Date(at) : morning(new Date(at))
}

/** Whether an answer may leave now: its floor is past (a confirmation the law asks for has none), inside the hours. */
export function answerMayLeave(input: { readonly receivedAt: Date; readonly templateKey: string | null; readonly now: Date }): 'now' | 'too soon' | 'outside hours' {
  if (!inAnswerHours(input.now)) return 'outside hours'
  if (input.templateKey && ACT_NOW_KEYS.has(input.templateKey)) return 'now'
  return input.now.getTime() >= input.receivedAt.getTime() + ANSWER_FLOOR_MINUTES * MIN ? 'now' : 'too soon'
}
