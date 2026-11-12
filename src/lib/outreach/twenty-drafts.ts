import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import { readDailyTwenty } from './daily-twenty-read'
import { voidTouch } from './crm'
import { draftFromTemplate, type DraftRequest } from './drafts'
import { photoPath } from './photo-link'
import { readTheirNights } from './their-nights'
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
      /** Held drafts on an older version of a letter, set aside and drafted again in its current words. */
      readonly redrafted: number
      /** Old held first messages on another of the organiser's contacts, set aside for the twenty's letter. */
      readonly setAside: number
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

/**
 * Their next public night (./their-nights.ts: at a venue they run, under their own account, or booked on their own
 * website); null where none is listed.
 */
export async function nextNightOf(
  db: Admin,
  organiser: { id: string; organisation_id: string | null; website_url: string | null },
  now: Date,
): Promise<TheirNight | null> {
  const [n] = await readTheirNights(db, organiser, now, 1)
  return n ? { title: n.title, startDate: n.startDate, timezone: n.timezone, venueName: n.venueName, isFree: n.isFree } : null
}

/** Drafts the day's conversion asks and first messages that have no message waiting. */
export async function draftTheTwenty(db: Admin, input: { readonly now: Date; readonly origin: string }): Promise<TwentyDrafted> {
  const founder = await founderAccount(db)
  if (founder.id === null) return { state: 'not drafted', why: founder.why }
  const letters = await storeTwentyLetters(db, founder.id)

  const day = await readDailyTwenty(db, input.now)
  // The platform's own listings organisation is never written to (src/lib/growth/platform-organiser.ts); the twenty
  // already leaves it out, and the drafter says so again before it reads any organiser.
  const platform = await readPlatformOrganiserIds(db)
  // The newest version of each twenty letter: a draft still held on an older one is voided and drafted again, so every
  // draft Lawal sees carries the letter's current words (version 2 added the photo link, 12 November 2026).
  const newest = new Map<string, number>()
  for (const letter of TWENTY_LETTERS) {
    const v = await db.from('outreach_templates').select('version').eq('key', letter.key).order('version', { ascending: false }).limit(1).maybeSingle()
    if (v.error) throw new Error(`the template ${letter.key} could not be read: ${v.error.message}`)
    if (v.data) newest.set(letter.key, v.data.version as number)
  }
  const waitingRows = await db.from('outreach_touches').select('id, contact_id, state, outreach_templates(key, version)').in('state', ['held', 'queued', 'sending'])
  if (waitingRows.error) throw new Error(`the messages waiting could not be read: ${waitingRows.error.message}`)
  const waitingFor = new Set<string>()
  const stale = new Map<string, { id: string; key: string }>()
  for (const t of waitingRows.data ?? []) {
    const tp = t.outreach_templates as unknown as { key: string; version: number } | null
    const old = t.state === 'held' && tp !== null && newest.has(tp.key) && tp.version < (newest.get(tp.key) as number)
    if (old) stale.set(t.contact_id as string, { id: t.id as string, key: tp.key })
    else waitingFor.add(t.contact_id as string)
  }
  let redrafted = 0
  let setAside = 0

  const held: { organiser: string; why: string }[] = []
  const skipped: { organiser: string; why: string }[] = []
  const refused: { organiser: string; why: string }[] = []
  let drafted = 0
  let waiting = 0
  const handled = new Set<string>()

  /** Drafts one organiser's letter for one email contact, first setting aside a held draft of theirs on an older version. */
  const draftOne = async (a: { organiserId: string; organiserName: string; contactId: string }, groupKey: string): Promise<void> => {
    handled.add(a.contactId)
    const [org, contact] = await Promise.all([
      db.from('organisers').select('id, organisation_id, website_url').eq('id', a.organiserId).single(),
      db.from('organiser_contacts').select('person_name, unsubscribe_token').eq('id', a.contactId).single(),
    ])
    if (org.error || contact.error) {
      skipped.push({ organiser: a.organiserName, why: `could not be read: ${(org.error ?? contact.error)?.message}` })
      return
    }
    const night = await nextNightOf(db, { id: org.data.id, organisation_id: org.data.organisation_id, website_url: org.data.website_url }, input.now)
    const staleDraft = stale.get(a.contactId)
    if (!night) {
      // A held draft naming a night that is no longer ahead would put a wrong line in front of Lawal: set aside, with why.
      if (staleDraft) {
        const v = await voidTouch(db, { touchId: staleDraft.id, reason: 'No public night of theirs is ahead to name; set aside rather than drafted again.' })
        if (v.state === 'done') setAside += 1
      }
      skipped.push({ organiser: a.organiserName, why: 'no public night of theirs to name' })
      return
    }
    const letter = letterFor(groupKey, night)
    if (staleDraft) {
      const voided = await voidTouch(db, { touchId: staleDraft.id, reason: 'The letter has a newer version; drafted again in its current words.' })
      if (voided.state === 'refused') {
        refused.push({ organiser: a.organiserName, why: `the older draft could not be set aside: ${voided.reason}` })
        return
      }
      redrafted += 1
    }
    const token = contact.data.unsubscribe_token as string | null
    const request: DraftRequest = {
      contactId: a.contactId,
      templateKey: letter.key,
      purpose: 'cadence',
      step: 1,
      extraFields: letterFields({
        organiserName: a.organiserName,
        personName: contact.data.person_name,
        night,
        photoLink: token ? `${input.origin.replace(/\/+$/, '')}${photoPath(a.contactId, token)}` : null,
      }),
      scheduledFor: input.now,
      origin: input.origin,
      draftedBy: founder.id,
    }
    let done = await draftFromTemplate(db, request)
    // An old first message still held on another of their contacts (the 22 Instagram, Facebook and form drafts of 30
    // October, never sent, which the gateway refuses for want of the closing and signature) blocks this one: the
    // database allows one conversation per organiser. For the day's twenty it is set aside, voided with its reason and
    // kept, and the letter is drafted once more.
    if (done.state === 'refused' && /already being contacted through/i.test(done.reason)) {
      const others = await db
        .from('outreach_touches')
        .select('id, organiser_contacts!inner(organiser_id)')
        .eq('state', 'held')
        .eq('purpose', 'cadence')
        .neq('contact_id', a.contactId)
        .eq('organiser_contacts.organiser_id', a.organiserId)
      if (others.error) throw new Error(`their other drafts could not be read: ${others.error.message}`)
      for (const t of others.data ?? []) {
        const v = await voidTouch(db, { touchId: t.id as string, reason: "Set aside for the day's twenty, which writes to them by email in Lawal's format (12 November 2026)." })
        if (v.state === 'done') setAside += 1
      }
      done = await draftFromTemplate(db, request)
    }
    if (done.state === 'refused') refused.push({ organiser: a.organiserName, why: done.reason })
    else if (done.value.heldBecause.length > 0) {
      drafted += 1
      held.push({ organiser: a.organiserName, why: done.value.heldBecause.join('; ') })
    } else drafted += 1
  }

  for (const group of day.groups) {
    if (group.key !== 'conversion' && group.key !== 'first_contact') continue
    for (const a of group.actions) {
      if (a.channel !== 'email' || !a.contactId) {
        skipped.push({ organiser: a.organiserName, why: 'not an email contact' })
        continue
      }
      if (platform.has(a.organiserId)) {
        skipped.push({ organiser: a.organiserName, why: "the platform's own listings organisation" })
        continue
      }
      if (waitingFor.has(a.contactId)) {
        waiting += 1
        continue
      }
      await draftOne({ organiserId: a.organiserId, organiserName: a.organiserName, contactId: a.contactId }, group.key)
    }
  }

  // EVERY held draft carries the letter's current words, in today's twenty or not (12 November 2026: Aunty Jacks was
  // drafted at 03:00 on version 1, the twenty's ranking of 70 conversion organisers left it out at 05:00 when the rest
  // moved to version 2, and its draft stayed in Lawal's queue without the photo link). The letter is kept as it was
  // chosen: an offer stays an offer while their night is paid, otherwise the advice letter.
  for (const [contactId, draft] of stale) {
    if (handled.has(contactId)) continue
    const c = await db.from('organiser_contacts').select('organiser_id').eq('id', contactId).single()
    if (c.error) {
      skipped.push({ organiser: contactId, why: `a stale draft's contact could not be read: ${c.error.message}` })
      continue
    }
    const organiserId = c.data.organiser_id as string
    if (platform.has(organiserId)) continue
    const o = await db.from('organisers').select('name').eq('id', organiserId).single()
    if (o.error) {
      skipped.push({ organiser: organiserId, why: `a stale draft's organiser could not be read: ${o.error.message}` })
      continue
    }
    const organiserName = o.data.name as string
    await draftOne({ organiserId, organiserName, contactId }, draft.key === 'twenty_offer' ? 'conversion' : 'first_contact')
  }
  return { state: 'drafted', letters, drafted, redrafted, setAside, waiting, held, skipped, refused }
}
