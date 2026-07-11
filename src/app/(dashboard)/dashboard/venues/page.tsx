import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2 } from 'lucide-react'
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
    // A brand-new organiser must never dead-end here: same designed empty
    // state + CTA the payouts page uses (audit persona C finding).
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Venues</h1>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-ink-100 bg-white px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 text-gold-600">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-5 font-display text-xl font-bold text-ink-900">
            Create your organisation first
          </h2>
          <p className="mt-2 max-w-md text-sm text-ink-600">
            Venues and seating charts belong to your organisation. Set one up
            and we will bring you straight back here.
          </p>
          <Link
            href="/dashboard/organisation/create"
            className="mt-6 inline-flex min-h-[44px] items-center rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600"
          >
            Create organisation
          </Link>
        </div>
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
