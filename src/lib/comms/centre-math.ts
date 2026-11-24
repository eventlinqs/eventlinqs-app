import { COMMS_CATEGORIES, type CommsCategory } from '@/lib/comms/categories'

/**
 * THE GROWTH AND COMMUNICATIONS CENTRE'S FIGURES (Law 24; Lawal's master communications directive of 18 November 2026,
 * section 7: "Each section must display: Total records. Pending. Approved. Scheduled. Sent/published.
 * Delivered/confirmed. Failed. Replies or outcomes. Last updated. Next action. Use verified database and provider data.
 * Do not substitute invented or manually estimated metrics.").
 *
 * A figure is a count read from a table, or null where the section has no record that could hold it (a night report
 * has no approval step; no provider confirms delivery of a CRM letter, it reports only bounces). Null is shown as what
 * it is, never as a zero. Pure: the reader (centre.ts) passes rows in, this file counts them.
 */
export type Figures = {
  total: number
  pending: number | null
  approved: number | null
  scheduled: number | null
  sent: number | null
  delivered: number | null
  failed: number | null
  outcomes: number | null
  /** Drafted and withdrawn, never sent (a void CRM message). Part of the total, outside every other figure. */
  withdrawn: number | null
  lastUpdated: string | null
}

export type Section = { category: CommsCategory; name: string; figures: Figures; sources: string[]; nextAction: string; extra: string[] }

export const EMPTY: Figures = {
  total: 0, pending: null, approved: null, scheduled: null, sent: null, delivered: null, failed: null, outcomes: null, withdrawn: null, lastUpdated: null,
}

const later = (a: string | null, b: string | null | undefined): string | null => (!b ? a : !a || b > a ? b : a)
const add = (a: number | null, b: number | null): number | null => (a === null ? b : b === null ? a : a + b)

/** Two sources' figures in one section: counts add, a figure no source holds stays null, the latest update wins. Pure. */
export function combine(a: Figures, b: Figures): Figures {
  return {
    total: a.total + b.total,
    pending: add(a.pending, b.pending),
    approved: add(a.approved, b.approved),
    scheduled: add(a.scheduled, b.scheduled),
    sent: add(a.sent, b.sent),
    delivered: add(a.delivered, b.delivered),
    failed: add(a.failed, b.failed),
    outcomes: add(a.outcomes, b.outcomes),
    withdrawn: add(a.withdrawn, b.withdrawn),
    lastUpdated: later(a.lastUpdated, b.lastUpdated),
  }
}

export type TouchRow = { id: string; state: string; drafted_at: string | null; sent_at: string | null }

/**
 * CRM messages (outreach_touches): held is pending; Lawal's approval moves one to queued, so approved is every one past
 * held and not withdrawn; queued and sending are scheduled; failed, and a sent message that bounced, are failed; a reply
 * logged against a message is its outcome. Delivery is null: Microsoft Graph confirms no delivery, it returns bounces.
 */
export function touchFigures(rows: TouchRow[], bounced: ReadonlySet<string>, replies: ReadonlyMap<string, number>): Figures {
  const n = (s: string) => rows.filter((r) => r.state === s).length
  return {
    total: rows.length,
    pending: n('held'),
    approved: n('queued') + n('sending') + n('sent') + n('failed'),
    scheduled: n('queued') + n('sending'),
    sent: n('sent'),
    delivered: null,
    failed: n('failed') + rows.filter((r) => r.state === 'sent' && bounced.has(r.id)).length,
    outcomes: rows.reduce((s, r) => s + (replies.get(r.id) ?? 0), 0),
    withdrawn: n('void'),
    lastUpdated: rows.reduce<string | null>((m, r) => later(later(m, r.drafted_at), r.sent_at), null),
  }
}

export type PieceRow = { id: string; planned_at: string | null }
export type ScheduleRow = { piece_id: string; state: string; published_ref: string | null; published_at: string | null; created_at: string | null; held_reason?: string | null; go_at?: string | null }

/**
 * A held schedule's reason that names a fault: the database refused the row, a read or a write failed. Any other hold is
 * on purpose (withdrawn, superseded, a rule that held it before posting, a night that started) and is no failure (the
 * PM's 06:59 item 3 of 25 November 2026: "12 failed" was five faults of 18 November and seven holds). A held row with no
 * reason is counted as a fault, never assumed safe.
 */
export const FAULT_HOLD = /\b(violates|could not|failed|error|exception|timed out|refused by the database)\b/i
export function isFaultHold(s: Pick<ScheduleRow, 'state' | 'held_reason'>): boolean {
  return s.state === 'held' && (!(s.held_reason ?? '').trim() || FAULT_HOLD.test(s.held_reason ?? ''))
}

/**
 * Social pieces: a piece with an approval is approved; one with none is pending unless it is set aside (its newest
 * version rejected: expired because its nights started, or rejected by a person), which waits for nothing; a schedule
 * still waiting is scheduled; a piece published on a platform is published, confirmed when the platform's own post
 * address is recorded; a schedule held by a fault is failed, a hold on purpose is not (isFaultHold). Outcomes are null:
 * no post's reach or clicks are read into the database yet.
 */
export function socialFigures(pieces: PieceRow[], approved: ReadonlySet<string>, schedules: ScheduleRow[], setAside: ReadonlySet<string> = new Set()): Figures {
  const piecesWith = (f: (s: ScheduleRow) => boolean) => new Set(schedules.filter(f).map((s) => s.piece_id)).size
  return {
    total: pieces.length,
    pending: pieces.filter((p) => !approved.has(p.id) && !setAside.has(p.id)).length,
    approved: pieces.filter((p) => approved.has(p.id)).length,
    scheduled: piecesWith((s) => s.state === 'scheduled'),
    sent: piecesWith((s) => s.state === 'published'),
    delivered: piecesWith((s) => s.state === 'published' && !!s.published_ref),
    failed: piecesWith(isFaultHold),
    outcomes: null,
    withdrawn: null,
    lastUpdated: [...pieces.map((p) => p.planned_at), ...schedules.map((s) => s.published_at ?? s.created_at)].reduce<string | null>(later, null),
  }
}

/** What the social figures leave out, said: the pieces set aside and the holds on purpose, each counted. Pure. */
export function socialNotes(pieces: PieceRow[], approved: ReadonlySet<string>, schedules: ScheduleRow[], setAside: ReadonlySet<string>): string[] {
  const aside = pieces.filter((p) => !approved.has(p.id) && setAside.has(p.id)).length
  const onPurpose = new Set(schedules.filter((s) => s.state === 'held' && !isFaultHold(s)).map((s) => s.piece_id)).size
  const notes: string[] = []
  if (aside) notes.push(`${aside} set aside before approval (expired when their nights started, or rejected): nothing waits on them`)
  if (onPurpose) notes.push(`${onPurpose} held on purpose before posting (withdrawn, superseded, or held by a rule), each with its reason on its schedule: not failures`)
  return notes
}

/** The earliest go time, from an hour ago on, of a schedule still waiting, or null. Pure. */
export function nextGoAt(schedules: ScheduleRow[], now: Date): string | null {
  const ahead = schedules
    .filter((s) => s.state === 'scheduled' && !!s.go_at && new Date(s.go_at).getTime() >= now.getTime() - 60 * 60_000)
    .map((s) => s.go_at as string)
    .sort()
  return ahead[0] ?? null
}

/**
 * THE NIGHT REPORTS, GROUPED BY WHETHER ONE CAN EVER BE SENT (the PM's 06:59 item 4 of 25 November 2026: "a night report
 * that can never go ... is not 'waiting': show it as 'not sendable' with its reason"), as the planner's message 8 path
 * decides it (src/lib/outreach/planner.ts planRelationship; src/lib/outreach/after-your-night.ts): sent; not sendable
 * because no organiser runs the night's venue, or the venue's organiser is not a partner (a cold first letter the 30 day
 * gap holds), or a partner's report is past its window (a missed day is never caught up, law 42); otherwise a partner's,
 * due now or from its day. Pure.
 */
export type ReportRow = { event_id: string; night_ended_at: string | null; sent_at: string | null; lettered: boolean }
export type ReportGroups = { total: number; sent: number; dueNow: number; notYetDue: number; firstDue: string | null; noOrganiser: number; notPartner: number; pastWindow: number }
export function reportGroups(
  reports: ReportRow[],
  ctx: { venueOf: ReadonlyMap<string, string | null>; organisersAt: ReadonlyMap<string, readonly string[]>; partners: ReadonlySet<string> },
  now: Date,
  window: { dueDays: number; staleDays: number },
): ReportGroups {
  const g: ReportGroups = { total: reports.length, sent: 0, dueNow: 0, notYetDue: 0, firstDue: null, noOrganiser: 0, notPartner: 0, pastWindow: 0 }
  for (const r of reports) {
    if (r.sent_at || r.lettered) {
      g.sent++
      continue
    }
    const venue = ctx.venueOf.get(r.event_id) ?? null
    const organisers = venue ? (ctx.organisersAt.get(venue) ?? []) : []
    if (organisers.length === 0) {
      g.noOrganiser++
      continue
    }
    if (!organisers.some((o) => ctx.partners.has(o))) {
      g.notPartner++
      continue
    }
    const ended = r.night_ended_at ? new Date(r.night_ended_at).getTime() : NaN
    const days = (now.getTime() - ended) / 86_400_000
    if (!Number.isFinite(days) || days >= window.staleDays) g.pastWindow++
    else if (days < window.dueDays) {
      g.notYetDue++
      const due = new Date(ended + window.dueDays * 86_400_000).toISOString()
      if (!g.firstDue || due < g.firstDue) g.firstDue = due
    } else g.dueNow++
  }
  return g
}

/** The night reports' figures: only a report that can go is pending; the rest are counted in the section's notes. Pure. */
export function reportFigures(g: ReportGroups, lastUpdated: string | null): Figures {
  return { ...EMPTY, total: g.total, pending: g.dueNow + g.notYetDue, sent: g.sent, lastUpdated }
}

/** The night reports that cannot be sent, each group with its reason, for the section's notes. Pure. */
export function reportNotes(g: ReportGroups): string[] {
  const notes: string[] = []
  if (g.noOrganiser) notes.push(`${g.noOrganiser} night reports not sendable: no organiser runs the night's venue, so there is no one to write to`)
  if (g.notPartner) notes.push(`${g.notPartner} night reports not sendable: the venue's organiser is not a partner (no yes yet), so the report would be a cold first letter the 30 day gap holds`)
  if (g.pastWindow) notes.push(`${g.pastWindow} night reports not sendable: a partner's, past its window (a missed day is never caught up)`)
  return notes
}

/** A record that is sent with no approval step (night reports, sales digests): pending until sent. */
export function sentRecordFigures(rows: { at: string | null; sent_at: string | null }[]): Figures {
  return {
    ...EMPTY,
    total: rows.length,
    pending: rows.filter((r) => !r.sent_at).length,
    sent: rows.filter((r) => !!r.sent_at).length,
    lastUpdated: rows.reduce<string | null>((m, r) => later(later(m, r.at), r.sent_at), null),
  }
}

/** The founder's platform notices: pending (and held for the digest) waiting, sent, failed. */
export function noticeFigures(rows: { delivery_state: string; occurred_at: string | null; sent_at: string | null }[]): Figures {
  const n = (s: string) => rows.filter((r) => r.delivery_state === s).length
  return {
    ...EMPTY,
    total: rows.length,
    pending: n('pending') + n('held_for_digest'),
    sent: n('sent'),
    failed: n('failed'),
    lastUpdated: rows.reduce<string | null>((m, r) => later(later(m, r.occurred_at), r.sent_at), null),
  }
}

/** Attendee and performer notifications: scheduled until sent; an opened one is its outcome. */
export function notificationFigures(rows: { scheduled_for: string | null; sent_at: string | null; opened_at: string | null; created_at: string | null }[]): Figures {
  return {
    ...EMPTY,
    total: rows.length,
    scheduled: rows.filter((r) => !r.sent_at && !!r.scheduled_for).length,
    sent: rows.filter((r) => !!r.sent_at).length,
    outcomes: rows.filter((r) => !!r.opened_at).length,
    lastUpdated: rows.reduce<string | null>((m, r) => later(later(m, r.created_at), r.sent_at), null),
  }
}

/** Outcomes recorded in their own table (a permission granted, a ticketing step proved). */
export function outcomeFigures(rows: { at: string | null }[]): Figures {
  return { ...EMPTY, outcomes: rows.length, lastUpdated: rows.reduce<string | null>((m, r) => later(m, r.at), null) }
}

/**
 * What a pending record waits on, said as it is (the PM's 07:09 item 4 of 25 November 2026: "nothing reads as waiting that
 * cannot happen"). A held CRM message waits on its own checks, never on a founder tap (Lawal, 07:02 and 07:03: replies
 * and approved letters go by themselves); a drawn social piece waits on the PM's verify; a record with no approval step
 * waits to be sent.
 */
const PENDING_WORDS: Readonly<Record<CommsCategory, string>> = {
  ACQ: 'held until their own checks clear',
  PERM: 'held until their own checks clear',
  LIST: 'held until their own checks clear',
  TKT: 'held until their own checks clear',
  SOC: "drawn and waiting for the PM's verify",
  RET: 'waiting to be sent',
  SYS: 'waiting to be sent',
}

/**
 * The next action, from the figures, then the real next step and its time when the reader knows it (the next post's go
 * time, the next queued letter's slot, the next report's day). Pure.
 */
export function nextAction(category: CommsCategory, f: Figures, firstLettersToday: number | null, next: string | null = null): string {
  const parts: string[] = []
  if (category === 'ACQ' && firstLettersToday !== null) parts.push(`${firstLettersToday} of 20 first letters sent today`)
  if (f.total === 0) parts.push('Nothing recorded yet')
  else if (f.pending) parts.push(`${f.pending} ${PENDING_WORDS[category]}`)
  else if (f.scheduled) parts.push(`${f.scheduled} scheduled to go`)
  else parts.push('Nothing waiting')
  if (next) parts.push(next.charAt(0).toUpperCase() + next.slice(1))
  return parts.join('. ')
}

/** The seven sections in the directive's order, each with its name. Pure. */
export function sectionsInOrder(by: Partial<Record<CommsCategory, { figures: Figures; sources: string[]; extra?: string[]; next?: string | null }>>, firstLettersToday: number | null): Section[] {
  return (Object.keys(COMMS_CATEGORIES) as CommsCategory[]).map((category) => {
    const s = by[category] ?? { figures: EMPTY, sources: [] }
    return { category, name: COMMS_CATEGORIES[category], figures: s.figures, sources: s.sources, extra: s.extra ?? [], nextAction: nextAction(category, s.figures, firstLettersToday, s.next ?? null) }
  })
}
