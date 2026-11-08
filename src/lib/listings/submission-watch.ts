import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { cleanTitle, tellLawal } from './self-listing-run'
import {
  arrivalEmail,
  lateAndNotYetTold,
  lateEmail,
  NOT_LIVE_FILTER,
  SUBMISSION_LIVE_WITHIN_MINUTES,
  type WatchedSubmission,
} from './submission-watch-rule'

/**
 * THE ARRIVAL ALERT AND THE HOUR'S BACKSTOP (the PM's ruling of 8 November 2026, 15:00, items 1 and 4; the rules are in
 * submission-watch-rule.ts). Lawal hears of every organiser submission the moment it arrives, before its checks run;
 * and the hourly listings run raises, once each, every submission that is not live an hour after it arrived. Both go
 * through the self-listing run's one alert (tellLawal, organiser_submission_alert, at his own address).
 */

const FIELDS =
  'id, created_at, status, title, name, role, starts_at, city_slug, entry, price_from_cents, photo_path, published_event_id, held_because, check_result'

const submissionsLink = () => `${getSiteUrl()}/admin/submissions`

/** Lawal told the moment a submission arrives; false (said in the log) when it could not be read or sent. */
export async function alertArrival(id: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('listing_submissions').select(FIELDS).eq('id', id).maybeSingle()
  if (error || !data) {
    console.error('[submission-watch] the arrival alert could not read the submission:', error?.message ?? 'no row')
    return false
  }
  const row = data as unknown as WatchedSubmission
  const { data: city } = await admin.from('cities').select('name, timezone').eq('slug', row.city_slug).maybeSingle()
  const mail = arrivalEmail(
    { ...row, title: cleanTitle(row.title) },
    { name: (city?.name as string | undefined) ?? row.city_slug, timezone: (city?.timezone as string | undefined) ?? 'Australia/Melbourne' },
    submissionsLink(),
  )
  return tellLawal(mail.subject, mail.text)
}

/** Each submission not live an hour after it arrived, raised to Lawal once (check_result.late_alert_at), oldest first. */
export async function alertLateSubmissions(now: Date = new Date(), most = 10): Promise<string[]> {
  const admin = createAdminClient()
  const hourAgo = new Date(now.getTime() - SUBMISSION_LIVE_WITHIN_MINUTES * 60_000).toISOString()
  const { data, error } = await admin
    .from('listing_submissions')
    .select(FIELDS)
    .or(NOT_LIVE_FILTER)
    .lt('created_at', hourAgo)
    .order('created_at')
    .limit(50)
  if (error) throw new Error(`the submissions not yet live could not be read: ${error.message}`)
  const out: string[] = []
  for (const row of (data ?? []) as unknown as WatchedSubmission[]) {
    if (out.length >= most) break
    if (!lateAndNotYetTold(row, now)) continue
    const title = cleanTitle(row.title)
    const mail = lateEmail({ ...row, title }, submissionsLink(), now)
    const told = await tellLawal(mail.subject, mail.text)
    if (told) {
      const marked = await admin
        .from('listing_submissions')
        .update({ check_result: { ...(row.check_result ?? {}), late_alert_at: now.toISOString() } })
        .eq('id', row.id)
      if (marked.error) console.error('[submission-watch] told, but not recorded, so the next hour tells again:', marked.error.message)
    }
    out.push(`${title}: ${told ? 'Lawal told' : 'not told; the next hour tries again'}`)
  }
  return out
}
