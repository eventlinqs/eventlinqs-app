import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { VenuesClient } from './venues-client'

export default async function VenuesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!org) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        You need to create an organisation before managing venues.
      </div>
    )
  }

  const { data: venues, error } = await supabase
    .from('venues')
    .select('id, name, address, city, state, country, postal_code, capacity, description')
    .eq('organisation_id', org.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[venues/page] failed to load venues:', error)
  }

  return <VenuesClient venues={venues ?? []} />
}
