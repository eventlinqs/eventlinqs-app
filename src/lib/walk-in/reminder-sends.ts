/**
 * THE TWO MESSAGES REMIND ME CAN EVER SEND (WI1-ITEM.md point 3).
 *
 *   "It sends at most: one update, when the organiser publishes the program;
 *    one reminder, the day before. Each message carries a working unsubscribe."
 *
 * AT MOST ONCE IS A DATABASE FACT. Every message is CLAIMED in
 * public.event_reminder_sends before it is sent; the table is unique on
 * (reminder, kind), so a second run, an overlapping run or a retry finds the
 * claim taken and sends nothing. The recovery engine proved this shape
 * (recovery_sends) before it was used here. A claimed send that fails stays
 * claimed: at most once means a failure is recorded for a person, never retried
 * into a second copy.
 *
 * WHO IS DUE is answered by public.walk_in_reminders_due in one statement, so
 * nothing here pages through rows and filters them afterwards.
 *
 * WHEN THE DAY-BEFORE REMINDER GOES. From 9am in the event's own zone on the
 * day before its first day. Nine is not a new number: it is the platform's
 * existing morning send, the weekly digest's schedule of "0 22 * * 3" UTC in
 * vercel.json, which is 9am in Melbourne and Sydney under daylight saving. The
 * hourly run keeps offering it until midnight, so one failed run is not the end
 * of the reminder, and the claim makes the retry harmless. The hour is written
 * here once and handed to the database function.
 *
 * THE PROGRAM UPDATE goes to the people who asked BEFORE the organiser published
 * it. Somebody who asks afterwards reads the program on the page and was never
 * promised it by email (the line beside the button changes once the program is
 * out: src/lib/walk-in/remind-me.ts).
 */

export const DAY_BEFORE_LOCAL_HOUR = 9

/**
 * How long a Remind me request is kept after its event ends, then deleted.
 * PROPOSED, NOT YET APPROVED: decision 1 in
 * docs/legal/privacy/PRIVACY-2026-10-24-DRAFT.md. Lawal approves this number
 * or names another with the privacy version; Remind me is dark in production
 * until he does, so no production row is ever held under an unapproved period.
 */
export const REMIND_ME_RETENTION_DAYS_AFTER_EVENT = 30

/** Rows per batch; the database function caps a batch at 1,000 regardless. */
export const REMINDER_BATCH = 200

/** A run stops after this many batches, so one run can never loop forever. */
export const MAX_BATCHES_PER_KIND = 20

export type ReminderKind = 'program' | 'day_before' | 'called_off'

export type DueRow = {
  reminderId: string
  email: string
  token: string
  eventId: string
  firstDay: string
  timezone: string
}

export type ReminderSendDeps = {
  /** The due, unclaimed rows of one kind (public.walk_in_reminders_due). */
  due: (kind: ReminderKind, eventId: string | null, limit: number, now: Date, localHour: number) => Promise<DueRow[]>
  /** Insert the claim; false when it was already taken. */
  claim: (reminderId: string, kind: ReminderKind) => Promise<boolean>
  send: (row: DueRow, kind: ReminderKind) => Promise<{ id: string }>
  record: (reminderId: string, kind: ReminderKind, result: { providerId?: string; error?: string }) => Promise<void>
  /** Delete requests whose event ended more than `days` ago; how many went. */
  purge: (days: number) => Promise<number>
}

export type PassSummary = { due: number; sent: number; alreadyClaimed: number; failed: number; batches: number }

async function runPass(
  deps: ReminderSendDeps,
  kind: ReminderKind,
  eventId: string | null,
  now: Date,
): Promise<PassSummary> {
  const summary: PassSummary = { due: 0, sent: 0, alreadyClaimed: 0, failed: 0, batches: 0 }
  for (let batch = 0; batch < MAX_BATCHES_PER_KIND; batch++) {
    const rows = await deps.due(kind, eventId, REMINDER_BATCH, now, DAY_BEFORE_LOCAL_HOUR)
    summary.batches++
    summary.due += rows.length
    let progressed = 0
    for (const row of rows) {
      if (!(await deps.claim(row.reminderId, kind))) {
        summary.alreadyClaimed++
        continue
      }
      progressed++
      try {
        const { id } = await deps.send(row, kind)
        await deps.record(row.reminderId, kind, { providerId: id })
        summary.sent++
      } catch (error) {
        await deps.record(row.reminderId, kind, { error: error instanceof Error ? error.message : String(error) })
        summary.failed++
      }
    }
    // A short batch is the last one. A batch in which nothing could be claimed
    // means another run holds those rows; stop rather than spin on them.
    if (rows.length < REMINDER_BATCH || progressed === 0) break
  }
  return summary
}

/**
 * One run: the program updates owed, the day-before reminders due now, then the
 * called-off notes (the privacy version of 27 October 2026: "plus a short note
 * if the event is called off"). Who is owed a note is the database's answer
 * (walk_in_reminders_due, migration 20261027223001): a live request of a
 * walk-in event now cancelled whose first day has not passed, under a Remind me
 * version whose words promised the note.
 */
export async function runReminderPasses(
  deps: ReminderSendDeps,
  now: Date,
  eventId: string | null = null,
): Promise<{ program: PassSummary; dayBefore: PassSummary; calledOff: PassSummary; purged: number }> {
  const program = await runPass(deps, 'program', eventId, now)
  const dayBefore = await runPass(deps, 'day_before', eventId, now)
  const calledOff = await runPass(deps, 'called_off', eventId, now)
  // Retention runs on the full sweep only, never on one organiser's press.
  const purged = eventId === null ? await deps.purge(REMIND_ME_RETENTION_DAYS_AFTER_EVENT) : 0
  return { program, dayBefore, calledOff, purged }
}
