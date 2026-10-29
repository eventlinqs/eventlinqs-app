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

/** Who a play writes to: organisers at a venue in these cities, and, when named, only these organisers. */
export type CohortRule = { cities?: string[]; organisers?: string[] }

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

/** How many new first DMs are drafted for Lawal each day: EventLinqs' own choice (UNSOURCED), a list he clears by hand. */
export const DM_DRAFTS_PER_DAY = 10

export type DmReport = { drafted: number; followUps: number; held: { contactId: string; why: string[] }[]; refused: { contactId: string; why: string }[] }

/**
 * DMs ARE SENT BY LAWAL BY HAND, never by the system (Meta forbids automated messaging; the engine plan). The planner
 * holds them for him: message 2 (first_dm) to organisers reachable only on Instagram, whose handle has a whole basis and
 * who have never been written to, at most DM_DRAFTS_PER_DAY new ones a day; and the day 4 DM (day4_dm, "the only DM
 * follow-up") once he has marked the first one sent. He sends each with one tap and marks it sent (markSent).
 */
export async function planDms(db: Admin, deps: { now: Date; origin: string; actingUser: string; organisers?: string[] }): Promise<DmReport> {
  const report: DmReport = { drafted: 0, followUps: 0, held: [], refused: [] }
  const record = (contactId: string, r: Awaited<ReturnType<typeof draftFromTemplate>>, followUp: boolean) => {
    if (r.state === 'refused') report.refused.push({ contactId, why: r.reason })
    else {
      if (r.value.heldBecause.length) report.held.push({ contactId, why: r.value.heldBecause })
      if (followUp) report.followUps++
      else report.drafted++
    }
  }

  const firsts = await db.from('outreach_touches').select('contact_id, sent_at, organiser_contacts!inner(channel)').eq('step', 1).eq('state', 'sent').eq('organiser_contacts.channel', 'instagram')
  for (const first of firsts.data ?? []) {
    if (melbourneDaysBetween(new Date(first.sent_at as string), deps.now) < 4) continue
    const later = await db.from('outreach_touches').select('id').eq('contact_id', first.contact_id).eq('step', 2).neq('state', 'void').limit(1)
    if ((later.data ?? []).length) continue
    record(first.contact_id, await draftFromTemplate(db, { contactId: first.contact_id, templateKey: 'day4_dm', purpose: 'cadence', step: 2, scheduledFor: deps.now, origin: deps.origin, draftedBy: deps.actingUser }), true)
  }

  const today = await db
    .from('outreach_touches')
    .select('id, organiser_contacts!inner(channel)', { count: 'exact', head: true })
    .eq('step', 1)
    .eq('organiser_contacts.channel', 'instagram')
    .gte('drafted_at', melbourneDayStart(deps.now).toISOString())
  let room = DM_DRAFTS_PER_DAY - (today.count ?? 0)
  if (room <= 0) return report

  const handles = await db.from('organiser_contacts').select('id, organiser_id').eq('channel', 'instagram').neq('basis', 'none').order('created_at').limit(500)
  const organiserIds = [...new Set((handles.data ?? []).map((h) => h.organiser_id))]
  const reachable = organiserIds.length ? await db.from('organiser_contacts').select('organiser_id, id').in('organiser_id', organiserIds) : { data: [] as { organiser_id: string; id: string }[] }
  const contactsOf = new Map<string, string[]>()
  for (const c of reachable.data ?? []) contactsOf.set(c.organiser_id, [...(contactsOf.get(c.organiser_id) ?? []), c.id])
  const allIds = [...contactsOf.values()].flat()
  const touched = allIds.length ? await db.from('outreach_touches').select('contact_id').in('contact_id', allIds) : { data: [] as { contact_id: string }[] }
  const written = new Set((touched.data ?? []).map((t) => t.contact_id))
  const emailable = organiserIds.length ? await db.from('organiser_contacts').select('organiser_id').in('organiser_id', organiserIds).eq('channel', 'email').neq('basis', 'none') : { data: [] as { organiser_id: string }[] }
  const byEmail = new Set((emailable.data ?? []).map((e) => e.organiser_id))

  for (const h of handles.data ?? []) {
    if (room <= 0) break
    // Email is the automatic channel; a DM is drafted only where no email can go, and never to an organiser already written to.
    if (byEmail.has(h.organiser_id) || (contactsOf.get(h.organiser_id) ?? []).some((id) => written.has(id))) continue
    if (deps.organisers && !deps.organisers.includes(h.organiser_id)) continue
    record(h.id, await draftFromTemplate(db, { contactId: h.id, templateKey: 'first_dm', purpose: 'cadence', step: 1, scheduledFor: deps.now, origin: deps.origin, draftedBy: deps.actingUser }), false)
    written.add(h.id)
    room--
  }
  return report
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
        if (rule.organisers && rule.organisers.length > 0 && !rule.organisers.includes(c.organiser_id)) continue
        seenOrganiser.add(c.organiser_id)
        await draft(c.id, 1, play.step1_template_id)
      }
    }
    reports.push(report)
  }
  return reports
}

/* ------------------------------------------------------------------ partner messages on their triggers */

/**
 * MESSAGE 9, ANYTHING COMING UP, ON ITS TRIGGER (window 6, 29 October 2026; the PM's messages file: "partner, nothing
 * listed in the next 30 days"; the engine plan's FULL AUTOMATION: it sends without Lawal).
 *
 * A partner is an organiser one of whose email contacts said yes (outreach_replies yes or interested) or gave their own
 * words of consent. Each run, a partner who runs a venue, has no published public night at any of its venues in the
 * next 30 days, and was not asked in the last 30 days, gets message 9 drafted to the contact who said yes. It is filled
 * and judged like every message (draftFromTemplate) and the database lets it go only after their yes; nothing here
 * sends, and nothing sends while the sender is on hold.
 */
export const ANYTHING_COMING_UP_DAYS = 30

export type PartnerState = { organiserId: string; contactId: string; venueIds: string[]; upcomingNights: number; lastAskedAt: Date | null }

/** Why message 9 is not due for this partner now, or null when it is. */
export function anythingComingUpRefusal(p: PartnerState, now: Date): string | null {
  if (p.venueIds.length === 0) return 'no venue is linked to this organiser, and the message names one'
  if (p.upcomingNights > 0) return `${p.upcomingNights} night listed in the next ${ANYTHING_COMING_UP_DAYS} days`
  if (p.lastAskedAt && now.getTime() - p.lastAskedAt.getTime() < ANYTHING_COMING_UP_DAYS * 86_400_000) {
    return `asked on ${p.lastAskedAt.toISOString().slice(0, 10)}, under ${ANYTHING_COMING_UP_DAYS} days ago`
  }
  return null
}

type DraftTally = { queued: number; held: { contactId: string; why: string[] }[]; refused: { contactId: string; why: string }[]; notDue: { organiserId: string; why: string }[] }
/** Message 9's tally at the top level; message 8's in afterNight; message 7's in featured. */
export type RelationshipReport = DraftTally & { partners: number; afterNight: DraftTally; featured: DraftTally }

/** organisers, when named, limits the run to them (the TEST drive's own), as planDms does. */
export async function planRelationship(db: Admin, deps: { now: Date; origin: string; actingUser: string; organisers?: string[] }): Promise<RelationshipReport> {
  const report: RelationshipReport = { partners: 0, queued: 0, held: [], refused: [], notDue: [], afterNight: { queued: 0, held: [], refused: [], notDue: [] }, featured: { queued: 0, held: [], refused: [], notDue: [] } }
  const yes = await db.from('outreach_replies').select('contact_id, received_at').in('outcome', ['yes', 'interested']).order('received_at', { ascending: false })
  if (yes.error) throw new Error(`outreach_replies: ${yes.error.message}`)
  const consent = await db.from('organiser_contacts').select('id').eq('basis', 'express_consent').eq('channel', 'email')
  if (consent.error) throw new Error(`organiser_contacts: ${consent.error.message}`)
  const ids = [...new Set([...(yes.data ?? []).map((r) => r.contact_id), ...(consent.data ?? []).map((c) => c.id)])]
  if (ids.length === 0) return report
  const contacts = await db.from('organiser_contacts').select('id, organiser_id').in('id', ids).eq('channel', 'email')
  if (contacts.error) throw new Error(`organiser_contacts: ${contacts.error.message}`)
  // One contact per partner: the most recent yes first, in the order the replies were read.
  const order = new Map(ids.map((id, i) => [id, i]))
  const byOrganiser = new Map<string, string>()
  for (const c of [...(contacts.data ?? [])].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))) {
    if (!byOrganiser.has(c.organiser_id)) byOrganiser.set(c.organiser_id, c.id)
  }
  report.partners = byOrganiser.size

  const template = await db.from('outreach_templates').select('id').eq('key', 'anything_coming_up')
  if (template.error) throw new Error(`outreach_templates: ${template.error.message}`)
  const templateIds = (template.data ?? []).map((t) => t.id)
  const until = new Date(deps.now.getTime() + ANYTHING_COMING_UP_DAYS * 86_400_000)

  for (const [organiserId, contactId] of byOrganiser) {
    if (deps.organisers && !deps.organisers.includes(organiserId)) continue
    const links = await db.from('organiser_venues').select('venue_id').eq('organiser_id', organiserId)
    if (links.error) throw new Error(`organiser_venues: ${links.error.message}`)
    const venueIds = (links.data ?? []).map((l) => l.venue_id)
    let upcomingNights = 0
    if (venueIds.length > 0) {
      const nights = await db
        .from('events')
        .select('id', { count: 'exact', head: true })
        .in('venue_id', venueIds)
        .eq('status', 'published')
        .eq('visibility', 'public')
        .gte('start_date', deps.now.toISOString())
        .lt('start_date', until.toISOString())
      if (nights.error) throw new Error(`events: ${nights.error.message}`)
      upcomingNights = nights.count ?? 0
    }
    let lastAskedAt: Date | null = null
    if (templateIds.length > 0) {
      const partnerContacts = await db.from('organiser_contacts').select('id').eq('organiser_id', organiserId)
      if (partnerContacts.error) throw new Error(`organiser_contacts: ${partnerContacts.error.message}`)
      const asked = await db
        .from('outreach_touches')
        .select('drafted_at')
        .in('contact_id', (partnerContacts.data ?? []).map((c) => c.id))
        .in('template_id', templateIds)
        .neq('state', 'void')
        .order('drafted_at', { ascending: false })
        .limit(1)
      if (asked.error) throw new Error(`outreach_touches: ${asked.error.message}`)
      lastAskedAt = asked.data?.[0] ? new Date(asked.data[0].drafted_at as string) : null
    }
    const why = anythingComingUpRefusal({ organiserId, contactId, venueIds, upcomingNights, lastAskedAt }, deps.now)
    if (why) {
      report.notDue.push({ organiserId, why })
      continue
    }
    const r = await draftFromTemplate(db, { contactId, templateKey: 'anything_coming_up', purpose: 'relationship', scheduledFor: deps.now, origin: deps.origin, draftedBy: deps.actingUser })
    if (r.state === 'refused') report.refused.push({ contactId, why: r.reason })
    else if (r.value.state === 'held') report.held.push({ contactId, why: r.value.heldBecause })
    else report.queued++
  }

  // Message 8: each night report from two to seven days old, not sent by hand, to the partner whose venue held the night.
  const reports = await db
    .from('organiser_night_reports')
    .select('id, event_id, figures, night_ended_at')
    .is('sent_at', null)
    .lte('night_ended_at', new Date(deps.now.getTime() - AFTER_YOUR_NIGHT_DUE_DAYS * 86_400_000).toISOString())
    .gt('night_ended_at', new Date(deps.now.getTime() - AFTER_YOUR_NIGHT_STALE_DAYS * 86_400_000).toISOString())
    .order('night_ended_at')
    .limit(200)
  if (reports.error) throw new Error(`organiser_night_reports: ${reports.error.message}`)
  for (const night of reports.data ?? []) {
    const already = await db.from('outreach_touches').select('id').eq('night_report_id', night.id).neq('state', 'void').limit(1)
    if (already.error) throw new Error(`outreach_touches: ${already.error.message}`)
    if ((already.data ?? []).length > 0) continue
    const event = await db.from('events').select('title, venue_id').eq('id', night.event_id).maybeSingle()
    if (event.error) throw new Error(`events: ${event.error.message}`)
    if (!event.data?.venue_id) continue
    const owners = await db.from('organiser_venues').select('organiser_id').eq('venue_id', event.data.venue_id)
    if (owners.error) throw new Error(`organiser_venues: ${owners.error.message}`)
    const organiserId = (owners.data ?? []).map((o) => o.organiser_id).find((o) => byOrganiser.has(o) && (!deps.organisers || deps.organisers.includes(o)))
    if (!organiserId) continue
    const why = afterYourNightRefusal(new Date(night.night_ended_at), deps.now)
    if (why) {
      report.afterNight.notDue.push({ organiserId, why })
      continue
    }
    const contactId = byOrganiser.get(organiserId)!
    const r = await draftFromTemplate(db, {
      contactId,
      templateKey: 'after_your_night',
      purpose: 'relationship',
      extraFields: afterYourNightFields(night.figures, event.data.title),
      nightReportId: night.id,
      scheduledFor: deps.now,
      origin: deps.origin,
      draftedBy: deps.actingUser,
    })
    if (r.state === 'refused') report.afterNight.refused.push({ contactId, why: r.reason })
    else if (r.value.state === 'held') report.afterNight.held.push({ contactId, why: r.value.heldBecause })
    else report.afterNight.queued++
  }

  // Message 7: each approved partner kit of the last fortnight, once a post naming its night has gone out.
  const kits = await db
    .from('social_pieces')
    .select('id, city, link')
    .eq('kind', 'partner_kit')
    .gte('planned_at', new Date(deps.now.getTime() - FEATURED_LOOKBACK_DAYS * 86_400_000).toISOString())
    .order('planned_at')
    .limit(200)
  if (kits.error) throw new Error(`social_pieces: ${kits.error.message}`)
  for (const kit of kits.data ?? []) {
    const already = await db.from('outreach_touches').select('id').eq('tracked_link', kit.link).neq('state', 'void').limit(1)
    if (already.error) throw new Error(`outreach_touches: ${already.error.message}`)
    if ((already.data ?? []).length > 0) continue
    const approval = await db.from('social_piece_approvals').select('revision').eq('piece_id', kit.id).order('approved_at', { ascending: false }).limit(1)
    if (approval.error) throw new Error(`social_piece_approvals: ${approval.error.message}`)
    if (!approval.data?.[0]) continue
    const rev = await db.from('social_piece_revisions').select('event_ids, caption').eq('piece_id', kit.id).eq('version', approval.data[0].revision).maybeSingle()
    if (rev.error) throw new Error(`social_piece_revisions: ${rev.error.message}`)
    const eventId = rev.data?.event_ids?.[0]
    if (!eventId) continue
    const event = await db.from('events').select('title, venue_id').eq('id', eventId).maybeSingle()
    if (event.error) throw new Error(`events: ${event.error.message}`)
    if (!event.data?.venue_id) continue
    const owners = await db.from('organiser_venues').select('organiser_id').eq('venue_id', event.data.venue_id)
    if (owners.error) throw new Error(`organiser_venues: ${owners.error.message}`)
    const organiserId = (owners.data ?? []).map((o) => o.organiser_id).find((o) => byOrganiser.has(o) && (!deps.organisers || deps.organisers.includes(o)))
    if (!organiserId) continue
    const wentOutAt = await postNamingNightWentOut(db, eventId, kit.id)
    if (!wentOutAt) {
      report.featured.notDue.push({ organiserId, why: 'no post naming the night has gone out yet' })
      continue
    }
    const city = await db.from('cities').select('name').eq('slug', kit.city).maybeSingle()
    if (city.error) throw new Error(`cities: ${city.error.message}`)
    const contactId = byOrganiser.get(organiserId)!
    const r = await draftFromTemplate(db, {
      contactId,
      templateKey: 'featured',
      purpose: 'relationship',
      extraFields: featuredFields({ title: event.data.title, cityName: city.data?.name ?? null, wentOutAt, caption: rev.data?.caption ?? null, link: kit.link, images: kitImages(deps.origin, kit.id) }),
      trackedLink: kit.link,
      scheduledFor: deps.now,
      origin: deps.origin,
      draftedBy: deps.actingUser,
    })
    if (r.state === 'refused') report.featured.refused.push({ contactId, why: r.reason })
    else if (r.value.state === 'held') report.featured.held.push({ contactId, why: r.value.heldBecause })
    else report.featured.queued++
  }
  return report
}

/** When a post naming the night, other than the partner's own kit, first went out: recorded posted, or published. */
async function postNamingNightWentOut(db: Admin, eventId: string, kitId: string): Promise<Date | null> {
  const revisions = await db.from('social_piece_revisions').select('piece_id').contains('event_ids', [eventId]).neq('piece_id', kitId).limit(200)
  if (revisions.error) throw new Error(`social_piece_revisions: ${revisions.error.message}`)
  const pieceIds = [...new Set((revisions.data ?? []).map((r) => r.piece_id))]
  if (pieceIds.length === 0) return null
  const posted = await db.from('social_piece_postings').select('posted_at').in('piece_id', pieceIds).neq('post_url', 'sent').order('posted_at').limit(1)
  if (posted.error) throw new Error(`social_piece_postings: ${posted.error.message}`)
  const published = await db.from('social_piece_schedules').select('published_at').in('piece_id', pieceIds).eq('state', 'published').order('published_at').limit(1)
  if (published.error) throw new Error(`social_piece_schedules: ${published.error.message}`)
  const times = [posted.data?.[0]?.posted_at, published.data?.[0]?.published_at].filter((t): t is string => typeof t === 'string').map((t) => new Date(t))
  return times.length === 0 ? null : new Date(Math.min(...times.map((t) => t.getTime())))
}

/**
 * MESSAGE 7, YOU'RE FEATURED (the PM's messages file; the engine plan's part G: "kit sent to the organiser when their
 * post goes out"; the PM's ruling of 29 October, 16:28). The kit is window 3's partner_kit piece: its approved caption and
 * its own tracked link. Its story is window 3's public /kit/<piece>/<n> (approved kits only). A partner kit is made as a
 * story alone, so the feed image stays empty and the message is held for Lawal on that one field until the template
 * names the story only (the PM's words); everything else is filled.
 */
export const FEATURED_LOOKBACK_DAYS = 14

/** A partner kit's public images (window 3's /kit route): its first slide as the story; no feed version is made. */
export function kitImages(origin: string, pieceId: string): { feed: string | null; story: string | null } {
  return { feed: null, story: `${origin.replace(/\/+$/, '')}/kit/${pieceId}/1` }
}

export function featuredFields(k: { title: string; cityName: string | null; wentOutAt: Date; caption: string | null; link: string; images: { feed: string | null; story: string | null } | null }): Record<string, string | null> {
  return {
    night: k.title,
    city: k.cityName,
    day: new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: 'Australia/Melbourne' }).format(k.wentOutAt),
    caption: k.caption,
    'tracked link': k.link,
    'feed image': k.images?.feed ?? null,
    'story version': k.images?.story ?? null,
  }
}

/**
 * MESSAGE 8, AFTER YOUR NIGHT (the PM's messages file: "2 days after; counted figures only ... clicks never called
 * sales"; the PM's ruling of 29 October, 16:28; window 5's 16:33: the send is recorded once, on this message's row).
 * Its figures are window 5's organiser_night_reports, read as they were counted; a field the report does not hold stays
 * empty, so the message is held for Lawal rather than saying a number nobody counted.
 */
export const AFTER_YOUR_NIGHT_DUE_DAYS = 2
export const AFTER_YOUR_NIGHT_STALE_DAYS = 7

/** Why message 8 is not due for a night that ended at endedAt, or null when it is. */
export function afterYourNightRefusal(endedAt: Date, now: Date): string | null {
  const days = (now.getTime() - endedAt.getTime()) / 86_400_000
  if (days < AFTER_YOUR_NIGHT_DUE_DAYS) return 'the night ended under two days ago'
  if (days >= AFTER_YOUR_NIGHT_STALE_DAYS) return `the night ended ${Math.floor(days)} days ago, too late to report`
  return null
}

const countOf = (v: unknown): string | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? String(v) : null)

/** The message's fields from a report's figures (window 5's NightFigures), each a counted number or empty. */
export function afterYourNightFields(figures: unknown, title: string): Record<string, string | null> {
  const f = (figures && typeof figures === 'object' ? figures : {}) as { viewers?: unknown; pressesOut?: { people?: unknown }; ownLink?: { arrivals?: unknown } | null }
  return {
    night: title,
    gig: 'night',
    views: countOf(f.viewers),
    clicks: countOf(f.pressesOut?.people),
    'share clicks': f.ownLink ? countOf(f.ownLink.arrivals) : null,
  }
}
