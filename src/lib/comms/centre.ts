import type { SupabaseClient } from '@supabase/supabase-js'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { melbourneDay } from '@/lib/growth/desk'
import type { CommsCategory } from '@/lib/comms/categories'
import {
  combine,
  noticeFigures,
  notificationFigures,
  outcomeFigures,
  sectionsInOrder,
  sentRecordFigures,
  socialFigures,
  touchFigures,
  type Figures,
  type Section,
  type TouchRow,
} from '@/lib/comms/centre-math'

/**
 * THE GROWTH AND COMMUNICATIONS CENTRE, READ FROM THE DATABASE ONLY (Law 24; the directive's section 7). Every figure
 * is counted from the rows each message record holds, by the one category migration 20261118103501 records on them;
 * the counting is centre-math.ts. Nothing is estimated, and nothing here writes.
 */
type Db = SupabaseClient

export type Centre = { sections: Section[]; readAt: string; firstLettersToday: number }

export async function readCentre(db: Db, now: Date): Promise<Centre> {
  const touches = await readEveryRow<TouchRow & { comms_category: CommsCategory; comms_subtype: string }>('the CRM messages', (a, b) =>
    db.from('outreach_touches').select('id, state, drafted_at, sent_at, comms_category, comms_subtype').order('id').range(a, b) as never,
  )
  const bounces = await readEveryRow<{ touch_id: string }>('the bounces', (a, b) =>
    db.from('outreach_delivery_events').select('touch_id').in('kind', ['bounce_hard', 'bounce_soft']).order('id').range(a, b) as never,
  )
  const replies = await readEveryRow<{ touch_id: string | null }>('the replies', (a, b) =>
    db.from('outreach_replies').select('touch_id').order('id').range(a, b) as never,
  )
  const pieces = await readEveryRow<{ id: string; planned_at: string | null }>('the social pieces', (a, b) =>
    db.from('social_pieces').select('id, planned_at').order('id').range(a, b) as never,
  )
  const approvals = await readEveryRow<{ piece_id: string }>('the social approvals', (a, b) =>
    db.from('social_piece_approvals').select('piece_id').order('id').range(a, b) as never,
  )
  const schedules = await readEveryRow<{ piece_id: string; state: string; published_ref: string | null; published_at: string | null; created_at: string | null }>(
    'the social schedules',
    (a, b) => db.from('social_piece_schedules').select('piece_id, state, published_ref, published_at, created_at').order('id').range(a, b) as never,
  )
  const reports = await readEveryRow<{ read_at: string | null; sent_at: string | null }>('the night reports', (a, b) =>
    db.from('organiser_night_reports').select('read_at, sent_at').order('id').range(a, b) as never,
  )
  const digests = await readEveryRow<{ digest_date: string | null; sent_at: string | null }>('the sales digests', (a, b) =>
    db.from('organiser_sales_digest_sends').select('digest_date, sent_at').order('organisation_id').order('digest_date').range(a, b) as never,
  )
  const notices = await readEveryRow<{ delivery_state: string; occurred_at: string | null; sent_at: string | null }>('the platform notices', (a, b) =>
    db.from('platform_notifications').select('delivery_state, occurred_at, sent_at').order('id').range(a, b) as never,
  )
  const notifications = await readEveryRow<{ comms_category: string; scheduled_for: string | null; sent_at: string | null; opened_at: string | null; created_at: string | null }>(
    'the notifications',
    (a, b) => db.from('notifications').select('comms_category, scheduled_for, sent_at, opened_at, created_at').order('id').range(a, b) as never,
  )
  const activations = await readEveryRow<{ at: string | null }>('the ticketing activations', (a, b) =>
    db.from('ticketing_activations').select('at').order('id').range(a, b) as never,
  )
  const permissions = await readEveryRow<{ granted_at: string | null }>('the image permissions', (a, b) =>
    db.from('organiser_permissions').select('granted_at').is('withdrawn_at', null).order('id').range(a, b) as never,
  )

  const bounced = new Set(bounces.map((b) => b.touch_id))
  const replyCount = new Map<string, number>()
  for (const r of replies) if (r.touch_id) replyCount.set(r.touch_id, (replyCount.get(r.touch_id) ?? 0) + 1)
  const touchesOf = (c: CommsCategory): Figures => touchFigures(touches.filter((t) => t.comms_category === c), bounced, replyCount)
  const notificationsOf = (c: CommsCategory) => notifications.filter((n) => n.comms_category === c)
  const today = melbourneDay(now)
  const firstLettersToday = touches.filter((t) => t.comms_subtype === 'ACQ-FIRST' && t.state === 'sent' && t.sent_at && melbourneDay(new Date(t.sent_at)) === today).length

  const by: Partial<Record<CommsCategory, { figures: Figures; sources: string[]; extra?: string[] }>> = {
    ACQ: { figures: touchesOf('ACQ'), sources: ['CRM messages (outreach_touches)'] },
    PERM: {
      figures: combine(touchesOf('PERM'), outcomeFigures(permissions.map((p) => ({ at: p.granted_at })))),
      sources: ['CRM messages (outreach_touches)', 'image permissions granted (organiser_permissions)'],
    },
    LIST: {
      figures: combine(touchesOf('LIST'), notificationFigures(notificationsOf('LIST'))),
      sources: ['CRM messages (outreach_touches)', 'attendee alerts (notifications)'],
    },
    SOC: {
      figures: socialFigures(pieces, new Set(approvals.map((a) => a.piece_id)), schedules),
      sources: ['social pieces, their approvals and schedules (social_pieces, social_piece_approvals, social_piece_schedules)'],
    },
    RET: {
      figures: combine(combine(touchesOf('RET'), sentRecordFigures(reports.map((r) => ({ at: r.read_at, sent_at: r.sent_at })))),
        sentRecordFigures(digests.map((d) => ({ at: d.digest_date, sent_at: d.sent_at })))),
      sources: ['CRM messages (outreach_touches)', 'night reports (organiser_night_reports)', 'sales digests (organiser_sales_digest_sends)'],
      extra: [`${reports.filter((r) => !r.sent_at).length} of ${reports.length} night reports not sent`],
    },
    TKT: {
      figures: combine(touchesOf('TKT'), outcomeFigures(activations)),
      sources: ['CRM messages (outreach_touches)', 'ticketing steps proved (ticketing_activations)'],
    },
    SYS: {
      figures: combine(combine(touchesOf('SYS'), noticeFigures(notices)), notificationFigures(notificationsOf('SYS'))),
      sources: ['CRM messages (outreach_touches)', "the founder's platform notices (platform_notifications)", 'performer notices (notifications)'],
    },
  }
  return { sections: sectionsInOrder(by, firstLettersToday), readAt: now.toISOString(), firstLettersToday }
}
