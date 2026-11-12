import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getOrCreateShareLink } from '@/lib/broadcast/share-links'
import { buildEventShortUrl } from '@/lib/broadcast/short-links'
import { readNightViewers } from '@/lib/growth/organiser-report'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import { draftFromTemplate } from './drafts'
import { DAY10_AFTER_DAYS, DAY4_AFTER_DAYS, FOLLOW_UP_LETTERS, nightLine } from './follow-up-letters'
import { photoPath } from './photo-link'
import { melbourneDaysBetween } from './planner'
import { readTheirNights, type OwnNight } from './their-nights'
import { letterFields } from './twenty-letters'
import { founderAccount, storeLetters } from './twenty-drafts'

/**
 * THE TWENTY'S FOLLOW UPS, DRAFTED HELD (the PM's 19:12 and 19:56 of 12 November 2026; Lawal's 11:11 item 2: "Sent sets
 * follow-ups on day 4 and day 10, and stops on a reply, unsubscribe or bounce"). For every first letter of the twenty
 * (twenty_advice, twenty_offer) Lawal has sent:
 *   day 4, from the fourth Melbourne day, while no second message to that contact exists: their next public night
 *   (./their-nights.ts), its distinct viewers (organiser-report.ts readNightViewers, the night report's own count), their
 *   photo link;
 *   day 10, from the tenth Melbourne day, once the day 4 letter was SENT and while no third message exists: the night's
 *   own tracked /e/ link (share-links.ts getOrCreateShareLink), no imagery (way B, until Lawal approves way A).
 * Each is drafted HELD through the CRM's drafter in the first letter's thread; the database judges it again
 * (outreach_touch_is_lawful: a step only after the step before it, and no message after a reply, an unsubscribe or a hard
 * bounce); gateway.py's follow_up category judges the words when Lawal presses Sent. Nothing here sends anything.
 */

type Admin = SupabaseClient<Database>

export type FollowUpsDrafted =
  | { readonly state: 'not drafted'; readonly why: string }
  | {
      readonly state: 'drafted'
      readonly letters: readonly string[]
      readonly drafted: number
      readonly notYetDue: number
      readonly held: readonly { readonly contactId: string; readonly why: string }[]
      readonly skipped: readonly { readonly contactId: string; readonly why: string }[]
      readonly refused: readonly { readonly contactId: string; readonly why: string }[]
    }

const FIRST_KEYS = ['twenty_advice', 'twenty_offer']

interface Theirs {
  readonly contactId: string
  readonly organiserName: string
  readonly personName: string | null
  readonly photoLink: string | null
  readonly night: OwnNight
}

/** Their contact, organiser and next public night, or why the letter cannot be written. */
async function readTheirs(db: Admin, contactId: string, platform: ReadonlySet<string>, input: { now: Date; origin: string }): Promise<Theirs | { why: string } | null> {
  const contact = await db.from('organiser_contacts').select('organiser_id, person_name, unsubscribe_token').eq('id', contactId).single()
  if (contact.error) return { why: `the contact could not be read: ${contact.error.message}` }
  const organiserId = contact.data.organiser_id as string
  if (platform.has(organiserId)) return null
  const org = await db.from('organisers').select('id, name, organisation_id, website_url').eq('id', organiserId).single()
  if (org.error) return { why: `the organiser could not be read: ${org.error.message}` }
  const [night] = await readTheirNights(db, { id: org.data.id, organisation_id: org.data.organisation_id, website_url: org.data.website_url }, input.now, 1)
  if (!night) return { why: 'no public night of theirs ahead to name' }
  const token = contact.data.unsubscribe_token as string | null
  return {
    contactId,
    organiserName: org.data.name as string,
    personName: contact.data.person_name as string | null,
    photoLink: token ? `${input.origin.replace(/\/+$/, '')}${photoPath(contactId, token)}` : null,
    night,
  }
}

const threadSubject = (subject: unknown) => String(subject ?? '').replace(/^(re:\s*)+/i, '').trim() || null

const baseFields = (t: Theirs) =>
  letterFields({
    organiserName: t.organiserName,
    personName: t.personName,
    night: { title: t.night.title, startDate: t.night.startDate, timezone: t.night.timezone, venueName: t.night.venueName, isFree: t.night.isFree },
    photoLink: t.photoLink,
  })

/** The first letters Lawal sent, with the contacts that already have a message at the given step. */
async function readSent(db: Admin, step: number): Promise<{ firsts: { id: string; contactId: string; subject: unknown; sentAt: string }[]; taken: Set<string>; dayFourSent: Set<string> }> {
  const firsts = await db
    .from('outreach_touches')
    .select('id, contact_id, subject, sent_at, outreach_templates!inner(key)')
    .eq('state', 'sent')
    .eq('step', 1)
    .in('outreach_templates.key', FIRST_KEYS)
  if (firsts.error) throw new Error(`the first letters sent could not be read: ${firsts.error.message}`)
  const rows = (firsts.data ?? []).filter((t) => t.sent_at).map((t) => ({ id: t.id as string, contactId: t.contact_id as string, subject: t.subject, sentAt: t.sent_at as string }))
  const ids = [...new Set(rows.map((r) => r.contactId))]
  const taken = new Set<string>()
  const dayFourSent = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const r = await db.from('outreach_touches').select('contact_id, step, state').in('step', [2, 3]).neq('state', 'void').in('contact_id', ids.slice(i, i + 200))
    if (r.error) throw new Error(`their later messages could not be read: ${r.error.message}`)
    for (const t of r.data ?? []) {
      if (t.step === step) taken.add(t.contact_id as string)
      if (t.step === 2 && t.state === 'sent') dayFourSent.add(t.contact_id as string)
    }
  }
  return { firsts: rows, taken, dayFourSent }
}

async function draftFollowUps(db: Admin, input: { readonly now: Date; readonly origin: string }, step: 2 | 3): Promise<FollowUpsDrafted> {
  const founder = await founderAccount(db)
  if (founder.id === null) return { state: 'not drafted', why: founder.why }
  const letters = await storeLetters(db, founder.id, FOLLOW_UP_LETTERS)
  const platform = await readPlatformOrganiserIds(db)
  const { firsts, taken, dayFourSent } = await readSent(db, step)

  const held: { contactId: string; why: string }[] = []
  const skipped: { contactId: string; why: string }[] = []
  const refused: { contactId: string; why: string }[] = []
  let drafted = 0
  let notYetDue = 0
  for (const first of firsts) {
    if (taken.has(first.contactId)) continue
    if (step === 3 && !dayFourSent.has(first.contactId)) continue
    if (melbourneDaysBetween(new Date(first.sentAt), input.now) < (step === 2 ? DAY4_AFTER_DAYS : DAY10_AFTER_DAYS)) {
      notYetDue += 1
      continue
    }
    const theirs = await readTheirs(db, first.contactId, platform, input)
    if (theirs === null) continue
    if ('why' in theirs) {
      skipped.push({ contactId: first.contactId, why: theirs.why })
      continue
    }
    let fields: Record<string, string | null>
    if (step === 2) {
      const viewers = await readNightViewers(theirs.night.eventId, db)
      fields = {
        ...baseFields(theirs),
        'night line': nightLine({ title: theirs.night.title, startDate: theirs.night.startDate, timezone: theirs.night.timezone, slug: theirs.night.slug, viewers, origin: input.origin }),
        'thread subject': threadSubject(first.subject),
      }
    } else {
      const link = await getOrCreateShareLink({
        eventId: theirs.night.eventId,
        channel: 'email',
        createdBy: founder.id,
        eventSlug: theirs.night.slug,
        eventStartDate: theirs.night.startDate,
        eventTimezone: theirs.night.timezone,
      })
      fields = {
        ...baseFields(theirs),
        // No link means no letter: the draft is held with the rule named rather than sent with a plain page address.
        'tracked link': link ? buildEventShortUrl(input.origin, link.code) : null,
        'thread subject': threadSubject(first.subject),
      }
    }
    const done = await draftFromTemplate(db, {
      contactId: first.contactId,
      templateKey: step === 2 ? 'twenty_day4' : 'twenty_day10',
      purpose: 'cadence',
      step,
      extraFields: fields,
      scheduledFor: input.now,
      origin: input.origin,
      draftedBy: founder.id,
    })
    if (done.state === 'refused') refused.push({ contactId: first.contactId, why: done.reason })
    else {
      drafted += 1
      if (done.value.heldBecause.length > 0) held.push({ contactId: first.contactId, why: done.value.heldBecause.join('; ') })
    }
  }
  return { state: 'drafted', letters, drafted, notYetDue, held, skipped, refused }
}

export function draftDay4FollowUps(db: Admin, input: { readonly now: Date; readonly origin: string }): Promise<FollowUpsDrafted> {
  return draftFollowUps(db, input, 2)
}

export function draftDay10FollowUps(db: Admin, input: { readonly now: Date; readonly origin: string }): Promise<FollowUpsDrafted> {
  return draftFollowUps(db, input, 3)
}
