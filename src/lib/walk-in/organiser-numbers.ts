import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { SOURCE_SYSTEM } from '@/lib/ledger/types'

/**
 * THE NUMBERS A FREE EVENT HAS (WI1-ITEM.md point 5): "views, Remind me
 * sign-ups, calendar adds, shares and follows. These are the conversions a free
 * event has."
 *
 * Read, never typed: views, calendar adds, shares and follows are demand rows on
 * the event's slot in the slot ledger (one per visitor per day, or one per
 * person for a follow), and sign-ups are the event's Remind me rows.
 *
 * `actionsPerView` is the figure WI1's reversal condition is written in: "if 30
 * days after launch fewer than 1 in 50 walk-in page views leads to a Remind me,
 * calendar add, share or follow, the panel's order is redrawn three ways".
 * scripts/ops/walk-in-conversion.mjs prints it for every walk-in event.
 *
 * Service role, after the caller has proved it may act for the organisation.
 */
export type WalkInNumbers = {
  views: number
  reminders: number
  calendarAdds: number
  shares: number
  follows: number
  /** Actions per view, or null with no views yet. */
  actionsPerView: number | null
}

export async function readWalkInNumbers(eventId: string): Promise<WalkInNumbers> {
  const admin = createAdminClient()
  const { data: slots, error: slotError } = await admin
    .from('ledger_slots')
    .select('id')
    .eq('source_system', SOURCE_SYSTEM)
    .eq('source_ref', eventId)
  if (slotError) throw new Error(`the ledger slot could not be read: ${slotError.message}`)
  const slotIds = (slots ?? []).map((s) => s.id)

  const demand = async (action: 'page_view' | 'calendar_add' | 'share' | 'follow') => {
    if (slotIds.length === 0) return 0
    const { count, error } = await admin
      .from('ledger_entries')
      .select('id', { count: 'exact', head: true })
      .in('slot_id', slotIds)
      .eq('kind', 'demand')
      .eq('demand_action', action)
    if (error) throw new Error(`the ${action} count could not be read: ${error.message}`)
    return count ?? 0
  }

  const [views, calendarAdds, shares, follows, reminderCount] = await Promise.all([
    demand('page_view'),
    demand('calendar_add'),
    demand('share'),
    demand('follow'),
    admin.from('event_reminders').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
  ])
  if (reminderCount.error) throw new Error(`the Remind me count could not be read: ${reminderCount.error.message}`)
  const reminders = reminderCount.count ?? 0
  const actions = reminders + calendarAdds + shares + follows
  return {
    views,
    reminders,
    calendarAdds,
    shares,
    follows,
    actionsPerView: views > 0 ? actions / views : null,
  }
}

/** "1 in 23" from a rate, the way the reversal condition is written. */
export function oneIn(actionsPerView: number | null): string | null {
  if (actionsPerView === null || actionsPerView <= 0) return null
  return `1 in ${Math.max(1, Math.round(1 / actionsPerView))}`
}
