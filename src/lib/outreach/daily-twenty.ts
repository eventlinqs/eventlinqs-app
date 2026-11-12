/**
 * THE DAILY TWENTY: the outreach day as the Growth Engine V3 checklist states it (item 5; Lawal's 'A, build it as
 * written', 1 November 2026, 05:12): "A daily queue of 20 reviewed actions: 5 conversion, 5 follow-ups, 5 recurring
 * venues and community organisers, 5 partnerships and reactivation"; "Eligibility checked before any message;
 * ineligible contacts become research or a social first touch"; "Duplicates prevented"; "Sender named on every message
 * (lawal@eventlinqs.com)"; "You approve and send every message during the pilot".
 *
 * Pure: it decides WHICH twenty from candidates the caller has already read (the contact's eligibility comes from the
 * database's own refusal check, outreach_contact_refusal_for, never re-derived here). It sends nothing and drafts
 * nothing; the outreach sender stays on 'hold' (public.outreach_sender) and Lawal sends every message by hand.
 *
 * Rules, each pinned by tests/unit/outreach/daily-twenty.test.ts:
 *   - five of each group at most; a short group stays short and says how many it is short, never topped up from
 *     another group, so the day keeps the plan's shape; the places they leave empty are filled, in a fifth group of
 *     their own, with the next first asks (Lawal, 12 November 2026, 11:11: "20 organisers from the CRM, Melbourne
 *     first, ranked by the score, 5 of them conversion asks"), first messages that ask their advice, so the day is
 *     twenty organisers while nobody has yet been written to;
 *   - one action per organiser a day, across every group: a follow up first (a conversation already open), then a
 *     conversion ask, then the recurring and the partnership groups; every dropped duplicate is counted;
 *   - within a group, Melbourne first, then the other big cities, then the regional cities (cityRank, Lawal's 12 November
 *     2026), and inside each the highest score first, then the organiser's name, then its id, so the same input is the same
 *     day whatever order it arrives in;
 *   - a candidate whose contact is missing or not eligible is never a message: with a public social handle it is a
 *     social first touch (tagging them in a city post needs no email consent), otherwise research;
 *   - every message action names lawal@eventlinqs.com as its sender.
 */

import type { AcquisitionState } from './acquisition-states'
import { contactAddress } from '@/lib/email/sender'
import { addressRank } from './planner'

/** lawal@ on the one sending domain (src/lib/email/sender.ts), never typed here. */
export const DAILY_TWENTY_SENDER: string = contactAddress('founder')

/** The four groups, in the checklist's order; the order is also the priority when one organiser is in two. */
export const DAILY_TWENTY_GROUPS = [
  { key: 'conversion', size: 5, words: 'Conversion asks' },
  { key: 'follow_up', size: 5, words: 'Follow ups' },
  { key: 'recurring', size: 5, words: 'Recurring venues and community organisers' },
  { key: 'partnership_reactivation', size: 5, words: 'Partnerships and reactivation' },
] as const

export type DailyGroup = (typeof DAILY_TWENTY_GROUPS)[number]['key']

/** The fifth group: first asks beyond the five conversion asks, filling only the places the four leave short. */
export const FIRST_CONTACT_GROUP = { key: 'first_contact', words: 'First messages, asking their advice' } as const
export const DAILY_TWENTY_SIZE = 20
export type DailyGroupKey = DailyGroup | (typeof FIRST_CONTACT_GROUP)['key']

/** Which group wins when one organiser is a candidate in two: an open conversation first. */
const PRIORITY: Readonly<Record<DailyGroup, number>> = { follow_up: 0, conversion: 1, recurring: 2, partnership_reactivation: 3 }

export interface DailyContact {
  /** The stored contact's id, so the Command Centre can show the held draft written to it; absent in a hand made case. */
  readonly id?: string
  readonly channel: string
  readonly address: string
  /** The database's own answer (outreach_contact_refusal_for is null): eligible to be written to now. */
  readonly eligible: boolean
  /** Why not, in the database's words, when not eligible. */
  readonly refusal: string | null
}

export interface DailyCandidate {
  readonly organiserId: string
  readonly organiserName: string
  readonly group: DailyGroup
  /** The prioritisation score (item 4's open formula); higher first. */
  readonly score: number
  /** The organiser's city as a slug (./organiser-score-read.ts), or null where none is known: Melbourne first. */
  readonly city?: string | null
  /** Why this organiser is a candidate today, shown beside the action. */
  readonly why: string
  readonly contact: DailyContact | null
  /** A public Instagram or Facebook handle, for a social first touch when no message is allowed. */
  readonly socialHandle: string | null
}

export interface DailyAction {
  readonly organiserId: string
  readonly organiserName: string
  readonly group: DailyGroupKey
  readonly score: number
  readonly city: string | null
  /** The contact the message goes to, so its held draft can be shown beside it. */
  readonly contactId: string | null
  readonly why: string
  readonly channel: string
  readonly address: string
  readonly sender: string
}

export interface DailyGroupResult {
  readonly key: DailyGroupKey
  readonly words: string
  readonly size: number
  readonly actions: readonly DailyAction[]
  readonly short: number
}

export interface DailyTwenty {
  readonly groups: readonly DailyGroupResult[]
  readonly socialFirstTouches: readonly { organiserId: string; organiserName: string; handle: string; because: string }[]
  readonly research: readonly { organiserId: string; organiserName: string; because: string }[]
  readonly duplicatesDropped: number
}

/** The other big Australian cities (growth plan version 6's outreach order); every other known city is regional. */
export const BIG_CITIES: readonly string[] = ['sydney', 'brisbane', 'perth', 'adelaide', 'canberra', 'gold-coast', 'hobart', 'darwin']

/**
 * MELBOURNE FIRST (Lawal, 12 November 2026, 09:16 to 09:19, and 11:11: "20 organisers from the CRM, Melbourne first,
 * ranked by the score"; growth plan version 6): Melbourne, then the other big cities, then the regional cities, then an
 * organiser whose city is not known; the score orders each.
 */
export function cityRank(city: string | null | undefined): number {
  const slug = (city ?? '').trim().toLowerCase()
  if (slug === 'melbourne') return 0
  if (BIG_CITIES.includes(slug)) return 1
  return slug ? 2 : 3
}

function byRank(a: DailyCandidate, b: DailyCandidate): number {
  return cityRank(a.city) - cityRank(b.city) || b.score - a.score || a.organiserName.localeCompare(b.organiserName) || a.organiserId.localeCompare(b.organiserId)
}

export function buildDailyTwenty(candidates: readonly DailyCandidate[]): DailyTwenty {
  // One candidate per organiser: the highest-priority group, then the best score within it.
  const chosen = new Map<string, DailyCandidate>()
  let duplicatesDropped = 0
  const ordered = [...candidates].sort((a, b) => PRIORITY[a.group] - PRIORITY[b.group] || byRank(a, b))
  for (const c of ordered) {
    if (chosen.has(c.organiserId)) {
      duplicatesDropped += 1
      continue
    }
    chosen.set(c.organiserId, c)
  }

  const socialFirstTouches: { organiserId: string; organiserName: string; handle: string; because: string }[] = []
  const research: { organiserId: string; organiserName: string; because: string }[] = []
  const messageable: DailyCandidate[] = []
  for (const c of chosen.values()) {
    if (c.contact && c.contact.eligible) {
      messageable.push(c)
      continue
    }
    const because = c.contact ? c.contact.refusal ?? 'not eligible to be written to' : 'no contact recorded'
    if (c.socialHandle) socialFirstTouches.push({ organiserId: c.organiserId, organiserName: c.organiserName, handle: c.socialHandle, because })
    else research.push({ organiserId: c.organiserId, organiserName: c.organiserName, because })
  }

  const toAction = (c: DailyCandidate, group: DailyGroupKey): DailyAction[] => {
    const contact = c.contact
    if (!contact) return []
    return [{
      organiserId: c.organiserId,
      organiserName: c.organiserName,
      group,
      score: c.score,
      city: c.city ?? null,
      contactId: contact.id ?? null,
      why: c.why,
      channel: contact.channel,
      address: contact.address,
      sender: DAILY_TWENTY_SENDER,
    }]
  }
  const groups: DailyGroupResult[] = DAILY_TWENTY_GROUPS.map((g) => {
    const actions = messageable
      .filter((c) => c.group === g.key)
      .sort(byRank)
      .slice(0, g.size)
      .flatMap((c) => toAction(c, c.group))
    return { key: g.key, words: g.words, size: g.size, actions, short: g.size - actions.length }
  })
  const open = DAILY_TWENTY_SIZE - groups.reduce((n, g) => n + g.actions.length, 0)
  if (open > 0) {
    const taken = new Set(groups.flatMap((g) => g.actions.map((a) => a.organiserId)))
    const next = messageable
      .filter((c) => c.group === 'conversion' && !taken.has(c.organiserId))
      .sort(byRank)
      .slice(0, open)
      .flatMap((c) => toAction(c, FIRST_CONTACT_GROUP.key))
    if (next.length > 0) groups.push({ key: FIRST_CONTACT_GROUP.key, words: FIRST_CONTACT_GROUP.words, size: open, actions: next, short: open - next.length })
  }

  const byName = (a: { organiserName: string; organiserId: string }, b: { organiserName: string; organiserId: string }) =>
    a.organiserName.localeCompare(b.organiserName) || a.organiserId.localeCompare(b.organiserId)
  return { groups, socialFirstTouches: socialFirstTouches.sort(byName), research: research.sort(byName), duplicatesDropped }
}

/**
 * THE GROUP AN ORGANISER IS IN TODAY, from the acquisition state the database keeps on each organiser (20261030034001,
 * its order and words in ./acquisition-states.ts). Window 6's reading of the checklist's four groups, written once here:
 *   conversion                 qualified by a night in the next 90 days and not yet written to (qualified, lawful basis
 *                              recorded, or ready in a play): the first ask;
 *   follow_up                  written to, with the cadence's next step due today or earlier (outreach_pipeline's
 *                              next_due_on), or a conversation open (replied with interest, invited to claim);
 *   recurring                  organisers whose nights run with us (active, recurring);
 *   partnership_reactivation   claimed partners (verified, said yes to their material) and the expired (no reply after
 *                              three messages; the database refuses a fourth message to a contact, so the reader
 *                              marks every contact of theirs EXPIRED_REFUSAL and they become a social first touch or
 *                              research, never a message).
 * A stop, a no, an open removal request, a take down, or no night ahead (discovered) is never in the day.
 */
export function groupOf(state: AcquisitionState, nextDueOn: string | null, today: string): DailyGroup | null {
  switch (state) {
    case 'qualified':
    case 'eligibility_checked':
    case 'ready':
      return 'conversion'
    case 'contacted':
      return nextDueOn !== null && nextDueOn <= today ? 'follow_up' : null
    case 'engaged':
    case 'claim_invited':
      return 'follow_up'
    case 'active':
    case 'recurring':
      return 'recurring'
    case 'verified':
    case 'media_approved':
    case 'expired':
      return 'partnership_reactivation'
    case 'discovered':
    case 'suppressed':
    case 'rejected':
    case 'disputed':
    case 'withdrawn':
      return null
  }
}

export interface StoredContact {
  readonly id: string
  readonly channel: string
  readonly address: string
  readonly personName: string | null
  /** outreach_contact_refusal's answer for this contact now: null when it may be written to. */
  readonly refusal: string | null
}

/** Why an expired organiser's contacts are not written to again (outreach_touch_is_lawful refuses a fourth step). */
export const EXPIRED_REFUSAL = 'three messages sent with no reply; a fourth is refused'

const CHANNEL_ORDER = ['email', 'website_form', 'instagram', 'facebook']

/**
 * The contact an organiser's action goes to: the contact a running conversation is on, while it may still be written to;
 * else an eligible email (a named person first, then a bookings address, then a general inbox, planner's addressRank),
 * else another eligible message channel; with none eligible, the best one with the database's refusal, so the day says
 * why it became a social first touch or research.
 */
export function contactFor(contacts: readonly StoredContact[], conversationContactId: string | null): DailyContact | null {
  const as = (c: StoredContact): DailyContact => ({ id: c.id, channel: c.channel, address: c.address, eligible: c.refusal === null, refusal: c.refusal })
  const running = contacts.find((c) => c.id === conversationContactId && c.refusal === null)
  if (running) return as(running)
  const ranked = [...contacts].sort((a, b) => {
    const ca = CHANNEL_ORDER.indexOf(a.channel), cb = CHANNEL_ORDER.indexOf(b.channel)
    return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb) ||
      (a.channel === 'email' && b.channel === 'email' ? addressRank(a.address, a.personName) - addressRank(b.address, b.personName) : 0) ||
      a.address.localeCompare(b.address)
  })
  const best = ranked.find((c) => c.refusal === null) ?? ranked[0]
  return best ? as(best) : null
}
