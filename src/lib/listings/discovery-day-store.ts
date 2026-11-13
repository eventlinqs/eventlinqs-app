import type { SupabaseClient } from '@supabase/supabase-js'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import {
  addTurn,
  dayBefore,
  judgeDay,
  melbourneDay,
  melbourneDayBounds,
  type DayChecks,
  type DayEvidence,
  type DayNumbers,
  type TurnNumbers,
} from './discovery-day'

/**
 * THE EVENT DISCOVERY ENGINE'S DAY LINE, READ AND WRITTEN (./discovery-day.ts; public.discovery_engine_days). Every count
 * is read from the engine's own records: listing_source_runs (its runs), listing_candidates (what it published and held,
 * and any decision a person made), listing_holds (what it walked, and any hold released by anyone else),
 * listing_sources (what the scout registered, and any source registered by anyone else), organisers and
 * organiser_venues (the CRM organisers it entered and attached), audit_log (an admin's change to a listing) and the
 * listings themselves. Nothing here writes anything but the day line.
 */

/** Text an engine write carries, so a write without it is a person's or a window's. */
export const ENGINE_MARKS = {
  sourceNotes: 'by the nightly scout',
  holdReleasedBy: ['the resolver', 'the Event Discovery Engine'],
} as const

/** Admin audit actions that change a listing, a source, a candidate or a hold (a view changes nothing). */
const ADMIN_CHANGE = /^admin\.(event|events|listing|listings|collected|source|sources|hold|holds|venue|venues)\./

type Row = { day: string; checks: DayChecks | Record<string, never>; manual_steps: number; numbers: DayNumbers; consecutive_days: number; all_passed: boolean }

const isJudged = (checks: unknown): checks is DayChecks => !!checks && typeof checks === 'object' && 'f' in (checks as object)

export function discoveryDayStore(db: SupabaseClient) {
  const days = () => db.from('discovery_engine_days')

  async function readRow(day: string): Promise<Row | null> {
    const { data, error } = await days().select('day, checks, manual_steps, numbers, consecutive_days, all_passed').eq('day', day).maybeSingle()
    if (error) throw new Error(`the engine's day line could not be read: ${error.message}`)
    return (data as Row | null) ?? null
  }

  /** The finished day's evidence, read now. */
  async function evidence(day: string, numbers: DayNumbers, now: Date): Promise<DayEvidence> {
    const { from, to } = melbourneDayBounds(day)
    const count = async (what: string, q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
      const { count: n, error } = await q
      if (error) throw new Error(`${what} could not be counted: ${error.message}`)
      return n ?? 0
    }
    const { data: runRows, error: runErr } = await db.from('listing_source_runs').select('ran_at').gte('ran_at', from).lt('ran_at', to)
    if (runErr) throw new Error(`the runs could not be read: ${runErr.message}`)
    const runs = (runRows ?? []).length
    const hour = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', hourCycle: 'h23' })
    const turnsRan = Math.max(numbers.turns.length, new Set((runRows ?? []).map((r) => hour.format(new Date(r.ran_at as string)))).size)
    const runFailures = await count(
      'the failed runs',
      db.from('listing_source_runs').select('id', { count: 'exact', head: true }).gte('ran_at', from).lt('ran_at', to).eq('succeeded', false),
    )
    const writeFailures = await count(
      'the runs that could not write',
      db.from('listing_source_runs').select('id', { count: 'exact', head: true }).gte('ran_at', from).lt('ran_at', to).ilike('outcome', '%could not be written%'),
    )
    const published = await count(
      'the nights the rules published',
      db.from('listing_candidates').select('id', { count: 'exact', head: true }).eq('decided_by', 'partner_rule').gte('reviewed_at', from).lt('reviewed_at', to).not('published_series_id', 'is', null),
    )
    const held = await count(
      'the nights held',
      db.from('listing_candidates').select('id', { count: 'exact', head: true }).eq('status', 'waiting').gte('found_at', from).lt('found_at', to),
    )
    const heldWithoutReason = await count(
      'the nights held without a reason',
      db.from('listing_candidates').select('id', { count: 'exact', head: true }).eq('status', 'waiting').gte('found_at', from).lt('found_at', to).eq('reasons', '{}'),
    )
    const organisersAdded = await count(
      'the organisers the engine entered',
      db.from('organisers').select('id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to).or('notes.ilike.%nightly scout%,notes.ilike.%Event Discovery Engine%'),
    )
    const holdsOverdue = await count(
      'the holds overdue or unscheduled',
      db.from('listing_holds').select('id', { count: 'exact', head: true }).is('released_at', null)
        .or(`next_check_at.is.null,next_check_at.lt.${new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()}`),
    )
    const changesWaiting = await count(
      'the changed nights waiting on a person',
      db.from('listing_candidates').select('id', { count: 'exact', head: true }).eq('status', 'waiting')
        .overlaps('reasons', ['time_changed', 'venue_changed']).lt('found_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),
    )

    /* The listings now: every upcoming published listing of the listings account, its venue and its title. */
    const listings = await readEveryRow<{ id: string; venue_id: string | null; title: string; start_date: string }>('the upcoming listings', (a, b) =>
      db.from('events').select('id, venue_id, title, start_date').eq('status', 'published').eq('listing_source', 'eventlinqs')
        .gt('start_date', now.toISOString()).order('id').range(a, b) as never,
    )
    const venueIds = [...new Set(listings.map((l) => l.venue_id).filter((v): v is string => !!v))]
    const linked = new Set<string>()
    for (let i = 0; i < venueIds.length; i += 200) {
      const { data, error } = await db.from('organiser_venues').select('venue_id').in('venue_id', venueIds.slice(i, i + 200))
      if (error) throw new Error(`the CRM's venues could not be read: ${error.message}`)
      for (const r of data ?? []) linked.add(r.venue_id as string)
    }
    const listingsWithoutOrganiser = listings.filter((l) => !l.venue_id || !linked.has(l.venue_id)).length
    const seen = new Map<string, number>()
    for (const l of listings) {
      const key = `${l.venue_id}|${l.start_date}|${l.title.trim().toLowerCase()}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    const duplicatesListed = [...seen.values()].filter((n) => n > 1).length

    /* MANUAL STEPS: a write by a window or a person to the sources, the candidates or the listings that day. */
    const personDecisions = await count(
      "a person's decisions",
      db.from('listing_candidates').select('id', { count: 'exact', head: true }).eq('decided_by', 'person').neq('status', 'waiting').gte('reviewed_at', from).lt('reviewed_at', to),
    )
    const { data: released, error: rErr } = await db.from('listing_holds').select('released_by').gte('released_at', from).lt('released_at', to)
    if (rErr) throw new Error(`the released holds could not be read: ${rErr.message}`)
    const handReleased = (released ?? []).filter((r) => !ENGINE_MARKS.holdReleasedBy.some((m) => String(r.released_by ?? '').startsWith(m))).length
    const { data: added, error: sErr } = await db.from('listing_sources').select('notes').gte('created_at', from).lt('created_at', to)
    if (sErr) throw new Error(`the sources registered that day could not be read: ${sErr.message}`)
    const handSources = (added ?? []).filter((r) => !String(r.notes ?? '').includes(ENGINE_MARKS.sourceNotes)).length
    const { data: audits, error: aErr } = await db.from('audit_log').select('action').gte('created_at', from).lt('created_at', to).like('action', 'admin.%')
    if (aErr) throw new Error(`the admin audit could not be read: ${aErr.message}`)
    const adminChanges = (audits ?? []).filter((r) => ADMIN_CHANGE.test(String(r.action)) && !String(r.action).endsWith('.view')).length
    const manualDetail = [
      personDecisions > 0 ? `${personDecisions} candidate decision(s) by a person` : '',
      handReleased > 0 ? `${handReleased} hold(s) released by hand` : '',
      handSources > 0 ? `${handSources} source(s) registered by hand` : '',
      adminChanges > 0 ? `${adminChanges} admin change(s) to listings` : '',
    ].filter(Boolean)

    return {
      numbers,
      turnsRan,
      runs,
      runFailures,
      writeFailures,
      published,
      held,
      heldWithoutReason,
      organisersAdded,
      listingsWithoutOrganiser,
      duplicatesListed,
      holdsOverdue,
      changesWaiting,
      manualSteps: personDecisions + handReleased + handSources + adminChanges,
      manualDetail,
    }
  }

  return {
    /** Adds this turn's numbers to its Melbourne day's line (the line is judged only once the day has ended). */
    async recordTurn(turn: TurnNumbers, at: Date): Promise<void> {
      const day = melbourneDay(at)
      const row = await readRow(day)
      if (row && isJudged(row.checks)) return
      const numbers = addTurn(row?.numbers ?? null, turn)
      const { error } = await days().upsert(
        { day, checks: {}, manual_steps: 0, numbers, consecutive_days: 0, all_passed: false },
        { onConflict: 'day' },
      )
      if (error) throw new Error(`the engine's day line could not be written: ${error.message}`)
    },

    /** Judges yesterday's line once, from the first turn of today; a day already judged is left as it is. */
    async judgeYesterday(now: Date): Promise<{ day: string; consecutiveDays: number; allPassed: boolean } | null> {
      const day = dayBefore(melbourneDay(now))
      const row = await readRow(day)
      if (row && isJudged(row.checks)) return null
      const numbers = row?.numbers ?? { turns: [], scout: { examined: 0, registered: 0, errors: 0, ran: false } }
      const prev = await readRow(dayBefore(day))
      const e = await evidence(day, numbers, now)
      const v = judgeDay(e, prev && isJudged(prev.checks) ? { consecutiveDays: prev.consecutive_days } : null)
      const { error } = await days().upsert(
        {
          day,
          checks: v.checks,
          manual_steps: e.manualSteps,
          numbers: { ...numbers, evidence: { ...e, numbers: undefined } },
          consecutive_days: v.consecutiveDays,
          all_passed: v.allPassed,
          written_at: now.toISOString(),
        },
        { onConflict: 'day' },
      )
      if (error) throw new Error(`the engine's verdict could not be written: ${error.message}`)
      return { day, consecutiveDays: v.consecutiveDays, allPassed: v.allPassed }
    },

    /** The newest judged line, for the Command Centre. */
    async newestJudged(): Promise<{ day: string; checks: DayChecks; manualSteps: number; consecutiveDays: number } | null> {
      const { data, error } = await days().select('day, checks, manual_steps, consecutive_days').not('checks', 'eq', '{}').order('day', { ascending: false }).limit(1)
      if (error) throw new Error(`the engine's day line could not be read: ${error.message}`)
      const r = (data ?? [])[0] as { day: string; checks: DayChecks; manual_steps: number; consecutive_days: number } | undefined
      return r ? { day: r.day, checks: r.checks, manualSteps: r.manual_steps, consecutiveDays: r.consecutive_days } : null
    },
  }
}
