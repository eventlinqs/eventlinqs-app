import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { readDailyTwenty } from './daily-twenty-read'
import { draftFromTemplate } from './drafts'
import { letterFields, letterFor, TWENTY_LETTERS, type TheirNight, type TwentyLetter } from './twenty-letters'

/**
 * TOMORROW'S TWENTY, DRAFTED EVERY DAY FROM VERIFIED ROWS (Lawal, 12 November 2026, 11:11, item 1: "by 07:00 tomorrow
 * (13 Nov) and every day ... the draft in his own format"; the PM's 11:58, item 2: without the API, his October format
 * filled from verified CRM facts, through the gateway's checks).
 *
 * In the outreach run (src/app/api/cron/outreach-run/route.ts), once an hour: the twenty letters (./twenty-letters.ts)
 * are stored as templates, versioned and never edited; then every conversion ask and first message in the day's twenty
 * (./daily-twenty-read.ts, Melbourne first, the score, everyone already written to left out) whose contact has no
 * message waiting is drafted HELD through the CRM's own drafter (./drafts.ts draftFromTemplate), its one line about
 * them made from their next public night's own title, day and place. The database judges every draft again
 * (outreach_touch_is_lawful); a field with no verified value leaves the draft held with the rule named, and the
 * gateway (voice-gate.ts) judges the words again when Lawal presses Sent. Nothing here sends anything.
 *
 * The drafts are Lawal's, drafted for him: drafted_by is the one founder account (the only enabled super_admin, the
 * account every earlier draft and template names). With no such account, or more than one, nothing is drafted and the
 * run says why.
 */

type Admin = SupabaseClient<Database>

export type TwentyDrafted =
  | { readonly state: 'not drafted'; readonly why: string }
  | {
      readonly state: 'drafted'
      readonly letters: readonly string[]
      readonly drafted: number
      readonly waiting: number
      readonly held: readonly { readonly organiser: string; readonly why: string }[]
      readonly skipped: readonly { readonly organiser: string; readonly why: string }[]
      readonly refused: readonly { readonly organiser: string; readonly why: string }[]
    }

/** The one founder account, or null with the reason. */
export async function founderAccount(db: Admin): Promise<{ id: string } | { id: null; why: string }> {
  const r = await db.from('admin_users').select('id').eq('role', 'super_admin').is('disabled_at', null).limit(3)
  if (r.error) return { id: null, why: `the founder account could not be read: ${r.error.message}` }
  const rows = r.data ?? []
  if (rows.length !== 1) return { id: null, why: `there are ${rows.length} enabled founder accounts, not one` }
  return { id: rows[0].id as string }
}

const sameWords = (a: { channel: string; purpose: string; step: number | null; subject: string | null; body: string }, b: TwentyLetter) =>
  a.channel === b.channel && a.purpose === b.purpose && a.step === b.step && a.subject === b.subject && a.body === b.body

/** Stores each letter whose words are not yet the newest version of its key; returns the keys written. */
export async function storeTwentyLetters(db: Admin, by: string): Promise<string[]> {
  const written: string[] = []
  for (const letter of TWENTY_LETTERS) {
    const newest = await db
      .from('outreach_templates')
      .select('version, channel, purpose, step, subject, body')
      .eq('key', letter.key)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (newest.error) throw new Error(`the template ${letter.key} could not be read: ${newest.error.message}`)
    if (newest.data && sameWords(newest.data, letter)) continue
    const ins = await db.from('outreach_templates').insert({
      key: letter.key,
      version: (newest.data?.version ?? 0) + 1,
      channel: letter.channel,
      purpose: letter.purpose,
      step: letter.step,
      subject: letter.subject,
      body: letter.body,
      source: letter.source,
      created_by: by,
    })
    if (ins.error) throw new Error(`the template ${letter.key} could not be stored: ${ins.error.message}`)
    written.push(`${letter.key} v${(newest.data?.version ?? 0) + 1}`)
  }
  return written
}

type NightRow = { title: string; start_date: string; timezone: string | null; venue_name: string | null; is_free: boolean | null }

/** Their next public night, at one of their venues or under their own account; null where none is listed. */
export async function nextNightOf(db: Admin, organiser: { id: string; organisation_id: string | null }, now: Date): Promise<TheirNight | null> {
  const venues = await db.from('organiser_venues').select('venue_id').eq('organiser_id', organiser.id)
  if (venues.error) throw new Error(`their venues could not be read: ${venues.error.message}`)
  const venueIds = (venues.data ?? []).map((v) => v.venue_id as string)
  const first = async (column: 'venue_id' | 'organisation_id', values: string[]): Promise<NightRow | null> => {
    if (values.length === 0) return null
    const r = await applyPublicEventVisibility(
      (db as unknown as SupabaseClient).from('events').select('title, start_date, timezone, venue_name, is_free'),
      { now, includeExternal: true },
    )
      .in(column, values)
      .gt('end_date', now.toISOString())
      .order('start_date', { ascending: true })
      .limit(1)
    if (r.error) throw new Error(`their nights could not be read: ${r.error.message}`)
    return ((r.data ?? [])[0] as NightRow | undefined) ?? null
  }
  const nights = [await first('venue_id', venueIds), await first('organisation_id', organiser.organisation_id ? [organiser.organisation_id] : [])].filter(
    (n): n is NightRow => n !== null,
  )
  nights.sort((a, b) => a.start_date.localeCompare(b.start_date))
  const n = nights[0]
  return n ? { title: n.title, startDate: n.start_date, timezone: n.timezone, venueName: n.venue_name, isFree: n.is_free } : null
}

/** Drafts the day's conversion asks and first messages that have no message waiting. */
export async function draftTheTwenty(db: Admin, input: { readonly now: Date; readonly origin: string }): Promise<TwentyDrafted> {
  const founder = await founderAccount(db)
  if (founder.id === null) return { state: 'not drafted', why: founder.why }
  const letters = await storeTwentyLetters(db, founder.id)

  const day = await readDailyTwenty(db, input.now)
  const waitingRows = await db.from('outreach_touches').select('contact_id').in('state', ['held', 'queued', 'sending'])
  if (waitingRows.error) throw new Error(`the messages waiting could not be read: ${waitingRows.error.message}`)
  const waitingFor = new Set((waitingRows.data ?? []).map((t) => t.contact_id as string))

  const held: { organiser: string; why: string }[] = []
  const skipped: { organiser: string; why: string }[] = []
  const refused: { organiser: string; why: string }[] = []
  let drafted = 0
  let waiting = 0
  for (const group of day.groups) {
    if (group.key !== 'conversion' && group.key !== 'first_contact') continue
    for (const a of group.actions) {
      if (a.channel !== 'email' || !a.contactId) {
        skipped.push({ organiser: a.organiserName, why: 'not an email contact' })
        continue
      }
      if (waitingFor.has(a.contactId)) {
        waiting += 1
        continue
      }
      const [org, contact] = await Promise.all([
        db.from('organisers').select('id, organisation_id').eq('id', a.organiserId).single(),
        db.from('organiser_contacts').select('person_name').eq('id', a.contactId).single(),
      ])
      if (org.error || contact.error) {
        skipped.push({ organiser: a.organiserName, why: `could not be read: ${(org.error ?? contact.error)?.message}` })
        continue
      }
      const night = await nextNightOf(db, { id: org.data.id, organisation_id: org.data.organisation_id }, input.now)
      if (!night) {
        skipped.push({ organiser: a.organiserName, why: 'no public night of theirs to name' })
        continue
      }
      const letter = letterFor(group.key, night)
      const done = await draftFromTemplate(db, {
        contactId: a.contactId,
        templateKey: letter.key,
        purpose: 'cadence',
        step: 1,
        extraFields: letterFields({ organiserName: a.organiserName, personName: contact.data.person_name, night }),
        scheduledFor: input.now,
        origin: input.origin,
        draftedBy: founder.id,
      })
      if (done.state === 'refused') refused.push({ organiser: a.organiserName, why: done.reason })
      else if (done.value.heldBecause.length > 0) {
        drafted += 1
        held.push({ organiser: a.organiserName, why: done.value.heldBecause.join('; ') })
      } else drafted += 1
    }
  }
  return { state: 'drafted', letters, drafted, waiting, held, skipped, refused }
}
