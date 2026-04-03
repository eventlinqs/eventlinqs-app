import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OrgCreateForm } from './org-create-form'

export default async function CreateOrganisationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // If they already have an org, redirect
  const { data: existing } = await supabase
    .from('organisations')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (existing) redirect('/dashboard/organisation')

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Create Your Organisation</h1>
        <p className="mt-2 text-gray-600">
          Set up your organisation to start creating and selling event tickets.
        </p>
      </div>
      <OrgCreateForm userEmail={user.email ?? ''} />
    </div>
  )
}
