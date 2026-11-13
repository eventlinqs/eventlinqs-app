import type { SupabaseClient } from '@supabase/supabase-js'
import { COLLECTOR_AGENT, eventsFromBody, robotsVerdict } from './collect'
import { pageRuleFor } from './page-rules'
import { readByRule, readPage } from '@/lib/events/link-check'
import {
  statedByGates,
  statedDailyInRange,
  statedEveryWeekday,
  statedInDatedList,
  statedInWords,
  statedSeasonal,
  statedUnderName,
} from './stated-words'
import { fold } from './headline-hunt'
import type { Field, Reading } from './resolver'
import { factHoldAnswer, nextStep, type Answer, type OpenHold, type Step, type Tried } from './hold-walk'

/**
 * THE HOLD WALK, RUN BY THE ENGINE ITSELF (the Event Discovery Engine, part (e); Lawal's 18:28 of 13 November 2026: "merges
 * duplicates and retires past and cancelled nights ... with NO window and NO person touching it"). Until now the walk
 * (./hold-walk.ts) ran only by hand (scripts/verify/resolve-run.mts --walk-holds), its steps written as a reviewed SQL file
 * for a window to apply, so an open hold waited on a window. Here the same walk runs in each collection turn, by exactly
 * the same rules and readers: every open hold whose next check is due (or never set) is asked of its next source through
 * the polite reader (robots.txt first, the collector's agent, one request a second per host, a stop at the first 403 or
 * 429); the page states our value, the hold is released (a held night shown again); it calls the night off, the night is
 * cancelled; anything else, its next source tomorrow, or weekly once every source has been read (hold-walk.ts nextStep).
 * A fact hold is answered by the resolver's own rule over a fresh reading of every official it recorded (factHoldAnswer).
 * Each release carries 'the resolver: ...' as released_by, the engine's own mark. At most HOLDS_PER_TURN a turn, oldest
 * due first, and none started after the deadline; the rest are taken by the next turns.
 */
export const HOLDS_PER_TURN = 15

type Link = { url: string; price_from_cents: number | null; availability: string | null }
export type HoldEvent = {
  id: string
  title: string
  start_date: string
  timezone: string | null
  venue_name: string | null
  venue_address: string | null
  links: Link[]
}
type DueHold = {
  id: string
  scope: 'fact' | 'night'
  field: string
  state: 'held' | 'unconfirmed'
  next_source: string | null
  sources_tried: Tried[] | null
  readings: Reading[] | null
  event_id: string
}

export type WalkOutcome = { due: number; walked: number; released: number; cancelled: number; next: number; said: string[]; failed: string[] }

const asField = (f: string) => (f === 'session' ? 'session' : f) as Field

/** The street a venue address names (its first number and street word), as the accuracy sweep reads it. Pure. */
const street = (address: string | null) => {
  const m = fold(address ?? '').match(/\b(\d+[a-z]?)\s+([a-z]+)/)
  return m ? `${m[1]} ${m[2]}` : null
}

/** Whether a page's place is the listing's place: the street where both give one, else the names folded. Pure. */
export function samePlace(e: Pick<HoldEvent, 'venue_name' | 'venue_address'>, name: string, address: string | null): boolean {
  const a = street(e.venue_address)
  const b = street(address)
  if (a && b) return a === b
  const x = fold(e.venue_name ?? '').replace(/^the /, '')
  const y = fold(name).replace(/^the /, '')
  return x !== '' && (x === y || x.includes(y) || y.includes(x))
}

/** The value EventLinqs holds for a held fact. Pure. */
export function storedOf(field: string, e: HoldEvent): string | null {
  const l = e.links?.[0]
  if (field === 'price') return l?.price_from_cents == null ? null : String(l.price_from_cents)
  if (field === 'status') return l?.availability ?? null
  if (field === 'venue') return e.venue_name
  return e.start_date
}

/** The polite reader for one walk: robots.txt first, one request a second per host, a stop at the first 403 or 429. */
export function politeReader(fetcher: typeof fetch, pauseMs = 1000) {
  const lastHit = new Map<string, number>()
  const stopped = new Set<string>()
  const robots = new Map<string, { status: number | null; body: string }>()
  const pages = new Map<string, { status: number | null; body: string; why: string | null }>()
  async function get(u: string): Promise<{ status: number | null; body: string }> {
    const host = new URL(u).host
    if (stopped.has(host)) return { status: null, body: '' }
    const wait = (lastHit.get(host) ?? 0) + pauseMs - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastHit.set(host, Date.now())
    try {
      const res = await fetcher(u, { headers: { 'User-Agent': COLLECTOR_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(25000) })
      if (res.status === 403 || res.status === 429) stopped.add(host)
      const pdf = /pdf/i.test(res.headers.get('content-type') ?? '')
      return { status: res.status, body: res.ok && !pdf ? await res.text() : '' }
    } catch {
      return { status: null, body: '' }
    }
  }
  async function read(u: string): Promise<{ status: number | null; body: string; why: string | null }> {
    const hit = pages.get(u)
    if (hit) return hit
    let out: { status: number | null; body: string; why: string | null }
    try {
      const at = new URL(u)
      let r = robots.get(at.origin)
      if (!r) {
        r = await get(`${at.origin}/robots.txt`)
        robots.set(at.origin, r)
      }
      if (robotsVerdict(r.status, r.body, at.pathname + at.search) === 'disallowed') out = { status: null, body: '', why: 'robots.txt disallows a re-read' }
      else {
        const p = await get(u)
        out = { ...p, why: p.status === 200 && p.body ? null : `the page answered ${p.status ?? 'nothing'}` }
      }
    } catch {
      out = { status: null, body: '', why: 'not a readable address' }
    }
    pages.set(u, out)
    return out
  }
  return { read, why: (u: string) => pages.get(u)?.why ?? null }
}

type Reader = ReturnType<typeof politeReader>

/** What one page states of one fact, in the resolver's one form per fact (as scripts/verify/resolve-run.mts reads it). */
export async function statedBy(reader: Reader, u: string, field: string, e: HoldEvent): Promise<string | null> {
  const p = await reader.read(u)
  if (p.why) return null
  const zone = e.timezone ?? 'Australia/Melbourne'
  const night = { startsAt: e.start_date, zone }
  if (field === 'price' || field === 'status') {
    const r = readByRule(u, p.body, night) ?? readPage(p.status ?? 0, p.body, night)
    return field === 'price' ? (r.priceFromCents === null ? null : String(r.priceFromCents)) : r.availability
  }
  if (field === 'start' || field === 'session') {
    const rule = pageRuleFor(u)
    const found = rule ? rule.read(p.body, u) : eventsFromBody(p.body, u)
    const at = new Date(e.start_date).getTime()
    if (found.some((f) => Math.abs(new Date(f.startsAt).getTime() - at) < 60_000)) return e.start_date
    if (statedInWords(p.body, e.start_date, zone) === 'both') return e.start_date
    if (statedSeasonal(p.body, e.title, e.start_date, zone) === 'seasonal') return e.start_date
    if (statedByGates(p.body, e.start_date, zone) || statedInDatedList(p.body, e.title, e.start_date, zone)) return e.start_date
    if (statedEveryWeekday(p.body, e.title, e.start_date, zone) === 'weekly') return e.start_date
    if (statedDailyInRange(p.body, e.start_date, zone)) return e.start_date
    if (statedUnderName(p.body, e.title, e.start_date, zone)) return e.start_date
    const same = found.filter((f) => fold(f.title) === fold(e.title))
    return same.length === 1 ? new Date(same[0].startsAt).toISOString() : null
  }
  if (field === 'venue') {
    const rule = pageRuleFor(u)
    const found = rule ? rule.read(p.body, u) : eventsFromBody(p.body, u)
    const at = new Date(e.start_date).getTime()
    const n = found.find((f) => Math.abs(new Date(f.startsAt).getTime() - at) < 60_000) ?? (found.length === 1 ? found[0] : undefined)
    if (!n?.venueName) return null
    return samePlace(e, n.venueName, n.venueAddress ?? null) ? (e.venue_name ?? n.venueName) : `${n.venueName}${n.venueAddress ? ` (${n.venueAddress})` : ''}`
  }
  return null
}

/**
 * Whether a page's own Event data marks THE night cancelled (eventStatus EventCancelled, at the same minute, or the page's
 * one night of this title). The collector skips a cancelled event when it reads (./collect.ts), so the walk reads the
 * status itself: a night its own page calls cancelled is cancelled here, never left held. Pure.
 */
export function cancelledOnPage(body: string, e: Pick<HoldEvent, 'title' | 'start_date'>): boolean {
  const at = new Date(e.start_date).getTime()
  const nodes: Record<string, unknown>[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      nodes.push(o)
      if (o['@graph']) walk(o['@graph'])
      if (o['subEvent']) walk(o['subEvent'])
    }
  }
  for (const [, raw] of body.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(raw.trim()))
    } catch {
      continue
    }
  }
  const cancelled = nodes.filter((n) => String(n['eventStatus'] ?? '').toLowerCase().includes('cancelled'))
  return cancelled.some((n) => {
    const start = Date.parse(String(n['startDate'] ?? ''))
    if (Number.isFinite(start) && Math.abs(start - at) < 60_000) return true
    return typeof n['name'] === 'string' && fold(n['name']) === fold(e.title) && Number.isFinite(start) && Math.abs(start - at) < 24 * 60 * 60 * 1000
  })
}

/** Whether a page calls THE night off: cancelled in its own Event data, or postponed or rescheduled (the collector's calledOff). */
async function calledOffBy(reader: Reader, u: string, e: HoldEvent): Promise<boolean> {
  const p = await reader.read(u)
  if (p.why) return false
  if (cancelledOnPage(p.body, e)) return true
  const rule = pageRuleFor(u)
  const found = rule ? rule.read(p.body, u) : eventsFromBody(p.body, u)
  const at = new Date(e.start_date).getTime()
  return found.some((f) => Math.abs(new Date(f.startsAt).getTime() - at) < 60_000 && (f as { calledOff?: boolean }).calledOff === true)
}

/** The answer one due hold gets this turn, by the walk's own rules. */
export async function answerFor(reader: Reader, h: DueHold, hold: OpenHold, e: HoldEvent): Promise<Answer> {
  const officials = [...new Map((h.readings ?? []).filter((r) => /^https?:\/\//.test(r.url)).map((r) => [r.url, r] as const)).values()]
  if (h.scope === 'fact' && officials.length > 0) {
    const fresh: Reading[] = []
    for (const r of officials) fresh.push({ kind: r.kind, url: r.url, value: await statedBy(reader, r.url, h.field, e) })
    const ownUrl = officials.find((r) => r.kind === 'venue' || r.kind === 'listing')?.url ?? officials[0].url
    return factHoldAnswer(asField(h.field), storedOf(h.field, e) ?? '', ownUrl, fresh)
  }
  if (!hold.nextSource) return { kind: 'silent', why: 'no source to read' }
  const value = await statedBy(reader, hold.nextSource, h.field === 'session' ? 'start' : h.field, e)
  const stored = storedOf(h.field, e)
  if (value !== null && value === stored) return { kind: 'states', words: `its ${h.field} '${value}'` }
  if ((h.scope === 'night' || h.field === 'start' || h.field === 'session') && (await calledOffBy(reader, hold.nextSource, e))) return { kind: 'cancelled', words: 'the night called off' }
  return { kind: 'silent', why: value !== null ? `states another ${h.field}: ${value}` : (reader.why(hold.nextSource) ?? 'does not state it') }
}

/** Writes one step as the reviewed file did (hold-walk.ts holdWalkSql), each write guarded by the state it expects. */
async function applyStep(db: SupabaseClient, h: DueHold, hold: OpenHold, step: Step): Promise<void> {
  const fail = (what: string, m: string) => {
    throw new Error(`${what}: ${m}`)
  }
  if (step.kind === 'release') {
    if (hold.scope === 'night' && hold.eventId) {
      const { error } = await db.from('events').update({ visibility: 'public' }).eq('id', hold.eventId).eq('visibility', 'private')
      if (error) fail('the night could not be shown again', error.message)
    }
    const { error } = await db.from('listing_holds').update({ released_at: new Date().toISOString(), released_by: step.by }).eq('id', h.id).is('released_at', null)
    if (error) fail('the hold could not be released', error.message)
  } else if (step.kind === 'cancel') {
    if (hold.eventId) {
      const { error } = await db.from('events').update({ status: 'cancelled' }).eq('id', hold.eventId).eq('status', 'published').eq('listing_source', 'eventlinqs')
      if (error) fail('the night could not be cancelled', error.message)
    }
    const { error } = await db.from('listing_holds').update({ released_at: new Date().toISOString(), released_by: step.by }).eq('id', h.id).is('released_at', null)
    if (error) fail('the hold could not be released', error.message)
  } else {
    const { error } = await db
      .from('listing_holds')
      .update({
        state: step.state,
        next_source: step.nextSource,
        next_check_at: step.nextCheckAt,
        sources_tried: [...(h.sources_tried ?? []), ...(step.tried ? [step.tried] : [])],
      })
      .eq('id', h.id)
      .is('released_at', null)
    if (error) fail('the hold could not be moved to its next source', error.message)
  }
}

/** Walks the due holds this turn. */
export async function walkHolds(
  db: SupabaseClient,
  fetcher: typeof fetch,
  now: Date,
  deadline: number,
  perTurn = HOLDS_PER_TURN,
  pauseMs = 1000,
): Promise<WalkOutcome> {
  const out: WalkOutcome = { due: 0, walked: 0, released: 0, cancelled: 0, next: 0, said: [], failed: [] }
  const { data: due, error } = await db
    .from('listing_holds')
    .select('id, scope, field, state, next_source, sources_tried, readings, event_id, next_check_at')
    .is('released_at', null)
    .or(`next_check_at.is.null,next_check_at.lte.${now.toISOString()}`)
    .order('next_check_at', { ascending: true, nullsFirst: true })
    .limit(200)
  if (error) throw new Error(`the open holds could not be read: ${error.message}`)
  const holds = ((due ?? []) as DueHold[]).filter((h) => !!h.event_id)
  out.due = holds.length
  const taken = holds.slice(0, perTurn)
  if (taken.length === 0) return out
  const ids = [...new Set(taken.map((h) => h.event_id))]
  const { data: events, error: eErr } = await db.from('events').select('id, title, start_date, timezone, venue_name, venue_address').in('id', ids)
  if (eErr) throw new Error(`the held nights could not be read: ${eErr.message}`)
  const { data: links, error: lErr } = await db.from('event_booking_links').select('event_id, url, price_from_cents, availability, position').in('event_id', ids).order('position')
  if (lErr) throw new Error(`the held nights' links could not be read: ${lErr.message}`)
  const byId = new Map(
    (events ?? []).map((e) => [
      e.id as string,
      { ...(e as Omit<HoldEvent, 'links'>), links: (links ?? []).filter((l) => l.event_id === e.id) as unknown as Link[] } as HoldEvent,
    ]),
  )
  const reader = politeReader(fetcher, pauseMs)
  for (const h of taken) {
    if (Date.now() >= deadline) break
    const e = byId.get(h.event_id)
    if (!e) {
      out.failed.push(`hold ${h.id}: its night is no longer there`)
      continue
    }
    const sources = [...new Set([...(h.readings ?? []).map((r) => r.url), ...e.links.map((l) => l.url)])].filter((u) => /^https?:\/\//.test(u))
    const hold: OpenHold = {
      id: h.id,
      eventId: e.id,
      scope: h.scope,
      field: h.field,
      state: h.state,
      nextSource: h.next_source ?? sources[0] ?? null,
      sourcesTried: h.sources_tried ?? [],
      sources,
    }
    try {
      const answer = await answerFor(reader, h, hold, e)
      const step = nextStep(hold, answer, now)
      await applyStep(db, h, hold, step)
      out.walked += 1
      if (step.kind === 'release') out.released += 1
      else if (step.kind === 'cancel') out.cancelled += 1
      else out.next += 1
      out.said.push(`${e.title} (${h.scope} ${h.field}): ${answer.kind === 'silent' ? `kept, ${answer.why}` : `${answer.kind}, ${answer.words}`}`)
    } catch (err) {
      out.failed.push(`${e.title}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return out
}
