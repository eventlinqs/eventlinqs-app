'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { trackOrganiserSignupServer } from '@/lib/analytics/plausible'

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
    .select()
    .single()

  if (orgError || !org) {
    console.error('[createOrganisation] org insert error:', orgError)
    return { error: 'Failed to create organisation. Please try again.' }
  }

  // Insert owner membership using the service-role client.
  // The anon-key RLS policy on organisation_members requires the user to
  // already be an owner of the org, which is impossible on first insert.
  // We've already verified the user's identity above — this is safe.
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

  // Plausible: new-organiser conversion. Fire-and-forget before redirect.
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventlinqs.com'
  trackOrganiserSignupServer(`${origin}/dashboard/organisation`, {
    organisation_id: org.id,
    organisation_type: 'organiser',
  }).catch(err => console.warn('[createOrganisation] plausible track failed:', err))

  revalidatePath('/dashboard', 'layout')
  const returnTo = (formData.get('returnTo') as string | null) || '/dashboard/organisation'
  const safeReturnTo = returnTo.startsWith('/dashboard') ? returnTo : '/dashboard/organisation'
  redirect(safeReturnTo)
}
