import type { DigestEdition } from '@/lib/broadcast/digest'

/**
 * WHEN AN EDITION GOES (law 45 (a), Lawal, 21 November 2026, 02:09): THE WEEK on Wednesday at 07:00 and THE WEEKEND on
 * Friday at 07:00, Melbourne time, per city, sent by the engine with no weekly approval
 * (C:\dev\START-16OCT\NEWSLETTER-AND-PHOTO-SUPPLY-LOCKED-21NOV.md, A1; the PM's 02:10: "roundup_approvals no longer gates
 * a send; the engine's own content checks do").
 *
 * Vercel runs a cron in UTC only: "The timezone is always UTC", and a cron expression may not set both the day of the
 * month and the day of the week (https://vercel.com/docs/schedules/cron-jobs, the cron expression limitations, read
 * 21 November 2026). Melbourne is UTC+11 in daylight saving and UTC+10 out of it, so 07:00 Wednesday is 20:00 or 21:00 UTC
 * on Tuesday. The schedule therefore fires on the hour from 20:00 to 23:00 UTC on Tuesday and Thursday, and this rule
 * decides from Melbourne's own clock: a send begins only from 07:00 on the edition's day, whatever the offset that week,
 * and the later firings of the morning carry on a city whose audience is past one run's cap (the spec's part E, 6:
 * "the edition sends in batches until every subscriber of that city has it, inside the morning"). Each edition's send
 * record (digest_sends, keyed by city, edition and period since 20261121170001) makes a second firing a no op, which is
 * what Vercel asks for: "Cron delivery can also occasionally invoke the same scheduled run more than once"
 * (https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs, read 21 November 2026).
 */

/** vercel.json's schedule for /api/cron/weekly-digest; a test holds the two equal. */
export const DIGEST_CRON = '0 20-23 * * 2,4'

/** Melbourne hours a send may run in: from the 07:00 start to the last batch of the morning. */
export const SEND_HOURS = { first: 7, last: 10 } as const

export const SEND_ZONE = 'Australia/Melbourne'

const EDITION_OF_DAY: Readonly<Record<string, DigestEdition>> = { Wed: 'week', Fri: 'weekend' }

export type SendMoment =
  | { readonly edition: DigestEdition; readonly day: string; readonly hour: number }
  | { readonly edition: null; readonly day: string; readonly hour: number; readonly why: string }

/** Which edition this instant may send, judged on Melbourne's clock. Pure. */
export function sendMoment(now: Date, zone: string = SEND_ZONE): SendMoment {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now)
  const day = parts.find((p) => p.type === 'weekday')?.value ?? ''
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN)
  const edition = EDITION_OF_DAY[day]
  if (!edition) return { edition: null, day, hour, why: `${day} is no edition's day (THE WEEK is Wednesday, THE WEEKEND Friday)` }
  if (!(hour >= SEND_HOURS.first && hour <= SEND_HOURS.last)) {
    return { edition: null, day, hour, why: `${String(hour).padStart(2, '0')}:00 in Melbourne is outside the send hours, ${SEND_HOURS.first}:00 to ${SEND_HOURS.last}:59` }
  }
  return { edition, day, hour }
}
