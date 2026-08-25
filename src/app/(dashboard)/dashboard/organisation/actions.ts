'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { trackOrganiserSignupServer } from '@/lib/analytics/plausible'
import { acceptFoundingInvite } from '@/lib/founding/invites'
import { FOUNDING_INVITE_COOKIE } from '@/app/join/[code]/cookie'

import { getAppUrl } from '@/lib/site-url'
import { abnValidationMessage, normaliseAbn } from '@/lib/tax/abn'
import { assertCallerMayActForOrganisation } from '@/lib/organisations/act-for'
const CreateOrgSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(500).optional(),
  website: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  email: z.string().email('Must be a valid email').optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
})

export async function createOrganisation(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const raw = {
    name: formData.get('name') as string,
    slug: formData.get('slug') as string,
    description: formData.get('description') as string || undefined,
    website: formData.get('website') as string || undefined,
    email: formData.get('email') as string || undefined,
    phone: formData.get('phone') as string || undefined,
  }

  const parsed = CreateOrgSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { name, slug, description, website, email, phone } = parsed.data

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from('organisations')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existing) {
    return { error: 'This slug is already taken. Please choose another.' }
  }

  // Insert organisation
  const { data: org, error: orgError } = await supabase
    .from('organisations')
    .insert({
      name,
      slug,
      description: description || null,
      website: website || null,
      email: email || user.email,
      phone: phone || null,
      owner_id: user.id,
      status: 'active',
    })
    /*
     * NARROWED FROM A BARE .select(), which returns every column. An INSERT ...
     * RETURNING needs SELECT privilege on each column it returns, so once
     * 20260819000002 revokes SELECT on organisations from `authenticated` and
     * re-grants only (id, name, slug, description, logo_url, website), a bare
     * select here is a permission-denied and creating an organisation fails at
     * the first step of organiser onboarding. Only org.id is read below; name and
     * slug are kept because they are inside the grant and cost nothing.
     */
    .select('id, name, slug')
    .single()

  if (orgError || !org) {
    console.error('[createOrganisation] org insert error:', orgError)
    return { error: 'Failed to create organisation. Please try again.' }
  }

  // Insert owner membership using the service-role client.
  // The anon-key RLS policy on organisation_members requires the user to
  // already be an owner of the org, which is impossible on first insert.
  // We've already verified the user's identity above - this is safe.
  const adminClient = createAdminClient()
  const { error: memberError } = await adminClient
    .from('organisation_members')
    .insert({
      organisation_id: org.id,
      user_id: user.id,
      role: 'owner',
    })

  if (memberError) {
    console.error('[createOrganisation] member insert error:', memberError)
    // Roll back the organisation row so we don't leave orphaned orgs
    await adminClient.from('organisations').delete().eq('id', org.id)
    return { error: 'Failed to assign organisation ownership. Please try again.' }
  }

  // Update profile role to organiser
  await supabase
    .from('profiles')
    .update({ role: 'organiser' })
    .eq('id', user.id)

  // Founding invite conversion: if this signup arrived via a founding invite,
  // attribute it now. Best-effort - a founding-grant failure never blocks
  // organisation creation. The cookie is dropped by the /join/[code] landing.
  try {
    const inviteCode = (await cookies()).get(FOUNDING_INVITE_COOKIE)?.value
    if (inviteCode) {
      await acceptFoundingInvite({
        code: inviteCode,
        userId: user.id,
        orgId: org.id,
        cityFromOrg: null,
      })
      ;(await cookies()).delete(FOUNDING_INVITE_COOKIE)
    }
  } catch (err) {
    console.warn('[createOrganisation] founding invite attribution failed:', err)
  }

  // Plausible: new-organiser conversion. Fire-and-forget before redirect.
  const origin = getAppUrl()
  trackOrganiserSignupServer(`${origin}/dashboard/organisation`, {
    organisation_id: org.id,
    organisation_type: 'organiser',
  }).catch(err => console.warn('[createOrganisation] plausible track failed:', err))

  revalidatePath('/dashboard', 'layout')
  const returnTo = (formData.get('returnTo') as string | null) || '/dashboard/organisation'
  const safeReturnTo = returnTo.startsWith('/dashboard') ? returnTo : '/dashboard/organisation'
  redirect(safeReturnTo)
}

/**
 * THE ORGANISER'S TAX IDENTITY, so their buyers' receipts can be tax invoices.
 *
 * Two facts and a name, and the reason each is asked for is written on the form
 * rather than assumed. The Australian Taxation Office requires a tax invoice to
 * carry the "Seller's identity" and the "Seller's Australian business number
 * (ABN)"
 * (https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices,
 * page last updated 25 August 2025, fetched 25 August 2026), and under the
 * platform's collection-agent posture the seller is the ORGANISER, not
 * EventLinqs. Without these columns no receipt this platform issues can be a
 * valid tax invoice for anyone.
 *
 * GST REGISTRATION IS ASKED SEPARATELY FROM THE ABN, on purpose. They are two
 * different registrations and a great many sole traders under the $75,000
 * turnover threshold hold the first without the second. Inferring one from the
 * other would print "Tax invoice" over a sale carrying no GST and invite the
 * buyer to claim a credit that does not exist.
 */
const TaxDetailsSchema = z.object({
  organisationId: z.string().uuid(),
  legalName: z.string().max(200).optional().or(z.literal('')),
  abn: z.string().max(20).optional().or(z.literal('')),
  gstRegistered: z.union([z.literal('on'), z.literal('')]).optional(),
})

export async function updateOrganisationTaxDetails(
  _prev: { error?: string; ok?: string } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const parsed = TaxDetailsSchema.safeParse({
    organisationId: formData.get('organisationId'),
    legalName: formData.get('legalName') ?? '',
    abn: formData.get('abn') ?? '',
    gstRegistered: formData.get('gstRegistered') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Those details could not be read.' }
  }

  // OWNERSHIP FIRST. The organisation id arrives from a form field, so it is an
  // id the caller chose. `assertCallerMayActForOrganisation` is the shared gate;
  // writing tax details for somebody else's business would be a cross-tenant
  // write of a legally significant field.
  const allowed = await assertCallerMayActForOrganisation(
    user.id,
    parsed.data.organisationId,
    'owner_or_manager',
  )
  if (!allowed.ok) return { error: 'You cannot edit that business.' }

  const abnDigits = normaliseAbn(parsed.data.abn)
  const abnProblem = abnValidationMessage(abnDigits)
  if (abnProblem) return { error: abnProblem }

  const gstRegistered = parsed.data.gstRegistered === 'on'
  if (gstRegistered && abnDigits.length === 0) {
    // A tax invoice needs BOTH. Accepting the declaration without the number
    // would leave the organiser believing their buyers get tax invoices while
    // every one of them is still a plain receipt.
    return { error: 'A tax invoice needs your ABN as well. Add it, or leave GST registration off for now.' }
  }

  const { error } = await createAdminClient()
    .from('organisations')
    .update({
      legal_name: parsed.data.legalName?.trim() || null,
      abn: abnDigits.length === 11 ? abnDigits : null,
      gst_registered: gstRegistered,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.organisationId)

  if (error) {
    console.error('[organisation] tax details update failed:', error)
    return { error: 'Those details could not be saved. Please try again.' }
  }

  revalidatePath('/dashboard/organisation')
  revalidatePath('/dashboard/reports/gst')
  return {
    ok: gstRegistered
      ? 'Saved. Receipts for your paid tickets are now tax invoices.'
      : 'Saved. Your buyers receive receipts; turn on GST registration to issue tax invoices.',
  }
}
