import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PARTNERSHIPS (Train C, row 14: "partner pages, a partner enquiry form, a partner record in admin, labelled
 * "Partner""; done when "an enquiry lands in admin and a partner page is live").
 *
 * A partner is a record the admin makes and puts live; only a live partner has a public page, and every place a
 * partner shows it is labelled Partner, so a partnership is never passed off as an organic listing (the plan:
 * "Sponsored placement clearly labelled, never hidden in organic results"). An enquiry from the public form is a row
 * in the admin queue and nothing else: no email is sent from here.
 */

type Admin = ReturnType<typeof createAdminClient>

export const PARTNER_KINDS = ['venue', 'promoter', 'council', 'festival', 'media', 'sponsor', 'other'] as const
export type PartnerKind = (typeof PARTNER_KINDS)[number]

export const PARTNER_KIND_WORDS: Readonly<Record<PartnerKind, string>> = {
  venue: 'Venue',
  promoter: 'Promoter',
  council: 'Council',
  festival: 'Festival',
  media: 'Media',
  sponsor: 'Sponsor',
  other: 'Partner',
}

export interface Partner {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly kind: PartnerKind
  readonly summary: string
  readonly websiteUrl: string | null
  readonly status: 'draft' | 'live'
}

const toPartner = (r: { id: string; slug: string; name: string; kind: PartnerKind; summary: string; website_url: string | null; status: 'draft' | 'live' }): Partner => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  kind: r.kind,
  summary: r.summary,
  websiteUrl: r.website_url,
  status: r.status,
})

const COLUMNS = 'id, slug, name, kind, summary, website_url, status'

export async function partnersOf(admin: Admin, which: 'live' | 'all'): Promise<Partner[]> {
  const q = admin.from('partners').select(COLUMNS).order('name', { ascending: true }).limit(200)
  const { data, error } = which === 'live' ? await q.eq('status', 'live') : await q
  if (error) throw new Error(`partners could not be read: ${error.message}`)
  return (data ?? []).map(toPartner)
}

export async function livePartner(admin: Admin, slug: string): Promise<Partner | null> {
  const { data, error } = await admin.from('partners').select(COLUMNS).eq('slug', slug).eq('status', 'live').maybeSingle()
  if (error) throw new Error(`the partner could not be read: ${error.message}`)
  return data === null ? null : toPartner(data)
}

export interface EnquiryInput {
  readonly name: string
  readonly email: string
  readonly organisation: string
  readonly kind: string
  readonly message: string
}

/** The form's own checks, the same the table holds, so a refusal is said in words before the database is asked. */
export function enquiryProblem(input: EnquiryInput): string | null {
  if (input.name.trim() === '' || input.name.trim().length > 120) return 'Give your name.'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim()) || input.email.trim().length > 320) return 'Give an email address we can reply to.'
  if (input.organisation.trim() === '' || input.organisation.trim().length > 160) return 'Give the name of your organisation.'
  if (!(PARTNER_KINDS as readonly string[]).includes(input.kind)) return 'Choose what kind of partner you are.'
  if (input.message.trim() === '' || input.message.trim().length > 2000) return 'Tell us in a few lines what you have in mind.'
  return null
}

export async function recordEnquiry(admin: Admin, input: EnquiryInput): Promise<{ readonly state: 'recorded' } | { readonly state: 'refused'; readonly reason: string }> {
  const problem = enquiryProblem(input)
  if (problem !== null) return { state: 'refused', reason: problem }
  const { error } = await admin.from('partner_enquiries').insert({
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    organisation: input.organisation.trim(),
    kind: input.kind,
    message: input.message.trim(),
  })
  if (error) return { state: 'refused', reason: 'Your enquiry could not be sent just now. Try again in a minute.' }
  return { state: 'recorded' }
}

export interface Enquiry {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly organisation: string
  readonly kind: PartnerKind
  readonly message: string
  readonly status: 'new' | 'answered' | 'closed'
  readonly createdAt: string
}

export async function enquiriesOf(admin: Admin): Promise<Enquiry[]> {
  const { data, error } = await admin
    .from('partner_enquiries')
    .select('id, name, email, organisation, kind, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(`partner enquiries could not be read: ${error.message}`)
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, email: r.email, organisation: r.organisation, kind: r.kind, message: r.message, status: r.status, createdAt: r.created_at }))
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

export async function savePartner(
  admin: Admin,
  input: { readonly slug: string; readonly name: string; readonly kind: string; readonly summary: string; readonly websiteUrl: string; readonly by: string },
): Promise<{ readonly state: 'saved' } | { readonly state: 'refused'; readonly reason: string }> {
  const slug = input.slug.trim().toLowerCase()
  if (!SLUG.test(slug)) return { state: 'refused', reason: 'The address is lower case letters, numbers and single dashes, as in beavs-bar.' }
  if (input.name.trim() === '') return { state: 'refused', reason: 'Give the partner a name.' }
  if (!(PARTNER_KINDS as readonly string[]).includes(input.kind)) return { state: 'refused', reason: 'Choose a kind.' }
  if (input.summary.trim() === '') return { state: 'refused', reason: 'Say in a line who they are.' }
  const website = input.websiteUrl.trim()
  if (website !== '' && !website.startsWith('https://')) return { state: 'refused', reason: 'A website starts with https://.' }
  const { error } = await admin.from('partners').insert({
    slug,
    name: input.name.trim(),
    kind: input.kind,
    summary: input.summary.trim(),
    website_url: website === '' ? null : website,
    created_by: input.by,
  })
  if (error) return { state: 'refused', reason: error.code === '23505' ? 'A partner already has that address.' : 'The partner could not be saved just now.' }
  return { state: 'saved' }
}

export async function setPartnerStatus(admin: Admin, id: string, status: 'draft' | 'live'): Promise<boolean> {
  const { error } = await admin.from('partners').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  return error === null
}

export async function markEnquiry(admin: Admin, id: string, status: 'answered' | 'closed', by: string): Promise<boolean> {
  const { error } = await admin.from('partner_enquiries').update({ status, answered_at: new Date().toISOString(), answered_by: by }).eq('id', id)
  return error === null
}
