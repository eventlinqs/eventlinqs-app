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
export type ScheduleRow = { piece_id: string; state: string; published_ref: string | null; published_at: string | null; created_at: string | null }

/**
 * Social pieces: a piece with an approval is approved, the rest pending; a schedule still waiting is scheduled; a piece
 * published on a platform is published, confirmed when the platform's own post address is recorded; a schedule held
 * back is failed. Outcomes are null: no post's reach or clicks are read into the database yet.
 */
export function socialFigures(pieces: PieceRow[], approved: ReadonlySet<string>, schedules: ScheduleRow[]): Figures {
  const piecesWith = (f: (s: ScheduleRow) => boolean) => new Set(schedules.filter(f).map((s) => s.piece_id)).size
  return {
    total: pieces.length,
    pending: pieces.filter((p) => !approved.has(p.id)).length,
    approved: pieces.filter((p) => approved.has(p.id)).length,
    scheduled: piecesWith((s) => s.state === 'scheduled'),
    sent: piecesWith((s) => s.state === 'published'),
    delivered: piecesWith((s) => s.state === 'published' && !!s.published_ref),
    failed: piecesWith((s) => s.state === 'held'),
    outcomes: null,
    withdrawn: null,
    lastUpdated: [...pieces.map((p) => p.planned_at), ...schedules.map((s) => s.published_at ?? s.created_at)].reduce<string | null>(later, null),
  }
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

/** The next action, from the figures only: what waits on approval, else what is scheduled, else that nothing waits. Pure. */
export function nextAction(category: CommsCategory, f: Figures, firstLettersToday: number | null): string {
  const parts: string[] = []
  if (category === 'ACQ' && firstLettersToday !== null) parts.push(`${firstLettersToday} of 20 first letters sent today`)
  if (f.total === 0) parts.push('Nothing recorded yet')
  else if (f.pending) parts.push(`${f.pending} waiting ${category === 'RET' || category === 'SYS' ? 'to be sent' : 'for approval'}`)
  else if (f.scheduled) parts.push(`${f.scheduled} scheduled to go`)
  else parts.push('Nothing waiting')
  return parts.join('. ')
}

/** The seven sections in the directive's order, each with its name. Pure. */
export function sectionsInOrder(by: Partial<Record<CommsCategory, { figures: Figures; sources: string[]; extra?: string[] }>>, firstLettersToday: number | null): Section[] {
  return (Object.keys(COMMS_CATEGORIES) as CommsCategory[]).map((category) => {
    const s = by[category] ?? { figures: EMPTY, sources: [] }
    return { category, name: COMMS_CATEGORIES[category], figures: s.figures, sources: s.sources, extra: s.extra ?? [], nextAction: nextAction(category, s.figures, firstLettersToday) }
  })
}
