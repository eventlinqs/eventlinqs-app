import type { SupabaseClient } from '@supabase/supabase-js'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { melbourneDay } from '@/lib/growth/desk'
import type { CommsCategory } from '@/lib/comms/categories'
import {
  combine,
  nextGoAt,
  noticeFigures,
  notificationFigures,
  outcomeFigures,
  reportFigures,
  reportGroups,
  reportNotes,
  sectionsInOrder,
  sentRecordFigures,
  socialFigures,
  socialNotes,
  touchFigures,
  type Figures,
  type ReportGroups,
  type Section,
  type TouchRow,
} from '@/lib/comms/centre-math'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { nightPartner } from '@/lib/outreach/after-your-night'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import { nextWindowStart } from '@/lib/outreach/self-queue'

/**
 * THE GROWTH AND COMMUNICATIONS CENTRE, READ FROM THE DATABASE ONLY (Law 24; the directive's section 7). Every figure
 * is counted from the rows each message record holds, by the one category migration 20261119125001 records on them;
 * the counting is centre-math.ts. Nothing is estimated, and nothing here writes.
 */
type Db = SupabaseClient

export type Centre = { sections: Section[]; readAt: string; firstLettersToday: number }

export async function readCentre(db: Db, now: Date): Promise<Centre> {
  const touches = await readEveryRow<TouchRow & { comms_category: CommsCategory; comms_subtype: string; scheduled_for: string | null; night_report_id: string | null }>('the CRM messages', (a, b) =>
    db.from('outreach_touches').select('id, state, drafted_at, sent_at, comms_category, comms_subtype, scheduled_for, night_report_id').order('id').range(a, b) as never,
  )
  const bounces = await readEveryRow<{ touch_id: string }>('the bounces', (a, b) =>
    db.from('outreach_delivery_events').select('touch_id').in('kind', ['bounce_hard', 'bounce_soft']).order('id').range(a, b) as never,
  )
  const replies = await readEveryRow<{ touch_id: string | null; contact_id: string; outcome: string }>('the replies', (a, b) =>
    db.from('outreach_replies').select('touch_id, contact_id, outcome').order('id').range(a, b) as never,
  )
  const pieces = await readEveryRow<{ id: string; planned_at: string | null }>('the social pieces', (a, b) =>
    db.from('social_pieces').select('id, planned_at').order('id').range(a, b) as never,
  )
  const approvals = await readEveryRow<{ piece_id: string }>('the social approvals', (a, b) =>
    db.from('social_piece_approvals').select('piece_id').order('id').range(a, b) as never,
  )
  const schedules = await readEveryRow<{ piece_id: string; state: string; published_ref: string | null; published_at: string | null; created_at: string | null; held_reason: string | null; go_at: string | null }>(
    'the social schedules',
    (a, b) => db.from('social_piece_schedules').select('piece_id, state, published_ref, published_at, created_at, held_reason, go_at').order('id').range(a, b) as never,
  )
  // A piece set aside: its newest version rejected (expired when its nights started, or rejected by a person).
  const revisions = await readEveryRow<{ piece_id: string; version: number }>('the social revisions', (a, b) =>
    db.from('social_piece_revisions').select('piece_id, version').order('id').range(a, b) as never,
  )
  const rejections = await readEveryRow<{ piece_id: string; revision: number }>('the social rejections', (a, b) =>
    db.from('social_piece_decisions').select('piece_id, revision').eq('decision', 'rejected').order('id').range(a, b) as never,
  )
  const reports = await readEveryRow<{ id: string; event_id: string; night_ended_at: string | null; read_at: string | null; sent_at: string | null; figures: unknown }>('the night reports', (a, b) =>
    db.from('organiser_night_reports').select('id, event_id, night_ended_at, read_at, sent_at, figures').order('id').range(a, b) as never,
  )
  // Who a night report could go to, as the planner's message 8 path reads it: the night's venue, the organisers who run
  // it, and which of them are partners (a contact's yes or interested, or their own express consent).
  const venueLinks = await readEveryRow<{ venue_id: string; organiser_id: string }>('the organisers of each venue', (a, b) =>
    db.from('organiser_venues').select('venue_id, organiser_id').order('venue_id').order('organiser_id').range(a, b) as never,
  )
  const contacts = await readEveryRow<{ id: string; organiser_id: string; basis: string | null }>('the email contacts', (a, b) =>
    db.from('organiser_contacts').select('id, organiser_id, basis').eq('channel', 'email').order('id').range(a, b) as never,
  )
  const reportEvents = [...new Set(reports.map((r) => r.event_id))]
  const venueOf = new Map<string, string | null>()
  // Message 8 version 2 finds a night's partner by three roads (src/lib/outreach/after-your-night.ts nightPartner): a
  // venue they run, their own organisation, a booking page on their own website's host; and judges T+1 to T+3 in the
  // night's own zone. So each night's organisation, booking pages and zone are read with its venue.
  const nightOf = new Map<string, { organisationId: string | null; pages: string[]; zone: string }>()
  for (let i = 0; i < reportEvents.length; i += 150) {
    const ids = reportEvents.slice(i, i + 150)
    const part = await db.from('events').select('id, venue_id, organisation_id, external_ticket_url, timezone').in('id', ids)
    if (part.error) throw new Error(`the nights' venues could not be read: ${part.error.message}`)
    const links = await db.from('event_booking_links').select('event_id, url').in('event_id', ids)
    if (links.error) throw new Error(`the nights' booking pages could not be read: ${links.error.message}`)
    for (const e of (part.data ?? []) as { id: string; venue_id: string | null; organisation_id: string | null; external_ticket_url: string | null; timezone: string | null }[]) {
      venueOf.set(e.id, e.venue_id)
      const pages = [e.external_ticket_url, ...((links.data ?? []) as { event_id: string; url: string }[]).filter((l) => l.event_id === e.id).map((l) => l.url)].filter((u): u is string => Boolean(u))
      nightOf.set(e.id, { organisationId: e.organisation_id, pages, zone: (e.timezone ?? '').trim() || 'Australia/Melbourne' })
    }
  }
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

  // THE REAL NEXT STEP AND ITS TIME (the PM's 07:09 item 4 of 25 November 2026): the next queued message's slot, the next
  // post's go time, the next night report's day; nothing reads as waiting that cannot happen.
  const at = (iso: string) => formatPlatformDateTime(iso)
  const nextQueued = (c: CommsCategory): string | null => {
    const slot = touches
      .filter((t) => t.comms_category === c && t.state === 'queued' && t.scheduled_for && new Date(t.scheduled_for).getTime() >= now.getTime() - 60 * 60_000)
      .map((t) => t.scheduled_for as string)
      .sort()[0]
    return slot ? `the next goes ${at(slot)}` : null
  }
  const newest = new Map<string, number>()
  for (const r of revisions) newest.set(r.piece_id, Math.max(newest.get(r.piece_id) ?? 0, r.version))
  const setAside = new Set(rejections.filter((d) => newest.get(d.piece_id) === d.revision).map((d) => d.piece_id))
  const approvedPieces = new Set(approvals.map((a) => a.piece_id))
  const goAt = nextGoAt(schedules, now)

  const contactOrganiser = new Map(contacts.map((c) => [c.id, c.organiser_id]))
  const partners = new Set<string>(contacts.filter((c) => c.basis === 'express_consent').map((c) => c.organiser_id))
  for (const r of replies) if (r.outcome === 'yes' || r.outcome === 'interested') {
    const o = contactOrganiser.get(r.contact_id)
    if (o) partners.add(o)
  }
  const organisersAt = new Map<string, string[]>()
  for (const l of venueLinks) organisersAt.set(l.venue_id, [...(organisersAt.get(l.venue_id) ?? []), l.organiser_id])
  const lettered = new Set(touches.filter((t) => t.night_report_id && t.state !== 'void').map((t) => t.night_report_id as string))
  // The partners' own rows, for the roads; the platform's own listings organisation is never anyone's partner, and a
  // night under it has no organiser on record by that road (src/lib/growth/platform-organiser.ts).
  const platform = await readPlatformOrganiserIds(db)
  const partnerIds = [...partners].filter((o) => !platform.has(o))
  const partnerRows = partnerIds.length > 0 ? await db.from('organisers').select('id, organisation_id, website_url').in('id', partnerIds) : { data: [], error: null }
  if (partnerRows.error) throw new Error(`the partners could not be read: ${partnerRows.error.message}`)
  const platformOrgs = platform.size > 0 ? await db.from('organisers').select('organisation_id').in('id', [...platform]) : { data: [], error: null }
  if (platformOrgs.error) throw new Error(`the platform's own organisation could not be read: ${platformOrgs.error.message}`)
  const platformOrganisations = new Set(((platformOrgs.data ?? []) as { organisation_id: string | null }[]).map((o) => o.organisation_id).filter((x): x is string => Boolean(x)))
  const roads = ((partnerRows.data ?? []) as { id: string; organisation_id: string | null; website_url: string | null }[]).map((o) => ({ id: o.id, organisationId: o.organisation_id, websiteUrl: o.website_url }))
  const partnerOf = new Map<string, string | null>()
  const hasOrganiser = new Set<string>()
  const zoneOf = new Map<string, string>()
  for (const id of reportEvents) {
    const venue = venueOf.get(id) ?? null
    const n = nightOf.get(id)
    const venueOwners = venue ? (organisersAt.get(venue) ?? []) : []
    partnerOf.set(id, nightPartner({ venueOwners, organisationId: n?.organisationId ?? null, bookingPages: n?.pages ?? [] }, roads))
    if (venueOwners.length > 0 || (n?.organisationId && !platformOrganisations.has(n.organisationId))) hasOrganiser.add(id)
    if (n) zoneOf.set(id, n.zone)
  }
  const groups: ReportGroups = reportGroups(
    reports.map((r) => ({ event_id: r.event_id, night_ended_at: r.night_ended_at, sent_at: r.sent_at, lettered: lettered.has(r.id), figures: r.figures })),
    { partnerOf, hasOrganiser, zoneOf },
    now,
  )
  const reportsUpdated = reports.flatMap((r) => [r.read_at, r.sent_at]).filter((x): x is string => !!x).sort().pop() ?? null
  const retNext = groups.dueNow
    ? `${groups.dueNow} partner night reports go in the next outreach run`
    : groups.firstDue
      ? `the next partner night report is due ${at(groups.firstDue)}`
      : groups.total > groups.sent
        ? 'no night report can be sent now: each reason is below'
        : null

  const by: Partial<Record<CommsCategory, { figures: Figures; sources: string[]; extra?: string[]; next?: string | null }>> = {
    ACQ: {
      figures: touchesOf('ACQ'),
      sources: ['CRM messages (outreach_touches)'],
      next: nextQueued('ACQ') ?? `none is queued; the next sending window opens ${at(nextWindowStart(now, 'Australia/Melbourne').toISOString())}`,
    },
    PERM: {
      figures: combine(touchesOf('PERM'), outcomeFigures(permissions.map((p) => ({ at: p.granted_at })))),
      sources: ['CRM messages (outreach_touches)', 'image permissions granted (organiser_permissions)'],
      next: nextQueued('PERM'),
    },
    LIST: {
      figures: combine(touchesOf('LIST'), notificationFigures(notificationsOf('LIST'))),
      sources: ['CRM messages (outreach_touches)', 'attendee alerts (notifications)'],
      next: nextQueued('LIST'),
    },
    SOC: {
      figures: socialFigures(pieces, approvedPieces, schedules, setAside),
      sources: ['social pieces, their versions, decisions, approvals and schedules (social_pieces, social_piece_revisions, social_piece_decisions, social_piece_approvals, social_piece_schedules)'],
      extra: socialNotes(pieces, approvedPieces, schedules, setAside),
      next: goAt ? `the next post goes ${at(goAt)}` : null,
    },
    RET: {
      figures: combine(combine(touchesOf('RET'), reportFigures(groups, reportsUpdated)), sentRecordFigures(digests.map((d) => ({ at: d.digest_date, sent_at: d.sent_at })))),
      sources: [
        'CRM messages (outreach_touches)',
        'night reports (organiser_night_reports), with each night\'s partner by three roads (a venue they run in organiser_venues, their own organisation, their own booking page) and the partners (outreach_replies, organiser_contacts)',
        'sales digests (organiser_sales_digest_sends)',
      ],
      extra: reportNotes(groups),
      next: nextQueued('RET') ?? retNext,
    },
    TKT: {
      figures: combine(touchesOf('TKT'), outcomeFigures(activations)),
      sources: ['CRM messages (outreach_touches)', 'ticketing steps proved (ticketing_activations)'],
      next: nextQueued('TKT'),
    },
    SYS: {
      figures: combine(combine(touchesOf('SYS'), noticeFigures(notices)), notificationFigures(notificationsOf('SYS'))),
      sources: ['CRM messages (outreach_touches)', "the founder's platform notices (platform_notifications)", 'performer notices (notifications)'],
    },
  }
  return { sections: sectionsInOrder(by, firstLettersToday), readAt: now.toISOString(), firstLettersToday }
}
