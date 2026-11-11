/**
 * ONE ORGANISER'S RECORD: EVERYTHING THAT HAPPENED, EVERYTHING PENDING, AND THE NEXT ACTION (the Growth OS directive of
 * 11 November 2026, Release 1's acceptance: "one organiser record shows everything that happened, everything pending
 * and the next action"; PM order 4 Part 2 item 4: "The timeline on each record gathers every source automatically").
 *
 * The rows come from ./timeline.ts, one read per source; this file turns them into the record, and holds no clock but the
 * one it is given. Every line names its source row, so nothing on the record is typed by a person or invented here.
 *
 * Pure.
 */
import type { AcquisitionState } from '@/lib/outreach/acquisition-states'
import { crmStageOf, NEXT_ACTION, type CrmStage, type TicketingFacts } from './stages'

export interface Sources {
  readonly organiser: { id: string; name: string; created_at: string; acquisition_state: AcquisitionState; found_on: string | null }
  readonly contacts: readonly { id: string; channel: string; address: string; role: string; basis: string; basis_recorded_at: string | null; created_at: string }[]
  readonly transitions: readonly { from_state: string | null; to_state: string; proved_by: string | null; at: string }[]
  readonly touches: readonly { id: string; contact_id: string; step: number; state: string; subject: string | null; drafted_at: string; sent_at: string | null; void_reason: string | null; held_because: string[] | string | null; failed_reason: string | null }[]
  readonly replies: readonly { id: string; contact_id: string; received_at: string; outcome: string | null; needs_lawal: boolean | null }[]
  readonly unsubscribes: readonly { email: string | null; created_at: string; reason: string | null }[]
  readonly venues: readonly { venue_id: string; name: string; linked_at: string }[]
  readonly nights: readonly { id: string; title: string; slug: string; start_date: string; status: string; created_at: string }[]
  readonly claims: readonly { id: string; status: string; created_at: string; verified_at: string | null; event_id: string | null; venue_id: string | null }[]
  readonly submissions: readonly { id: string; title: string; status: string; created_at: string; published_event_id: string | null; held_because: string | null }[]
  readonly permissions: readonly { id: string; scope: string | null; granted_at: string; withdrawn_at: string | null }[]
  /** Each image's legal basis on their nights (event_image_rights): its state, where the basis came from, and its expiry. */
  readonly imageRights: readonly { event_id: string; rights_state: string; provenance: string | null; derived_at: string; rights_expire_at: string | null }[]
  readonly ticketing: TicketingFacts
  readonly paidOrders: readonly { order_number: string; total_cents: number; confirmed_at: string | null; event_id: string }[]
}

export type LineKind = 'record' | 'stage' | 'contact' | 'message' | 'reply' | 'unsubscribe' | 'venue' | 'night' | 'claim' | 'submission' | 'permission' | 'photo' | 'sale'

export interface Line {
  readonly at: string
  readonly kind: LineKind
  readonly words: string
  /** Where the line's own row is seen in admin, when it has a page. */
  readonly href: string | null
}

export interface Pending {
  readonly kind: 'held_message' | 'failed_message' | 'reply_to_read' | 'open_claim' | 'held_submission'
  readonly words: string
  readonly since: string
  readonly href: string | null
}

export interface OrganiserRecord {
  readonly stage: CrmStage
  readonly nextAction: string
  readonly lines: readonly Line[]
  readonly pending: readonly Pending[]
  /** No message may reach them: every email address unsubscribed, or their stage is Opted out. */
  readonly mayWrite: boolean
}

const MESSAGE_STEP_WORDS: Readonly<Record<number, string>> = { 1: 'First message', 2: 'Follow up (day 4)', 3: 'Follow up (day 10)' }
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`
const heldWords = (h: string[] | string | null) => (Array.isArray(h) ? h.join('; ') : h ?? '')

export function recordOf(s: Sources): OrganiserRecord {
  const contactOf = new Map(s.contacts.map((c) => [c.id, c]))
  const lines: Line[] = []
  const add = (at: string | null, kind: LineKind, words: string, href: string | null = null) => {
    if (at) lines.push({ at, kind, words, href })
  }

  add(s.organiser.created_at, 'record', `Found${s.organiser.found_on ? ` on ${s.organiser.found_on}` : ''}`)
  for (const t of s.transitions) add(t.at, 'stage', `Stage: ${t.from_state ?? 'new'} to ${t.to_state}${t.proved_by ? `, proved by ${t.proved_by}` : ''}`)
  for (const c of s.contacts) {
    add(c.created_at, 'contact', `Contact added: ${c.role} (${c.channel}, ${c.address})`)
    if (c.basis !== 'none') add(c.basis_recorded_at, 'contact', `Lawful basis recorded for ${c.address}: ${c.basis.replace(/_/g, ' ')}`)
  }
  for (const t of s.touches) {
    const to = contactOf.get(t.contact_id)?.address ?? 'a contact'
    const what = MESSAGE_STEP_WORDS[t.step] ?? `Message step ${t.step}`
    add(t.drafted_at, 'message', `${what} drafted to ${to}${t.subject ? `: "${t.subject}"` : ''}`, '/admin/acquisition')
    if (t.sent_at) add(t.sent_at, 'message', `${what} sent to ${to}`, '/admin/acquisition')
  }
  for (const r of s.replies) add(r.received_at, 'reply', `Reply from ${contactOf.get(r.contact_id)?.address ?? 'a contact'}${r.outcome ? `: ${r.outcome.replace(/_/g, ' ')}` : ''}`, '/admin/today')
  for (const u of s.unsubscribes) add(u.created_at, 'unsubscribe', `Unsubscribed${u.email ? `: ${u.email}` : ''}${u.reason ? ` (${u.reason})` : ''}`)
  for (const v of s.venues) add(v.linked_at, 'venue', `Linked to their venue ${v.name}`, `/admin/venues`)
  for (const n of s.nights) add(n.created_at, 'night', `Night listed: ${n.title} (${n.start_date.slice(0, 10)}, ${n.status})`, `/events/${n.slug}`)
  for (const c of s.claims) {
    add(c.created_at, 'claim', `Claim started (${c.status})`)
    add(c.verified_at, 'claim', 'Claim verified')
  }
  for (const x of s.submissions) add(x.created_at, 'submission', `Submitted ${x.title} themselves (${x.status})`, '/admin/submissions')
  for (const p of s.permissions) {
    add(p.granted_at, 'permission', `Permission given${p.scope ? `: ${p.scope}` : ''}`)
    add(p.withdrawn_at, 'permission', 'Permission withdrawn')
  }
  const nightTitle = new Map(s.nights.map((n) => [n.id, n.title]))
  for (const r of s.imageRights) {
    add(r.derived_at, 'photo', `Image basis for ${nightTitle.get(r.event_id) ?? 'a night'}: ${r.rights_state.replace(/_/g, ' ')}${r.provenance ? `, from ${r.provenance.replace(/_/g, ' ')}` : ''}${r.rights_expire_at ? `, until ${r.rights_expire_at.slice(0, 10)}` : ''}`)
  }
  for (const o of s.paidOrders) add(o.confirmed_at, 'sale', `Paid order ${o.order_number}: ${dollars(o.total_cents)}`, `/admin/orders`)

  lines.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  const pending: Pending[] = []
  for (const t of s.touches) {
    const to = contactOf.get(t.contact_id)?.address ?? 'a contact'
    if (t.state === 'held') pending.push({ kind: 'held_message', words: `${MESSAGE_STEP_WORDS[t.step] ?? 'Message'} to ${to} waits for approval${heldWords(t.held_because) ? `: ${heldWords(t.held_because)}` : ''}`, since: t.drafted_at, href: '/admin/acquisition' })
    if (t.failed_reason && t.state !== 'sent' && t.state !== 'void') pending.push({ kind: 'failed_message', words: `A message to ${to} failed: ${t.failed_reason}`, since: t.drafted_at, href: '/admin/acquisition' })
  }
  for (const r of s.replies) if (r.needs_lawal) pending.push({ kind: 'reply_to_read', words: `A reply from ${contactOf.get(r.contact_id)?.address ?? 'a contact'} needs reading`, since: r.received_at, href: '/admin/today' })
  for (const c of s.claims) if (!c.verified_at && /pending|open|sent/i.test(c.status)) pending.push({ kind: 'open_claim', words: `A claim is open (${c.status})`, since: c.created_at, href: null })
  for (const x of s.submissions) if (/held|waiting/i.test(x.status)) pending.push({ kind: 'held_submission', words: `${x.title} is ${x.status}${x.held_because ? `: ${x.held_because}` : ''}`, since: x.created_at, href: '/admin/submissions' })
  pending.sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0))

  const stage = crmStageOf(s.organiser.acquisition_state, s.ticketing)
  const emails = s.contacts.filter((c) => c.channel === 'email').map((c) => c.address.toLowerCase())
  const gone = new Set(s.unsubscribes.map((u) => (u.email ?? '').toLowerCase()))
  const everyEmailGone = emails.length > 0 && emails.every((e) => gone.has(e))
  const mayWrite = !everyEmailGone && s.organiser.acquisition_state !== 'suppressed' && s.organiser.acquisition_state !== 'withdrawn'

  return { stage, nextAction: pending.length ? `${NEXT_ACTION[stage]} (first: ${pending[0].words})` : NEXT_ACTION[stage], lines, pending, mayWrite }
}
