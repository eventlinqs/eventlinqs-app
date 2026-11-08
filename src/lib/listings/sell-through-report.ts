import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { resolveFrom, sendEmail } from '@/lib/email/send'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { readVoicePolicy, voiceProblems } from '@/lib/outreach/voice-gate'
import { readNightRows } from '@/lib/growth/organiser-report'
import { nightFigures } from '@/lib/growth/organiser-report-math'
import { reportTiming, sellThroughMessage, type ReportFigures } from './sell-through-report-words'

/**
 * THE SELL-THROUGH REPORT, SENT (Lawal's ruling of 8 November 2026, 16:13, build 3). Ridden by the hourly listing run
 * (src/app/api/cron/listing-occurrences/route.ts), so no cron is added (law 14 (d)).
 *
 * For every listed event (a submission accepted or published, with its event) whose report is not yet settled: once the
 * day after has come where it happened (sell-through-report-words.ts), its figures are read as counted, the report is
 * written in Lawal's service form and judged by the gateway's checks, and it goes once to the address the organiser
 * sent the event from. AT MOST ONCE: the run claims the report (report_outcome 'claimed', only where report_sent_at is
 * empty) before it sends, and writes the one outcome after; the table's trigger refuses any second record
 * (20261109010001). Never to an address on outreach_unsubscribes, the one suppression list. A report that cannot be read
 * this hour stays unsettled and is tried the next hour; a report too late, of an event no longer published, with
 * nothing counted, unsubscribed, or held by the gateway is settled with its reason, so it is never asked again.
 *
 * The answers are words for the run's log.
 */

/** A few a run: the listing run's budget is shared with the nights it makes. */
export const REPORTS_PER_RUN = 10

type Admin = ReturnType<typeof createAdminClient>

type Owed = {
  id: string
  name: string
  email: string
  published_event_id: string
  offers_consent_at: string | null
}

type EventFacts = { id: string; title: string; venue_name: string | null; end_date: string; timezone: string | null; status: string }

async function settle(admin: Admin, id: string, outcome: string, claimed: boolean): Promise<void> {
  const at = new Date().toISOString()
  const q = admin.from('listing_submissions').update(claimed ? { report_outcome: outcome.slice(0, 300) } : { report_sent_at: at, report_outcome: outcome.slice(0, 300) }).eq('id', id)
  const { error } = claimed ? await q.eq('report_outcome', 'claimed') : await q.is('report_sent_at', null)
  if (error) throw new Error(`the report of ${id} could not be recorded: ${error.message}`)
}

/** Claims the report for this run; false when another run has it, or it is already settled. */
async function claim(admin: Admin, id: string): Promise<boolean> {
  const { data, error } = await admin
    .from('listing_submissions')
    .update({ report_sent_at: new Date().toISOString(), report_outcome: 'claimed' })
    .eq('id', id)
    .is('report_sent_at', null)
    .select('id')
  if (error) throw new Error(`the report of ${id} could not be claimed: ${error.message}`)
  return (data ?? []).length === 1
}

async function unsubscribed(admin: Admin, email: string): Promise<boolean> {
  const { data, error } = await admin.from('outreach_unsubscribes').select('id').eq('email', email.trim().toLowerCase()).limit(1)
  if (error) throw new Error(`the unsubscribe list could not be read: ${error.message}`)
  return (data ?? []).length > 0
}

async function figuresOf(admin: Admin, event: EventFacts): Promise<ReportFigures> {
  const rows = await readNightRows({ id: event.id, endDate: event.end_date }, admin)
  const kept = nightFigures(rows)
  const { count, error } = await admin.from('saved_events').select('id', { count: 'exact', head: true }).eq('event_id', event.id)
  if (error) throw new Error(`the saves could not be read: ${error.message}`)
  return { viewers: rows.viewers, saves: count ?? 0, reminders: rows.numbers.reminders, wentToBooking: kept.pressesOut.people }
}

export async function sendSellThroughReports(now: Date = new Date()): Promise<string[]> {
  if (!(await isFeatureEnabled('organiser_report_email'))) return ['not run: the organiser_report_email switch is off']
  const admin = createAdminClient()
  const owed = await admin
    .from('listing_submissions')
    .select('id, name, email, published_event_id, offers_consent_at')
    .in('status', ['accepted', 'published'])
    .not('published_event_id', 'is', null)
    .is('report_sent_at', null)
    .order('created_at', { ascending: true })
    .limit(200)
  if (owed.error) throw new Error(`the listed events owed a report could not be read: ${owed.error.message}`)
  const subs = (owed.data ?? []) as Owed[]
  if (subs.length === 0) return []

  const events = await admin
    .from('events')
    .select('id, title, venue_name, end_date, timezone, status')
    .in('id', subs.map((s) => s.published_event_id))
  if (events.error) throw new Error(`the listed events could not be read: ${events.error.message}`)
  const byId = new Map(((events.data ?? []) as EventFacts[]).map((e) => [e.id, e]))

  const out: string[] = []
  let sent = 0
  for (const sub of subs) {
    if (sent >= REPORTS_PER_RUN) break
    const event = byId.get(sub.published_event_id)
    try {
      if (!event) {
        await settle(admin, sub.id, 'not sent: its event is gone', false)
        out.push(`${sub.id}: not sent, its event is gone`)
        continue
      }
      const timing = reportTiming(event.end_date, event.timezone ?? 'Australia/Melbourne', now)
      if (!timing.due) {
        if (timing.settle) {
          await settle(admin, sub.id, `not sent: ${timing.why}`, false)
          out.push(`${sub.id}: not sent, ${timing.why}`)
        }
        continue
      }
      if (event.status !== 'published') {
        await settle(admin, sub.id, `not sent: its event is ${event.status}`, false)
        out.push(`${sub.id}: not sent, its event is ${event.status}`)
        continue
      }
      if (await unsubscribed(admin, sub.email)) {
        await settle(admin, sub.id, 'not sent: the address is on outreach_unsubscribes', false)
        out.push(`${sub.id}: not sent, unsubscribed`)
        continue
      }
      const figures = await figuresOf(admin, event)
      const msg = sellThroughMessage(
        { to: sub.email, name: sub.name, title: event.title, venue: event.venue_name ?? 'its venue', figures, mayOffer: sub.offers_consent_at !== null, origin: getSiteUrl() },
        resolveFrom(),
        readVoicePolicy().replySignature,
      )
      if (!msg) {
        await settle(admin, sub.id, 'not sent: nothing was counted for it', false)
        out.push(`${sub.id}: not sent, nothing counted`)
        continue
      }
      const problems = voiceProblems(msg, readVoicePolicy())
      if (problems.length) {
        await settle(admin, sub.id, `not sent, held by the gateway's checks: ${problems.join('; ')}`, false)
        out.push(`${sub.id}: held by the gateway's checks: ${problems.join('; ')}`)
        continue
      }
      if (!(await claim(admin, sub.id))) {
        out.push(`${sub.id}: another run has it`)
        continue
      }
      const counted = `viewers ${figures.viewers}, saves ${figures.saves}, reminders ${figures.reminders}, to booking ${figures.wentToBooking}${sub.offers_consent_at ? ', with the offer' : ''}`
      try {
        await sendEmail({
          to: sub.email,
          subject: msg.subject ?? `How ${event.title} did on EventLinqs`,
          text: msg.body,
          html: `<p>${msg.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`,
          messageType: 'organiser_sell_through_report',
          recipientRole: 'organiser',
        })
      } catch (err) {
        // Claimed and not sent: settled with the mailer's words, never retried, so it can never go twice.
        const why = err instanceof Error ? err.message : String(err)
        await settle(admin, sub.id, `not sent: the mailer refused (${why})`, true)
        out.push(`${sub.id}: not sent, the mailer refused (${why})`)
        continue
      }
      await settle(admin, sub.id, `sent: ${counted}`, true)
      sent += 1
      out.push(`${sub.id}: sent (${counted})`)
    } catch (err) {
      // A read that failed this hour: unsettled, tried again next hour while the report is still due.
      out.push(`${sub.id}: not this hour (${err instanceof Error ? err.message : String(err)})`)
    }
  }
  return out
}
