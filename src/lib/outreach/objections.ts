/**
 * OBJECTIONS RECORDED (Growth Engine V3 checklist, item 5: "Objections recorded"; the pilot's goal: "every reply and
 * objection recorded, real rates measured"). Window 6, 1 November 2026.
 *
 * An objection is part of a reply's classification: it is kept on outreach_replies.objection (migration
 * 20261101070001), read from the SAME rules that choose the stored answer (replies.ts ANSWERS), and Lawal may correct
 * it as he may correct the outcome (outreach_reply_words_stay keeps only the words fixed). The list is closed here and
 * in the database's check, and a test holds the two equal.
 *
 * A reply the rules cannot read with one meaning gets no objection by guess: it already waits for Lawal, who names it.
 */
import type { ReplyKind } from './replies'

export const OBJECTIONS = ['cost', 'existing_ticketing', 'who_are_you', 'why_listed', 'not_now', 'not_interested', 'other'] as const

export type Objection = (typeof OBJECTIONS)[number]

/** The stored answer key each objection is read from; 'no' is the plain not-interested reply. */
const BY_ANSWER_KEY: Readonly<Record<string, Objection>> = {
  reply_cost: 'cost',
  reply_existing_ticketing: 'existing_ticketing',
  reply_who_are_you: 'who_are_you',
  reply_why_listed: 'why_listed',
  reply_not_now: 'not_now',
}

/** The objection a classified reply raises, or null (a yes, a stop, a take down, a bounce, or a reply not read clearly). */
export function objectionOf(kind: ReplyKind): Objection | null {
  if (kind.kind !== 'reply') return null
  if (kind.outcome === 'no') return 'not_interested'
  return kind.answerKey ? BY_ANSWER_KEY[kind.answerKey] ?? null : null
}

const NEXT: Readonly<Record<Objection, string>> = {
  cost: 'Answer with the stored reply (reply_cost): listing and featuring are free, selling tickets is optional; drafted for Lawal to send.',
  existing_ticketing: 'Answer with the stored reply (reply_existing_ticketing): they keep their own ticketing and the listing links to it.',
  who_are_you: 'Answer with the stored reply (reply_who_are_you): what EventLinqs is, and that they see how many people we send.',
  why_listed: 'Answer with the stored reply (reply_why_listed): listed from their public details; claim it, or it comes down today.',
  not_now: 'Answer with the stored reply (reply_not_now): the listing stays; the cadence has stopped, so nothing follows unless Lawal returns to them.',
  not_interested: 'The organiser is stopped and nothing more is sent to any of their contacts.',
  other: 'Lawal reads the reply, names what it raises, and decides the next step himself.',
}

/** The next action for an objection, in plain words, shown beside it. */
export function objectionNext(o: Objection): string {
  return NEXT[o]
}
