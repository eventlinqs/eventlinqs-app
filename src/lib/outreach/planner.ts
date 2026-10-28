/**
 * AN APPROVED PLAY DRAFTS ITS OWN MESSAGES (window 6, 28 October 2026; the engine plan's FULL AUTOMATION: "Lawal
 * approves a PLAY once (the cohort rule, the template version, the daily cap), never each email").
 *
 * For each approved play, each run, within the day's cap (outreach_play_cap_today, migration 213001):
 *   1. FOLLOW-UPS FIRST, because they are bound to a day: step 2 from day 4 and step 3 from day 10 after step 1 went,
 *      for a contact who has not replied and may still be written to, from the template version the play approved.
 *   2. THEN FIRST MESSAGES to the play's cohort: email contacts with a whole basis, never written to before, at an
 *      organiser that runs a venue in one of the play's cities (cohort_rule.cities; none named means any city).
 * Each message is filled from verified facts and judged by every rule; one that fails is HELD with the rules named for
 * Lawal and does not count against the cap. Queued messages are spread ten minutes apart, so a day's sends do not
 * leave in one burst, and the sender only sends them inside the recipient's business hours.
 *
 * The database judges every draft again and refuses what it must; a refusal is reported in its words and the planner
 * moves on. Nothing here sends.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { draftFromTemplate } from './drafts'

type Admin = SupabaseClient<Database>

export type CohortRule = { cities?: string[] }

/**
 * Which of an organiser's published addresses to write to first: the one meant for events, bookings or music, then a
 * general inbox, then anything else (a restaurant or accounts inbox last). A named person always comes first.
 */
export function addressRank(address: string, personName: string | null): number {
  if (personName && personName.trim()) return 0
  const local = address.split('@')[0].toLowerCase()
  if (/(event|booking|book|gig|music|entertain|program|band|venue|function)/.test(local)) return 1
  if (/^(info|hello|hi|contact|enquir|inquir|admin|office|team|general|mail)/.test(local)) return 2
  return 3
}

export type PlayReport = { playId: string; name: string; cap: number; usedToday: number; queued: number; held: { contactId: string; why: string[] }[]; refused: { contactId: string; why: string }[] }

const SPACING_MINUTES = 10
const DAY_MS = 86_400_000

function melbourneDayStart(now: Date): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  // The instant Melbourne's day began: try the two offsets the zone uses and keep the one that reads as midnight.
  for (const offset of ['+11:00', '+10:00']) {
    const at = new Date(`${ymd}T00:00:00${offset}`)
    const hour = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', hourCycle: 'h23' }).format(at)
    if (Number(hour) === 0) return at
  }
  return new Date(`${ymd}T00:00:00+10:00`)
}

/** Days between two instants, counted on Melbourne's calendar, as the database counts the cadence. */
export function melbourneDaysBetween(from: Date, to: Date): number {
  return Math.round((melbourneDayStart(to).getTime() - melbourneDayStart(from).getTime()) / DAY_MS)
}

export async function planPlays(db: Admin, deps: { now: Date; origin: string; actingUser: string }): Promise<PlayReport[]> {
  const plays = await db.from('outreach_plays').select('id, name, cohort_rule, step1_template_id, step2_template_id, step3_template_id').eq('state', 'approved')
  if (plays.error) throw new Error(`outreach_plays: ${plays.error.message}`)
  const reports: PlayReport[] = []

  for (const play of plays.data ?? []) {
    const capAnswer = await db.rpc('outreach_play_cap_today', { p_play: play.id })
    const cap = capAnswer.data ?? 0
    const used = await db
      .from('outreach_touches')
      .select('id', { count: 'exact', head: true })
      .eq('play_id', play.id)
      .in('state', ['queued', 'sending', 'sent'])
      .gte('drafted_at', melbourneDayStart(deps.now).toISOString())
    const report: PlayReport = { playId: play.id, name: play.name, cap, usedToday: used.count ?? 0, queued: 0, held: [], refused: [] }
    let room = cap - report.usedToday
    let slot = 0

    const draft = async (contactId: string, step: 1 | 2 | 3, templateId: string) => {
      const r = await draftFromTemplate(db, {
        contactId,
        templateKey: `play ${play.name} step ${step}`,
        templateId,
        purpose: 'cadence',
        step,
        playId: play.id,
        scheduledFor: new Date(deps.now.getTime() + slot * SPACING_MINUTES * 60_000),
        origin: deps.origin,
        draftedBy: deps.actingUser,
      })
      if (r.state === 'refused') report.refused.push({ contactId, why: r.reason })
      else if (r.value.state === 'held') report.held.push({ contactId, why: r.value.heldBecause })
      else {
        report.queued++
        room--
        slot++
      }
    }

    // 1. Follow-ups that are due.
    const firsts = await db.from('outreach_touches').select('contact_id, sent_at').eq('play_id', play.id).eq('step', 1).eq('state', 'sent')
    for (const first of firsts.data ?? []) {
      if (room <= 0) break
      const days = melbourneDaysBetween(new Date(first.sent_at as string), deps.now)
      const later = await db.from('outreach_touches').select('step, state').eq('contact_id', first.contact_id).in('step', [2, 3]).neq('state', 'void')
      const has = (n: number) => (later.data ?? []).some((t) => t.step === n)
      const sent2 = (later.data ?? []).some((t) => t.step === 2 && t.state === 'sent')
      if (!has(2) && days >= 4 && play.step2_template_id) await draft(first.contact_id, 2, play.step2_template_id)
      else if (sent2 && !has(3) && days >= 10 && play.step3_template_id) await draft(first.contact_id, 3, play.step3_template_id)
    }

    // 2. First messages to the cohort.
    if (room > 0) {
      const rule = (play.cohort_rule ?? {}) as CohortRule
      const found = await db.from('organiser_contacts').select('id, organiser_id, address, person_name').eq('channel', 'email').neq('basis', 'none').order('created_at').limit(500)
      const candidates = { data: [...(found.data ?? [])].sort((a, b) => addressRank(a.address, a.person_name) - addressRank(b.address, b.person_name)) }
      const ids = candidates.data.map((c) => c.id)
      const touched = ids.length ? await db.from('outreach_touches').select('contact_id').in('contact_id', ids) : { data: [] as { contact_id: string }[] }
      const written = new Set((touched.data ?? []).map((t) => t.contact_id))
      let allowed: Set<string> | null = null
      if (rule.cities && rule.cities.length > 0) {
        const venues = await db.from('venues').select('id').in('city_slug', rule.cities).is('removed_at', null)
        const links = await db.from('organiser_venues').select('organiser_id').in('venue_id', (venues.data ?? []).map((v) => v.id))
        allowed = new Set((links.data ?? []).map((l) => l.organiser_id))
      }
      const seenOrganiser = new Set<string>()
      for (const c of candidates.data ?? []) {
        if (room <= 0) break
        if (written.has(c.id) || seenOrganiser.has(c.organiser_id)) continue
        if (allowed && !allowed.has(c.organiser_id)) continue
        seenOrganiser.add(c.organiser_id)
        await draft(c.id, 1, play.step1_template_id)
      }
    }
    reports.push(report)
  }
  return reports
}
