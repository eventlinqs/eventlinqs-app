'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface VenueInput {
  name: string
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  postal_code: string | null
  capacity: number | null
  description: string | null
}

export interface VenueRow {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  postal_code: string | null
  capacity: number | null
  description: string | null
}

async function getOrgId(userId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organisations')
    .select('id')
    .eq('owner_id', userId)
    .single()
  if (error || !data) return null
  return data.id
}

export async function createVenue(input: VenueInput): Promise<{ error?: string; venue?: VenueRow }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const orgId = await getOrgId(user.id)
  if (!orgId) return { error: 'Organisation not found' }

  const admin = createAdminClient()
  const { data, error } = await admin.from('venues').insert({
    organisation_id: orgId,
    name: input.name.trim(),
    address: input.address || null,
    city: input.city || null,
    state: input.state || null,
    country: input.country || null,
    postal_code: input.postal_code || null,
    capacity: input.capacity || null,
    description: input.description || null,
    is_active: true,
  }).select('id, name, address, city, state, country, postal_code, capacity, description').single()

  if (error) {
    console.error('[venues] createVenue failed:', error)
    return { error: `Failed to create venue: ${error.message}` }
  }

  revalidatePath('/dashboard/venues')
  return { venue: data as VenueRow }
}

export async function updateVenue(
  venueId: string,
  input: VenueInput
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const orgId = await getOrgId(user.id)
  if (!orgId) return { error: 'Organisation not found' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('venues')
    .update({
      name: input.name.trim(),
      address: input.address || null,
      city: input.city || null,
      state: input.state || null,
      country: input.country || null,
      postal_code: input.postal_code || null,
      capacity: input.capacity || null,
      description: input.description || null,
    })
    .eq('id', venueId)
    .eq('organisation_id', orgId)

  if (error) {
    console.error('[venues] updateVenue failed:', error)
    return { error: `Failed to update venue: ${error.message}` }
  }

  revalidatePath('/dashboard/venues')
  return {}
}

export async function deleteVenue(venueId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const orgId = await getOrgId(user.id)
  if (!orgId) return { error: 'Organisation not found' }

  const admin = createAdminClient()
  // Soft delete - preserves FK links on historical events
  const { error } = await admin
    .from('venues')
    .update({ is_active: false })
    .eq('id', venueId)
    .eq('organisation_id', orgId)

  if (error) {
    console.error('[venues] deleteVenue failed:', error)
    return { error: `Failed to delete venue: ${error.message}` }
  }

  revalidatePath('/dashboard/venues')
  return {}
}
