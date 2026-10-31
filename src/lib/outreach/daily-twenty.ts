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
 *     another group, so the day keeps the plan's shape;
 *   - one action per organiser a day, across every group: a follow up first (a conversation already open), then a
 *     conversion ask, then the recurring and the partnership groups; every dropped duplicate is counted;
 *   - within a group, the highest score first, then the organiser's name, then its id, so the same input is the same
 *     day whatever order it arrives in;
 *   - a candidate whose contact is missing or not eligible is never a message: with a public social handle it is a
 *     social first touch (tagging them in a city post needs no email consent), otherwise research;
 *   - every message action names lawal@eventlinqs.com as its sender.
 */

export const DAILY_TWENTY_SENDER = 'lawal@eventlinqs.com'

/** The four groups, in the checklist's order; the order is also the priority when one organiser is in two. */
export const DAILY_TWENTY_GROUPS = [
  { key: 'conversion', size: 5, words: 'Conversion asks' },
  { key: 'follow_up', size: 5, words: 'Follow ups' },
  { key: 'recurring', size: 5, words: 'Recurring venues and community organisers' },
  { key: 'partnership_reactivation', size: 5, words: 'Partnerships and reactivation' },
] as const

export type DailyGroup = (typeof DAILY_TWENTY_GROUPS)[number]['key']

/** Which group wins when one organiser is a candidate in two: an open conversation first. */
const PRIORITY: Readonly<Record<DailyGroup, number>> = { follow_up: 0, conversion: 1, recurring: 2, partnership_reactivation: 3 }

export interface DailyContact {
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
  /** Why this organiser is a candidate today, shown beside the action. */
  readonly why: string
  readonly contact: DailyContact | null
  /** A public Instagram or Facebook handle, for a social first touch when no message is allowed. */
  readonly socialHandle: string | null
}

export interface DailyAction {
  readonly organiserId: string
  readonly organiserName: string
  readonly group: DailyGroup
  readonly score: number
  readonly why: string
  readonly channel: string
  readonly address: string
  readonly sender: typeof DAILY_TWENTY_SENDER
}

export interface DailyGroupResult {
  readonly key: DailyGroup
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

function byRank(a: DailyCandidate, b: DailyCandidate): number {
  return b.score - a.score || a.organiserName.localeCompare(b.organiserName) || a.organiserId.localeCompare(b.organiserId)
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

  const groups = DAILY_TWENTY_GROUPS.map((g) => {
    const actions = messageable
      .filter((c) => c.group === g.key)
      .sort(byRank)
      .slice(0, g.size)
      .flatMap((c) => {
        const contact = c.contact
        if (!contact) return []
        return [{
          organiserId: c.organiserId,
          organiserName: c.organiserName,
          group: c.group,
          score: c.score,
          why: c.why,
          channel: contact.channel,
          address: contact.address,
          sender: DAILY_TWENTY_SENDER,
        }]
      })
    return { key: g.key, words: g.words, size: g.size, actions, short: g.size - actions.length }
  })

  const byName = (a: { organiserName: string; organiserId: string }, b: { organiserName: string; organiserId: string }) =>
    a.organiserName.localeCompare(b.organiserName) || a.organiserId.localeCompare(b.organiserId)
  return { groups, socialFirstTouches: socialFirstTouches.sort(byName), research: research.sort(byName), duplicatesDropped }
}
