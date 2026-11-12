import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readNightViewers } from '@/lib/growth/organiser-report'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import { draftFromTemplate } from './drafts'
import { DAY4_AFTER_DAYS, FOLLOW_UP_LETTERS, nightLine } from './follow-up-letters'
import { photoPath } from './photo-link'
import { melbourneDaysBetween } from './planner'
import { readTheirNights } from './their-nights'
import { letterFields } from './twenty-letters'
import { founderAccount, storeLetters } from './twenty-drafts'

/**
 * THE TWENTY'S DAY 4 LETTERS, DRAFTED HELD (the PM's 19:12 of 12 November 2026; Lawal's 11:11 item 2: "Sent sets
 * follow-ups on day 4 and day 10, and stops on a reply, unsubscribe or bounce"). For every first letter of the twenty
 * (twenty_advice, twenty_offer) that Lawal has sent, from its fourth Melbourne day on, while no second message to that
 * contact exists: their next public night (./their-nights.ts), its distinct viewers (organiser-report.ts
 * readNightViewers, the night report's own count), their photo link, drafted HELD through the CRM's drafter in the first
 * letter's thread. The database judges it again (outreach_touch_is_lawful: step 2 only after step 1, and no message after a
 * reply, an unsubscribe or a hard bounce, by outreach_contact_refusal); gateway.py's follow_up category judges the words
 * when Lawal presses Sent. Nothing here sends anything.
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

export async function draftDay4FollowUps(db: Admin, input: { readonly now: Date; readonly origin: string }): Promise<FollowUpsDrafted> {
  const founder = await founderAccount(db)
  if (founder.id === null) return { state: 'not drafted', why: founder.why }
  const letters = await storeLetters(db, founder.id, FOLLOW_UP_LETTERS)
  const platform = await readPlatformOrganiserIds(db)

  const firsts = await db
    .from('outreach_touches')
    .select('id, contact_id, subject, sent_at, outreach_templates!inner(key)')
    .eq('state', 'sent')
    .eq('step', 1)
    .in('outreach_templates.key', FIRST_KEYS)
  if (firsts.error) throw new Error(`the first letters sent could not be read: ${firsts.error.message}`)
  const sent = (firsts.data ?? []).filter((t) => t.sent_at)
  const contactIds = [...new Set(sent.map((t) => t.contact_id as string))]
  const already = new Set<string>()
  for (let i = 0; i < contactIds.length; i += 200) {
    const r = await db.from('outreach_touches').select('contact_id').eq('step', 2).neq('state', 'void').in('contact_id', contactIds.slice(i, i + 200))
    if (r.error) throw new Error(`their second messages could not be read: ${r.error.message}`)
    for (const t of r.data ?? []) already.add(t.contact_id as string)
  }

  const held: { contactId: string; why: string }[] = []
  const skipped: { contactId: string; why: string }[] = []
  const refused: { contactId: string; why: string }[] = []
  let drafted = 0
  let notYetDue = 0
  for (const first of sent) {
    const contactId = first.contact_id as string
    if (already.has(contactId)) continue
    if (melbourneDaysBetween(new Date(first.sent_at as string), input.now) < DAY4_AFTER_DAYS) {
      notYetDue += 1
      continue
    }
    const contact = await db.from('organiser_contacts').select('organiser_id, person_name, unsubscribe_token').eq('id', contactId).single()
    if (contact.error) {
      skipped.push({ contactId, why: `the contact could not be read: ${contact.error.message}` })
      continue
    }
    const organiserId = contact.data.organiser_id as string
    if (platform.has(organiserId)) continue
    const org = await db.from('organisers').select('id, name, organisation_id, website_url').eq('id', organiserId).single()
    if (org.error) {
      skipped.push({ contactId, why: `the organiser could not be read: ${org.error.message}` })
      continue
    }
    const [night] = await readTheirNights(db, { id: org.data.id, organisation_id: org.data.organisation_id, website_url: org.data.website_url }, input.now, 1)
    if (!night) {
      skipped.push({ contactId, why: 'no public night of theirs ahead to name' })
      continue
    }
    const viewers = await readNightViewers(night.eventId, db)
    const token = contact.data.unsubscribe_token as string | null
    const fields = {
      ...letterFields({
        organiserName: org.data.name as string,
        personName: contact.data.person_name as string | null,
        night: { title: night.title, startDate: night.startDate, timezone: night.timezone, venueName: night.venueName, isFree: night.isFree },
        photoLink: token ? `${input.origin.replace(/\/+$/, '')}${photoPath(contactId, token)}` : null,
      }),
      'night line': nightLine({ title: night.title, startDate: night.startDate, timezone: night.timezone, slug: night.slug, viewers, origin: input.origin }),
      'thread subject': String(first.subject ?? '').replace(/^(re:\s*)+/i, '').trim() || null,
    }
    const done = await draftFromTemplate(db, {
      contactId,
      templateKey: 'twenty_day4',
      purpose: 'cadence',
      step: 2,
      extraFields: fields,
      scheduledFor: input.now,
      origin: input.origin,
      draftedBy: founder.id,
    })
    if (done.state === 'refused') refused.push({ contactId, why: done.reason })
    else {
      drafted += 1
      if (done.value.heldBecause.length > 0) held.push({ contactId, why: done.value.heldBecause.join('; ') })
    }
  }
  return { state: 'drafted', letters, drafted, notYetDue, held, skipped, refused }
}
