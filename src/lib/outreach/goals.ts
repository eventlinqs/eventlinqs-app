import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readTheirNights, type OwnNight } from './their-nights'
import { photoPath } from './photo-link'
import { splitClosing } from './rules'

type Admin = SupabaseClient<Database>

/**
 * ONE MESSAGE CARRIES EVERY GOAL (Lawal, 26 November 2026, 00:01: "You have to know what you're trying to achieve from
 * every communication. You can't be doing too many back-and-forth communications. If you can achieve a goal or two goals
 * in one communication, it's better than just bombarding the user with too many emails"; the PM's 00:02, item A).
 *
 * Before a message to a contact is drafted, the engine gathers every open goal for that contact's organisation and puts
 * each one that is due into the same message, in the order that matters to them, as one short line with its one link:
 *   listing   their nights live on EventLinqs, each linking to its own listing (the first two nights ahead);
 *   photo     a night ahead with no photograph of theirs we may use: their own photo page, one tick;
 *   claim     not yet holding an EventLinqs account: claim it free and sell tickets directly, by reply;
 *   future    more nights coming up: send the dates and we list them.
 * The message's own goal is never repeated, and a goal whose link the message already carries is left out. A goal that
 * is not due waits for the next message we send anyway (the contact policy's one open message rule holds the rest).
 * The lines are put into the template's words before its sign off, so the render fills, signs and checks the whole
 * message as one letter through every rule it already has.
 */
export type GoalKey = 'listing' | 'photo' | 'claim' | 'future'

export type Goal = { readonly key: GoalKey; readonly line: string; readonly link: string | null }

/** The order that matters to them: what is live, then what promotes it, then what they could do next. */
export const GOAL_ORDER: readonly GoalKey[] = ['listing', 'photo', 'claim', 'future']

/** Each template's own goal, never repeated in its own message. */
export const OWN_GOAL: Readonly<Record<string, GoalKey>> = {
  lifecycle_perm: 'photo',
  lifecycle_perm_follow_up: 'photo',
  segment_a_first: 'photo',
  segment_a_day4: 'photo',
  source_ask: 'listing',
  lifecycle_acq: 'claim',
  lifecycle_acq_follow_up: 'claim',
  acq_first: 'claim',
  anything_coming_up: 'future',
  after_your_night: 'future',
}

const dayWords = (iso: string, zone: string | null) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: zone ?? 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso)).replace(',', '')

/** The goals due for an organisation, from its nights and its state. Pure. */
export function dueGoals(input: {
  readonly origin: string
  readonly nights: readonly Pick<OwnNight, 'slug' | 'title' | 'startDate' | 'timezone'>[]
  /** Nights ahead with no photograph of theirs we may use (no cover recorded 'organiser_authorised'). */
  readonly nightsWithoutTheirPhoto: number
  readonly photoPage: string | null
  readonly claimed: boolean
}): Goal[] {
  const origin = input.origin.replace(/\/+$/, '')
  const goals: Goal[] = []
  const ahead = input.nights.slice(0, 2)
  if (ahead.length > 0) {
    const lines = ahead.map((n) => `${n.title}, ${dayWords(n.startDate, n.timezone)}: ${origin}/events/${n.slug}`)
    goals.push({ key: 'listing', line: `${ahead.length > 1 ? 'Your nights are' : 'Your night is'} live on EventLinqs:\n${lines.join('\n')}`, link: `${origin}/events/${ahead[0].slug}` })
  }
  if (input.nightsWithoutTheirPhoto > 0 && input.photoPage) {
    goals.push({ key: 'photo', line: `If you're happy for us to promote ${input.nightsWithoutTheirPhoto > 1 ? 'them' : 'it'} with your own photos, you can add and approve them here: ${input.photoPage}`, link: input.photoPage })
  }
  if (!input.claimed) {
    goals.push({ key: 'claim', line: "You can also claim your listings for free and sell tickets directly: just reply and I'll set it up.", link: null })
  }
  goals.push({ key: 'future', line: "And if you have more nights coming up, send me the dates and we'll list those too.", link: null })
  return goals
}

/**
 * The lines to add to one message: every due goal but the message's own, and none whose link the message already
 * carries, in GOAL_ORDER. Pure.
 */
export function goalLinesFor(goals: readonly Goal[], input: { readonly templateKey: string | null; readonly words: string }): string[] {
  const own = input.templateKey ? OWN_GOAL[input.templateKey] : undefined
  return GOAL_ORDER.flatMap((k) => goals.filter((g) => g.key === k))
    .filter((g) => g.key !== own)
    .filter((g) => !(g.link && input.words.includes(g.link)))
    .filter((g) => !(g.key === 'future' && /\b(coming up|next (night|date|show|event))\b/i.test(input.words)))
    .map((g) => g.line)
}

/**
 * A template's words with the goal lines before its sign off ("Kind regards," or the signature field), each its own
 * paragraph; a template with no sign off takes them at its end. Lines never carry a field mark. Pure.
 */
export function withGoalLines(body: string, lines: readonly string[]): string {
  const clean = lines.filter((l) => l.trim() !== '' && !/[[\]]/.test(l))
  if (clean.length === 0) return body
  // The render's own split (./rules.ts splitClosing), so the lines sit in the content it checks, never in the closing.
  const { content, closing } = splitClosing(body)
  return closing ? `${content}\n\n${clean.join('\n\n')}\n\n${closing}` : `${content}\n\n${clean.join('\n\n')}`
}

/** The goals due for the contact's organisation now, read from production. A read that fails throws: never a guess. */
export async function readDueGoals(db: Admin, input: { readonly contactId: string; readonly origin: string; readonly now: Date }): Promise<Goal[]> {
  const c = await db
    .from('organiser_contacts')
    .select('id, unsubscribe_token, channel, organisers(id, organisation_id, website_url, is_test)')
    .eq('id', input.contactId)
    .maybeSingle()
  if (c.error || !c.data) throw new Error(`the contact could not be read${c.error ? `: ${c.error.message}` : ''}`)
  const org = c.data.organisers as unknown as { id: string; organisation_id: string | null; website_url: string | null; is_test: boolean | null } | null
  if (!org) throw new Error('the contact names no organiser')
  const nights = await readTheirNights(db, { id: org.id, organisation_id: org.organisation_id, website_url: org.website_url, isTest: org.is_test === true }, input.now, 6)
  let without = 0
  if (nights.length > 0) {
    const rights = await db.from('event_image_rights').select('event_id, rights_state').in('event_id', nights.map((n) => n.eventId)).eq('image_role', 'cover')
    if (rights.error) throw new Error(`their nights' photographs could not be read: ${rights.error.message}`)
    const theirs = new Set(((rights.data ?? []) as { event_id: string; rights_state: string }[]).filter((r) => r.rights_state === 'organiser_authorised').map((r) => r.event_id))
    without = nights.filter((n) => !theirs.has(n.eventId)).length
  }
  const token = (c.data.unsubscribe_token as string | null) ?? null
  const photoPage = c.data.channel === 'email' && token ? `${input.origin.replace(/\/+$/, '')}${photoPath(c.data.id as string, token)}` : null
  return dueGoals({ origin: input.origin, nights, nightsWithoutTheirPhoto: without, photoPage, claimed: Boolean(org.organisation_id) })
}
