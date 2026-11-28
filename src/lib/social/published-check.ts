import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * M6, THE ADVANCE APPROVAL WORKFLOW'S TWO DAILY GUARDS (Lawal's directive of 12:35 on 27 November 2026, the PM's 12:55,
 * items 4, 6 and 7). Founder approval and the image rights gates are unchanged; nothing here approves or posts.
 *   - A piece still unapproved 24 hours and 3 hours before its slot is named again to hello@ (reminderDue).
 *   - Every day at 21:00 what was scheduled to now is compared with what was published; every gap is a FAILURE with its
 *     reason; a day with no content planned is not a failure (Lawal's version 2 of 16:00) (publishedCheck).
 */

type Db = SupabaseClient

/** Which reminder an unapproved piece is due this hour, by its slot: 24 or 3 hours ahead, else none. Pure. */
export function reminderDue(slotIso: string, now: Date): 24 | 3 | null {
  const hours = (Date.parse(slotIso) - now.getTime()) / 3_600_000
  if (hours > 23 && hours <= 24) return 24
  if (hours > 2 && hours <= 3) return 3
  return null
}

export type ScheduleRow = { readonly label: string; readonly platform: string; readonly goAt: string; readonly state: string; readonly heldReason: string | null }

/** The 21:00 line and whether the day failed: every PLANNED post scheduled to now that did not publish. Pure. */
export function publishedCheck(rows: readonly ScheduleRow[], now: Date): { readonly line: string; readonly failures: string[]; readonly failed: boolean } {
  const due = rows.filter((r) => Date.parse(r.goAt) <= now.getTime())
  const published = due.filter((r) => r.state === 'published')
  const failures = due
    .filter((r) => r.state !== 'published')
    .map((r) => `${r.label} on ${r.platform}, due ${new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(r.goAt))}: ${r.state}${r.heldReason ? `, ${r.heldReason}` : ''}`)
  const line = `published check: ${due.length} scheduled to now, ${published.length} published${failures.length ? `; FAILURE: ${failures.join('; ')}` : '; every scheduled post published'}`
  return { line, failures, failed: failures.length > 0 }
}

/**
 * EVERY POST THAT DID NOT PUBLISH, BY NAME (the PM's 22:50 of 28 November 2026, fix (c)): one held or withdrawn at any
 * hour, and one past its slot that did not go, each as "<label> on <network>, due <day> <time>: <state>" in slot order;
 * a post that went, and one still to come, is none. The daily state names these and never reads ALL GREEN beside one
 * (the 13:58 email of 28 November led with ALL GREEN beside four held). Pure.
 */
export function notPublishedNames(rows: readonly ScheduleRow[], now: Date): string[] {
  const day = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short' })
  const clock = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return rows
    .filter((r) => r.state !== 'published' && (Date.parse(r.goAt) <= now.getTime() || r.state === 'held' || r.state === 'expired'))
    .sort((a, b) => Date.parse(a.goAt) - Date.parse(b.goAt))
    .map((r) => `${r.label} on ${r.platform}, due ${day.format(new Date(r.goAt))} ${clock.format(new Date(r.goAt))}: ${r.state}`)
}

const LABEL = (p: { kind: string; city: string; partner_name: string | null }) => `${p.kind.replace(/_/g, ' ')}${p.partner_name ? `, ${p.partner_name}` : ''}, ${p.city}`

/**
 * The whole of today's (Melbourne) schedule with its pieces' labels; publishedCheck picks the rows due by now. It reads
 * the whole day, never 'up to now': this check fires nothing, it reports, so it is no reader of a passed slot (the class
 * test in tests/unit/ops/stale-slot.test.ts). A read that fails throws.
 */
export async function readTodaySchedule(db: Db, dayStart: Date): Promise<ScheduleRow[]> {
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000)
  const s = await db.from('social_piece_schedules').select('piece_id, platform, go_at, state, held_reason').gte('go_at', dayStart.toISOString()).lt('go_at', dayEnd.toISOString()).limit(500)
  if (s.error) throw new Error(`today's schedule could not be read: ${s.error.message}`)
  const rows = (s.data ?? []) as { piece_id: string; platform: string; go_at: string; state: string; held_reason: string | null }[]
  const ids = [...new Set(rows.map((r) => r.piece_id))]
  const p = ids.length ? await db.from('social_pieces').select('id, kind, city, partner_name').in('id', ids) : { data: [], error: null }
  if (p.error) throw new Error(`today's pieces could not be read: ${p.error.message}`)
  const label = new Map(((p.data ?? []) as { id: string; kind: string; city: string; partner_name: string | null }[]).map((x) => [x.id, LABEL(x)]))
  return rows.map((r) => ({ label: label.get(r.piece_id) ?? 'a piece', platform: r.platform, goAt: r.go_at, state: r.state, heldReason: r.held_reason }))
}

/** The unapproved pieces whose slot is 24 or 3 hours away this hour, by name. A read that fails throws. */
export async function readRemindersDue(db: Db, pieceIds: readonly string[], now: Date): Promise<string[]> {
  if (pieceIds.length === 0) return []
  const p = await db.from('social_pieces').select('id, kind, city, partner_name, planned_at').in('id', [...pieceIds])
  if (p.error) throw new Error(`the unapproved pieces' slots could not be read: ${p.error.message}`)
  return ((p.data ?? []) as { id: string; kind: string; city: string; partner_name: string | null; planned_at: string | null }[])
    .flatMap((x) => {
      const due = x.planned_at ? reminderDue(x.planned_at, now) : null
      return due ? [`${LABEL(x)} (its slot in ${due} hours)`] : []
    })
}
