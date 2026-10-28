/**
 * THE ORGANISER CRM: WHO WE MAY WRITE TO, WHAT WE SENT, WHAT CAME BACK (engine parts B and C, window 6,
 * 28 October 2026; supabase/migrations/20261028201001_organiser_crm.sql).
 *
 * THE DATABASE IS THE JUDGE. Every rule below that decides whether a message may exist is enforced by
 * outreach_touch_is_lawful and the table checks, and the proof (C:\dev\EVIDENCE\CRM-28OCT\crm-GREEN.txt) drives each
 * refusal with raw SQL and no code from here. The pure functions in this module only say the same thing EARLIER, so a
 * screen can show "the no-messages statement is not checked" before Lawal presses anything. When they disagree, the
 * database wins and its words are shown (refusalFromError).
 *
 * THE LAW, as the migration's header cites it (Spam Act 2003, ss 16, 17, 18 and Schedule 2 clause 4; ACMA,
 * https://www.acma.gov.au/avoid-sending-spam; ACMA's June 2024 Statement of Expectations: "Do not send messages based
 * solely on the fact that the email address or phone number has been published"). A published address is never a
 * basis by itself: the page, the date it was seen, the no-messages statement checked and why the message fits the
 * person's role are all recorded, or there is no basis.
 *
 * NOTHING HERE SENDS. Lawal sends one to one from Outlook or by hand; markSent records that he did.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Admin = SupabaseClient<Database>
type Tables = Database['public']['Tables']

export type ContactChannel = 'email' | 'instagram' | 'facebook' | 'website_form'
export type ContactBasis = 'none' | 'conspicuous_publication' | 'express_consent'
export type ReplyOutcome = 'yes' | 'interested' | 'question' | 'later' | 'no' | 'stop' | 'bounce'
export type PipelineStage = 'found' | 'qualified' | 'invited' | 'no_reply' | 'replied' | 'claimed' | 'stopped'

/** The one unsubscribe facility (src/app/unsubscribe/outreach/page.tsx); every email carries it. */
export const OUTREACH_UNSUBSCRIBE_URL = 'https://www.eventlinqs.com.au/unsubscribe/outreach'

/** Day 0, day 4, day 10, then stop (the engine plan, part C). Index is the step number. */
export const CADENCE_DAYS = [null, 0, 4, 10] as const
export const CADENCE_STEPS = 3

// ---------------------------------------------------------------------------------------------------------------------
// The address, in the one spelling the database accepts (organiser_contacts_address_shape).
// ---------------------------------------------------------------------------------------------------------------------

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/
const INSTAGRAM_SHAPE = /^[a-z0-9._]{1,30}$/
const HTTPS_SHAPE = /^https:\/\/\S+$/i

export type NormalisedAddress = { ok: true; address: string } | { ok: false; problem: string }

export function normaliseContactAddress(channel: ContactChannel, raw: string): NormalisedAddress {
  const value = raw.trim()
  if (channel === 'email') {
    const address = value.toLowerCase()
    return EMAIL_SHAPE.test(address) ? { ok: true, address } : { ok: false, problem: 'That is not an email address.' }
  }
  if (channel === 'instagram') {
    const address = value.replace(/^@/, '').replace(/^https:\/\/(www\.)?instagram\.com\//i, '').replace(/\/+$/, '').toLowerCase()
    return INSTAGRAM_SHAPE.test(address) ? { ok: true, address } : { ok: false, problem: 'That is not an Instagram handle.' }
  }
  return HTTPS_SHAPE.test(value) ? { ok: true, address: value } : { ok: false, problem: 'The page must be an https address.' }
}

// ---------------------------------------------------------------------------------------------------------------------
// The basis, whole or not at all (organiser_contacts_basis_is_whole).
// ---------------------------------------------------------------------------------------------------------------------

export type BasisInput = {
  basis: ContactBasis
  publishedOnUrl?: string | null
  seenOn?: string | null
  noMarketingStatementChecked?: boolean
  relevance?: string | null
  consentWording?: string | null
}

/** What is missing before the basis is whole, in plain words. Empty means the database will take it. */
export function basisProblems(input: BasisInput): string[] {
  const problems: string[] = []
  if (input.basis === 'none') return ['No basis is recorded, so nothing may be sent.']
  if (input.basis === 'conspicuous_publication') {
    if (!input.publishedOnUrl || !HTTPS_SHAPE.test(input.publishedOnUrl)) problems.push('The https page the address is published on.')
    if (!input.seenOn) problems.push('The date the address was seen there.')
    if (!input.noMarketingStatementChecked) problems.push('A check that the page says nothing against receiving messages.')
    if ((input.relevance ?? '').trim().length < 10) problems.push('Why the message fits their role, in a sentence.')
  } else {
    if ((input.consentWording ?? '').trim().length < 10) problems.push('Their words of consent, as they gave them.')
    if (!input.seenOn) problems.push('The date they gave consent.')
  }
  return problems
}

// ---------------------------------------------------------------------------------------------------------------------
// The message (sections 17 and 18, as outreach_touch_is_lawful holds them).
// ---------------------------------------------------------------------------------------------------------------------

export function messageProblems(channel: ContactChannel, subject: string | null, body: string): string[] {
  const problems: string[] = []
  if (channel === 'email') {
    if (!subject || subject.trim().length < 3) problems.push('An email needs a subject.')
    if (!body.includes(OUTREACH_UNSUBSCRIBE_URL)) problems.push(`An email must carry the unsubscribe link ${OUTREACH_UNSUBSCRIBE_URL}.`)
  } else if (!body.includes(OUTREACH_UNSUBSCRIBE_URL) && !/reply\s+stop/i.test(body)) {
    problems.push('A message by hand must carry the unsubscribe link or a reply STOP line.')
  }
  if (!body.includes('EventLinqs')) problems.push('The message must name EventLinqs as its sender.')
  const length = body.trim().length
  if (length < 20 || length > 5000) problems.push('The message must be between 20 and 5000 characters.')
  return problems
}

// ---------------------------------------------------------------------------------------------------------------------
// The cadence.
// ---------------------------------------------------------------------------------------------------------------------

/** The day (YYYY-MM-DD, Melbourne) the next step is due, from the day step 1 went; null once three have gone. */
export function nextDueOn(firstSentOn: string, stepsSent: number): string | null {
  if (stepsSent < 1 || stepsSent >= CADENCE_STEPS) return null
  const offset = CADENCE_DAYS[stepsSent + 1] as number
  const [y, m, d] = firstSentOn.split('-').map(Number)
  const due = new Date(Date.UTC(y, m - 1, d + offset))
  return due.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------------------------------------------------
// The database's own words.
// ---------------------------------------------------------------------------------------------------------------------

const PLAIN_CONSTRAINTS: Record<string, string> = {
  organisers_one_per_name: 'That organiser is already recorded under the same name.',
  organisers_one_per_website: 'That organiser is already recorded with the same website.',
  organisers_one_per_instagram: 'That organiser is already recorded with the same Instagram.',
  organiser_contacts_one_per_address: 'That address is already a contact.',
  organiser_contacts_basis_is_whole: 'The basis is not whole: the page, the date, the no-messages check and the relevance are all needed.',
  organiser_contacts_address_shape: 'That address is not in a shape the channel takes.',
  outreach_touches_one_per_step: 'That step is already drafted or sent for this contact.',
  organiser_venues_pkey: 'That venue already has an organiser.',
}

/** A refusal in words Lawal can act on: the trigger's own sentence, or the constraint named plainly. */
export function refusalFromError(error: { message?: string } | null | undefined): string {
  const message = error?.message ?? ''
  const refused = /refused: (.*)$/s.exec(message)
  if (refused) return refused[1].trim()
  for (const [name, plain] of Object.entries(PLAIN_CONSTRAINTS)) if (message.includes(name)) return plain
  return message || 'The database refused it without a reason.'
}

// ---------------------------------------------------------------------------------------------------------------------
// The store. Service role only (every table is revoked from anon and authenticated).
// ---------------------------------------------------------------------------------------------------------------------

export type Done<T> = { state: 'done'; value: T } | { state: 'refused'; reason: string }

function result<T>(r: { data: T | null; error: { message: string } | null }): Done<T> {
  if (r.error || r.data === null) return { state: 'refused', reason: refusalFromError(r.error) }
  return { state: 'done', value: r.data }
}

export async function recordOrganiser(
  db: Admin,
  input: { name: string; websiteUrl?: string | null; instagramHandle?: string | null; foundOn?: string | null; createdBy: string },
): Promise<Done<{ id: string }>> {
  const row: Tables['organisers']['Insert'] = {
    name: input.name.trim(),
    website_url: input.websiteUrl ?? null,
    instagram_handle: input.instagramHandle ? input.instagramHandle.replace(/^@/, '').toLowerCase() : null,
    found_on: input.foundOn ?? null,
    created_by: input.createdBy,
  }
  return result(await db.from('organisers').insert(row).select('id').single())
}

/** One organiser per venue: linking a venue that already has one is refused, re-pointing is an update. */
export async function linkVenue(db: Admin, input: { venueId: string; organiserId: string; linkedBy: string }): Promise<Done<{ venue_id: string }>> {
  return result(await db.from('organiser_venues').insert({ venue_id: input.venueId, organiser_id: input.organiserId, linked_by: input.linkedBy }).select('venue_id').single())
}

export async function mergeVenues(db: Admin, input: { keep: string; drop: string; by: string; reason: string }): Promise<Done<string>> {
  return result(await db.rpc('venue_merge', { p_keep: input.keep, p_drop: input.drop, p_by: input.by, p_reason: input.reason }))
}

export type ContactInput = BasisInput & {
  organiserId: string
  personName?: string | null
  role: string
  channel: ContactChannel
  address: string
  hubspotContactId?: string | null
  evidenceFile?: string | null
  recordedBy: string
}

export async function recordContact(db: Admin, input: ContactInput): Promise<Done<{ id: string }>> {
  const address = normaliseContactAddress(input.channel, input.address)
  if (!address.ok) return { state: 'refused', reason: address.problem }
  const withBasis = input.basis !== 'none'
  const row: Tables['organiser_contacts']['Insert'] = {
    organiser_id: input.organiserId,
    person_name: input.personName ?? null,
    role: input.role.trim(),
    channel: input.channel,
    address: address.address,
    hubspot_contact_id: input.hubspotContactId ?? null,
    basis: input.basis,
    published_on_url: input.publishedOnUrl ?? null,
    seen_on: input.seenOn ?? null,
    no_marketing_statement_checked: input.noMarketingStatementChecked ?? false,
    relevance: input.relevance ?? null,
    consent_wording: input.consentWording ?? null,
    evidence_file: input.evidenceFile ?? null,
    basis_recorded_by: withBasis ? input.recordedBy : null,
    basis_recorded_at: withBasis ? new Date().toISOString() : null,
    created_by: input.recordedBy,
  }
  return result(await db.from('organiser_contacts').insert(row).select('id').single())
}

/** A draft held for Lawal. The database refuses it if the contact may not be written to. */
export async function draftTouch(
  db: Admin,
  input: { contactId: string; step: 1 | 2 | 3; subject: string | null; body: string; trackedLink?: string | null; draftedBy: string },
): Promise<Done<{ id: string }>> {
  return result(await db.from('outreach_touches').insert({
    contact_id: input.contactId,
    step: input.step,
    subject: input.subject,
    body: input.body,
    tracked_link: input.trackedLink ?? null,
    drafted_by: input.draftedBy,
  }).select('id').single())
}

/** Lawal sent it. The database checks the cadence and keeps the basis relied on beside the message. */
export async function markSent(db: Admin, input: { touchId: string; sentAt: string; sentBy: string }): Promise<Done<{ id: string }>> {
  return result(await db.from('outreach_touches').update({ state: 'sent', sent_at: input.sentAt, sent_by: input.sentBy }).eq('id', input.touchId).eq('state', 'held').select('id').single())
}

export async function voidTouch(db: Admin, input: { touchId: string; reason: string }): Promise<Done<{ id: string }>> {
  return result(await db.from('outreach_touches').update({ state: 'void', void_reason: input.reason }).eq('id', input.touchId).eq('state', 'held').select('id').single())
}

/** What came back, verbatim. Any reply stops the cadence; a stop joins outreach_unsubscribes; a no stops the organiser. */
export async function logReply(
  db: Admin,
  input: { contactId: string; touchId?: string | null; receivedAt: string; wording: string; outcome: ReplyOutcome; loggedBy: string },
): Promise<Done<{ id: string }>> {
  return result(await db.from('outreach_replies').insert({
    contact_id: input.contactId,
    touch_id: input.touchId ?? null,
    received_at: input.receivedAt,
    wording: input.wording,
    outcome: input.outcome,
    logged_by: input.loggedBy,
  }).select('id').single())
}

/** Why this contact may not be written to now, or null when they may. */
export async function contactRefusal(db: Admin, contactId: string): Promise<string | null> {
  const r = await db.rpc('outreach_contact_refusal', { p_contact: contactId })
  if (r.error) throw new Error(`outreach_contact_refusal: ${r.error.message}`)
  return r.data
}

export type PipelineLine = Database['public']['Views']['outreach_pipeline']['Row']

export async function readPipeline(db: Admin): Promise<PipelineLine[]> {
  const r = await db.from('outreach_pipeline').select('*').order('next_due_on', { ascending: true, nullsFirst: false }).order('name')
  if (r.error) throw new Error(`outreach_pipeline: ${r.error.message}`)
  return r.data ?? []
}
