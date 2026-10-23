'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import {
  handleReminderRequest,
  type ReminderRequestInput,
  type ReminderRequestResult,
} from '@/lib/walk-in/remind-me-request'

/**
 * REMIND ME on a walk-in event page (WI1). The decision, the order of the
 * checks and the bot trap are in src/lib/walk-in/remind-me-request.ts; this file
 * only connects them to the database, the limiter and the switch.
 *
 * SERVICE ROLE, after the checks: public.event_reminders is readable and
 * writable by the service role only (migration 20261021000020), because the rows
 * are people's addresses and nobody else ever needs to read them.
 *
 * AUTH POSTURE: public by design. An anonymous visitor asks to be reminded of a
 * public event; it is rate limited fail-closed and writes one row per event and
 * address. Declared in scripts/security/entrypoint-authz-audit.mjs.
 */
export async function requestEventReminder(input: ReminderRequestInput): Promise<ReminderRequestResult> {
  const admin = createAdminClient()
  return handleReminderRequest(
    {
      remindMeOn: () => isFeatureEnabled('walk_in_remind_me'),
      rateLimitOk: async () => (await actionRateLimit('event-reminder')).ok,
      readEvent: async (eventId) => {
        const { data, error } = await admin
          .from('events')
          .select('id, status, visibility, entry_mode, end_date, organisation:organisations(name), guide:event_guides(program_published_at)')
          .eq('id', eventId)
          .maybeSingle()
        if (error) {
          console.error('[event-reminder] the event read failed', { eventId, error: error.message })
          return null
        }
        if (!data) return null
        const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
        const org = one(data.organisation as { name: string } | { name: string }[] | null)
        const guide = one(data.guide as { program_published_at: string | null } | { program_published_at: string | null }[] | null)
        return {
          id: data.id,
          status: String(data.status),
          visibility: String(data.visibility),
          entry_mode: data.entry_mode,
          end_date: data.end_date,
          organiser_name: org?.name ?? 'the organiser',
          program_published: Boolean(guide?.program_published_at),
        }
      },
      readReminder: async (eventId, email) => {
        const { data, error } = await admin
          .from('event_reminders')
          .select('id, unsubscribed_at')
          .eq('event_id', eventId)
          .eq('email', email)
          .maybeSingle()
        if (error) {
          console.error('[event-reminder] the reminder read failed', { eventId, error: error.message })
          return null
        }
        return data
      },
      insertReminder: async (row) => {
        // ignoreDuplicates: two presses racing each other store one row, and the
        // second is not an error the person should see.
        const { error } = await admin
          .from('event_reminders')
          .upsert(row, { onConflict: 'event_id,email', ignoreDuplicates: true })
        if (error) console.error('[event-reminder] the insert failed', { eventId: row.event_id, error: error.message })
        return !error
      },
      restartReminder: async (id, consent) => {
        const { error } = await admin
          .from('event_reminders')
          .update({ ...consent, unsubscribed_at: null, requested_at: new Date().toISOString() })
          .eq('id', id)
        if (error) console.error('[event-reminder] the restart failed', { id, error: error.message })
        return !error
      },
      now: () => new Date(),
    },
    input,
  )
}
