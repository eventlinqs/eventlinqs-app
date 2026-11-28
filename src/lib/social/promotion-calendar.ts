import type { SupabaseClient } from '@supabase/supabase-js'
import { soldOut } from './store'
import { listingWindowOrPredicate, localDayOfWeek } from '@/lib/events/listing-window'

/**
 * THE PROMOTION CALENDAR (the PM's 15:58 and 16:05 of 27 November 2026, car O; the social operating model of 27 November,
 * version 2, section 1; migration 20261128060001). Every event still ahead is given a type from its own fields, and each
 * stage (the initial promotion, the follow up, the final reminder) its due day from the newest lead times in
 * promotion_lead_times: defaults the learning run tunes, never constants here. An event listed after its initial day
 * enters within 48 hours; one listed under 24 hours before gets no feed promotion, a story at most; a sold out, cancelled,
 * postponed or ended event is excluded with its reason. The daily run writes event_promotions; the studio reads its due
 * rows. Nothing here posts.
 */

type Db = SupabaseClient

export const EVENT_TYPES = ['major', 'theatre', 'comedy_nightlife', 'community', 'sport', 'free_local', 'season', 'recurring'] as const
export type EventType = (typeof EVENT_TYPES)[number]
export const STAGES = ['initial', 'follow_up', 'final'] as const
export type PromoStage = (typeof STAGES)[number]

export type LeadRow = { readonly eventType: EventType; readonly stage: PromoStage; readonly daysBefore: number | null; readonly rule: string | null; readonly storyOnly: boolean; readonly version: number }

export type ClassifyInput = {
  readonly category: string | null
  readonly isFree: boolean
  readonly capacity: number | null
  readonly seriesRule: string | null
  readonly isRecurring: boolean
  readonly startDate: string
  readonly endDate: string | null
}

const DAY = 86_400_000
/** A season is a run of this many days or more (section 1: "long running seasons and exhibitions, multi week"). */
export const SEASON_MIN_DAYS = 14

/** The event's type by section 1, from its own fields, with the basis said. Pure. */
export function classifyEvent(e: ClassifyInput): { readonly type: EventType; readonly basis: string } {
  const cat = e.category ?? 'none'
  const cap = e.capacity ?? 0
  if (e.seriesRule === 'weekly' || e.seriesRule === 'fortnightly' || e.isRecurring) return { type: 'recurring', basis: e.seriesRule ? `series rule ${e.seriesRule}` : 'a recurring event' }
  const runDays = e.endDate ? Math.floor((Date.parse(e.endDate) - Date.parse(e.startDate)) / DAY) : 0
  if (runDays >= SEASON_MIN_DAYS) return { type: 'season', basis: `a run of ${runDays} days` }
  if (e.isFree) return { type: 'free_local', basis: 'free' }
  if (cat === 'festival') return { type: 'major', basis: 'category festival' }
  if (cat === 'music' && cap >= 5000) return { type: 'major', basis: `music at a venue of ${cap}` }
  if (cat === 'theatre') return { type: 'theatre', basis: 'category theatre' }
  if (cat === 'music' && cap >= 1000) return { type: 'theatre', basis: `music at a venue of ${cap}, a ticketed performance` }
  if (cat === 'comedy' || cat === 'nightlife' || cat === 'music') return { type: 'comedy_nightlife', basis: `category ${cat}${cat === 'music' ? (cap ? ` at a venue of ${cap}` : ', venue size not recorded') : ''}` }
  if (cat === 'sports') return { type: 'sport', basis: 'category sports' }
  return { type: 'community', basis: `category ${cat}` }
}

/** The newest version of each type and stage. Pure. */
export function newestLeads(rows: readonly LeadRow[]): Map<string, LeadRow> {
  const out = new Map<string, LeadRow>()
  for (const r of rows) {
    const k = `${r.eventType}|${r.stage}`
    const had = out.get(k)
    if (!had || r.version > had.version) out.set(k, r)
  }
  return out
}

/** A calendar day (YYYY-MM-DD) in Melbourne. Pure. */
export function melbourneDay(at: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at))
}
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

export type StageDue = { readonly stage: PromoStage; readonly dueOn: string; readonly storyOnly: boolean; readonly lateListing: boolean; readonly version: number }

/**
 * Each stage's due day for one event. A stage day already past when the event was listed: the initial promotion enters
 * the day after its listing (within 48 hours) and before its day, the others still ahead follow; listed under 24 hours
 * before: no feed stage, only the final story where its type has one. Never a feed stage on the event's own day. Pure.
 */
export function stageDays(e: { readonly startDate: string; readonly endDate: string | null; readonly createdAt: string; readonly type: EventType }, leads: ReadonlyMap<string, LeadRow>): StageDue[] {
  const start = melbourneDay(e.startDate)
  const end = e.endDate ? melbourneDay(e.endDate) : start
  const listed = melbourneDay(e.createdAt)
  const late24 = Date.parse(e.startDate) - Date.parse(e.createdAt) < DAY
  // The weekday of its start in Melbourne, from the one weekend definition (src/lib/events/listing-window.ts).
  const startDow = localDayOfWeek(new Date(e.startDate), 'Australia/Melbourne')
  const out: StageDue[] = []
  for (const stage of STAGES) {
    const l = leads.get(`${e.type}|${stage}`)
    if (!l) continue
    let due: string | null
    if (l.daysBefore !== null) due = addDays(start, -l.daysBefore)
    else if (l.rule === 'opening_week' || l.rule === 'fortnightly_discovery') due = addDays(start, -7)
    else if (l.rule === 'mid_run') due = addDays(start, Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY / 2))
    else if (l.rule === 'final_week') due = addDays(end, -7)
    else if (l.rule === 'weekend_preview') due = [5, 6, 0].includes(startDow) ? addDays(start, -((startDow + 7 - 3) % 7)) : null
    else if (l.rule === 'event_day') due = start
    else due = null
    if (due === null) continue
    if (late24 && !l.storyOnly) continue
    let lateListing = false
    if (due < listed) {
      if (stage !== 'initial') continue
      due = addDays(listed, 1)
      lateListing = true
    }
    if (!l.storyOnly && due >= start && e.type !== 'season') continue
    out.push({ stage, dueOn: due, storyOnly: l.storyOnly, lateListing, version: l.version })
  }
  return out
}

/** Why an event gets no promotion now, or null. Pure. */
export function exclusionOf(e: { readonly status: string; readonly soldOut: boolean; readonly ended: boolean }): string | null {
  if (e.status !== 'published') return `it is ${e.status}`
  if (e.ended) return 'it has ended'
  if (e.soldOut) return 'it is sold out'
  return null
}

type EventRow = { id: string; start_date: string; end_date: string | null; created_at: string; is_free: boolean; is_recurring: boolean | null; status: string; category_id: string | null; venue_id: string | null; listing_series_id: string | null }

const chunks = <T,>(xs: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

/** Rows of one table by id, read a hundred at a time. A read that fails throws. */
async function byIds<T extends Record<string, unknown>>(db: Db, table: string, cols: string, key: string, ids: readonly string[]): Promise<T[]> {
  const out: T[] = []
  for (const part of chunks([...new Set(ids)], 100)) {
    const r = await db.from(table).select(cols).in(key, part)
    if (r.error) throw new Error(`${table} could not be read: ${r.error.message}`)
    out.push(...((r.data ?? []) as unknown as T[]))
  }
  return out
}

/** The horizon the calendar plans: the longest lead (42 days) and a margin. */
export const PLAN_AHEAD_DAYS = 75

/**
 * THE DAILY CALENDAR RUN: every published, non test event starting within the horizon gets its type and its stage rows
 * (event_promotions, one an event and stage); a row already posted is never rewritten; a due row whose event is no longer
 * published, has ended or is sold out is marked excluded with its reason. Returns the line its run writes.
 */
export async function planPromotions(db: Db, now: Date): Promise<{ readonly written: number; readonly excluded: number; readonly line: string }> {
  const lt = await db.from('promotion_lead_times').select('event_type, stage, days_before, rule, story_only, version')
  if (lt.error) throw new Error(`the lead times could not be read: ${lt.error.message}`)
  const leads = newestLeads(((lt.data ?? []) as { event_type: EventType; stage: PromoStage; days_before: number | null; rule: string | null; story_only: boolean; version: number }[]).map((r) => ({ eventType: r.event_type, stage: r.stage, daysBefore: r.days_before, rule: r.rule, storyOnly: r.story_only, version: r.version })))
  const ev = await db
    .from('events')
    .select('id, start_date, end_date, created_at, is_free, is_recurring, status, category_id, venue_id, listing_series_id')
    .eq('status', 'published')
    .eq('is_test', false)
    // Published means visible until it has ended (the one listing window), so a running season keeps its stages.
    .or(listingWindowOrPredicate(now))
    .lt('start_date', new Date(now.getTime() + PLAN_AHEAD_DAYS * DAY).toISOString())
    .limit(5000)
  if (ev.error) throw new Error(`the events ahead could not be read: ${ev.error.message}`)
  const events = (ev.data ?? []) as EventRow[]
  const ids = events.map((e) => e.id)
  const [cats, venues, series, tiers, links] = await Promise.all([
    byIds<{ id: string; slug: string }>(db, 'event_categories', 'id, slug', 'id', events.flatMap((e) => (e.category_id ? [e.category_id] : []))),
    byIds<{ id: string; capacity: number | null }>(db, 'venues', 'id, capacity', 'id', events.flatMap((e) => (e.venue_id ? [e.venue_id] : []))),
    byIds<{ id: string; rule: string }>(db, 'event_series', 'id, rule', 'id', events.flatMap((e) => (e.listing_series_id ? [e.listing_series_id] : []))),
    byIds<{ event_id: string; total_capacity: number; sold_count: number; reserved_count: number; is_active: boolean }>(db, 'ticket_tiers', 'event_id, total_capacity, sold_count, reserved_count, is_active', 'event_id', ids),
    byIds<{ event_id: string; availability: string }>(db, 'event_booking_links', 'event_id, availability', 'event_id', ids),
  ])
  const cat = new Map(cats.map((c) => [c.id, c.slug]))
  const cap = new Map(venues.map((v) => [v.id, v.capacity]))
  const rule = new Map(series.map((s) => [s.id, s.rule]))
  const rows: Record<string, unknown>[] = []
  let excluded = 0
  for (const e of events) {
    const why = exclusionOf({ status: e.status, ended: false, soldOut: soldOut(tiers.filter((t) => t.event_id === e.id), links.filter((l) => l.event_id === e.id)) })
    const { type, basis } = classifyEvent({
      category: e.category_id ? (cat.get(e.category_id) ?? null) : null,
      isFree: e.is_free,
      capacity: e.venue_id ? (cap.get(e.venue_id) ?? null) : null,
      seriesRule: e.listing_series_id ? (rule.get(e.listing_series_id) ?? null) : null,
      isRecurring: Boolean(e.is_recurring),
      startDate: e.start_date,
      endDate: e.end_date,
    })
    for (const s of stageDays({ startDate: e.start_date, endDate: e.end_date, createdAt: e.created_at, type }, leads)) {
      if (why) excluded++
      rows.push({
        event_id: e.id, event_type: type, type_basis: basis, stage: s.stage, due_on: s.dueOn, story_only: s.storyOnly, late_listing: s.lateListing, lead_version: s.version,
        state: why ? 'excluded' : 'due', excluded_reason: why, updated_at: now.toISOString(),
      })
    }
  }
  // A posted row is never rewritten: the rows already posted are read and left out of the write.
  const posted = new Set(await readPosted(db, ids))
  const write = rows.filter((r) => !posted.has(`${r.event_id}|${r.stage}`))
  for (const part of chunks(write, 200)) {
    const w = await db.from('event_promotions').upsert(part, { onConflict: 'event_id,stage' })
    if (w.error) throw new Error(`the calendar could not be written: ${w.error.message}`)
  }
  // A due row whose event left the published set (cancelled, postponed, unpublished) or has started is excluded.
  const gone = await db.from('event_promotions').select('id, event_id').eq('state', 'due').lt('due_on', melbourneDay(new Date(now.getTime() + PLAN_AHEAD_DAYS * DAY))).limit(5000)
  if (gone.error) throw new Error(`the due rows could not be read: ${gone.error.message}`)
  const live = new Set(ids)
  const stale = ((gone.data ?? []) as { id: string; event_id: string }[]).filter((r) => !live.has(r.event_id))
  for (const part of chunks(stale.map((r) => r.id), 100)) {
    const u = await db.from('event_promotions').update({ state: 'excluded', excluded_reason: 'no longer published, or already started', updated_at: now.toISOString() }).in('id', part)
    if (u.error) throw new Error(`the stale rows could not be excluded: ${u.error.message}`)
  }
  const line = `promotion calendar: ${events.length} events ahead, ${write.length} stage rows written (${write.length - excluded} due, ${excluded} excluded), ${stale.length} earlier rows excluded`
  return { written: write.length, excluded: excluded + stale.length, line }
}

async function readPosted(db: Db, ids: readonly string[]): Promise<string[]> {
  const out: string[] = []
  for (const part of chunks(ids, 100)) {
    const r = await db.from('event_promotions').select('event_id, stage').eq('state', 'posted').in('event_id', part)
    if (r.error) throw new Error(`the posted rows could not be read: ${r.error.message}`)
    out.push(...((r.data ?? []) as { event_id: string; stage: string }[]).map((x) => `${x.event_id}|${x.stage}`))
  }
  return out
}
