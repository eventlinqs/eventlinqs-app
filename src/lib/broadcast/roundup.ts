import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { toZonedInputValue, PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

/**
 * THE WEEKLY ROUNDUP'S APPROVAL (Train C, row 9: "Thursday's edition is drafted from verified listings, approved,
 * sent"). An admin approves a city's edition on /admin/roundup; the weekly digest cron sends a city only once its
 * edition was approved in the last seven days, the same window the cron's own idempotence reads, so an edition
 * approved on Wednesday or Thursday covers that week's send and never the next one.
 *
 * Every read here throws or answers 'unreadable' on a failed read, never "not approved" and never "approved": a city
 * silently skipped and a city sent without its approval are both the failure this exists to prevent.
 */

type Admin = ReturnType<typeof createAdminClient>

export const APPROVAL_WINDOW_DAYS = 7

export interface RoundupApproval {
  readonly approvedAt: string
  readonly approvedBy: string
  readonly eventCount: number
}

/** The newest approval of this city's edition inside the window, null where there is none, 'unreadable' where the read failed. */
export async function roundupApproval(admin: Admin, citySlug: string, now: Date): Promise<RoundupApproval | null | 'unreadable'> {
  const since = new Date(now.getTime() - (APPROVAL_WINDOW_DAYS - 1) * 86_400_000).toISOString()
  const { data, error } = await admin
    .from('roundup_approvals')
    .select('approved_at, approved_by, event_count')
    .eq('city_slug', citySlug)
    .gte('approved_at', since)
    .order('approved_at', { ascending: false })
    .limit(1)
  if (error) return 'unreadable'
  const row = (data ?? [])[0] as { approved_at: string; approved_by: string; event_count: number } | undefined
  return row === undefined ? null : { approvedAt: row.approved_at, approvedBy: row.approved_by, eventCount: row.event_count }
}

/** Records an admin's approval of this city's edition as drafted, once a city a day. */
export async function approveRoundup(
  admin: Admin,
  input: { readonly citySlug: string; readonly whatsappText: string; readonly eventCount: number; readonly approvedBy: string; readonly now: Date },
): Promise<{ readonly state: 'approved' } | { readonly state: 'refused'; readonly reason: string }> {
  if (input.eventCount === 0 || input.whatsappText.trim() === '') return { state: 'refused', reason: 'Nothing was approved: this city has no listings this week.' }
  const periodStart = toZonedInputValue(input.now.toISOString(), PLATFORM_TIME_ZONE).split('T')[0]
  const { error } = await admin.from('roundup_approvals').upsert(
    {
      city_slug: input.citySlug,
      period_start: periodStart,
      approved_by: input.approvedBy,
      approved_at: input.now.toISOString(),
      whatsapp_text: input.whatsappText,
      event_count: input.eventCount,
    },
    { onConflict: 'city_slug,period_start', ignoreDuplicates: true },
  )
  if (error) return { state: 'refused', reason: 'Nothing was approved, because the records could not be reached. Try again in a minute.' }
  return { state: 'approved' }
}
