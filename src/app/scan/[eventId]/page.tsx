import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Scanner } from '@/components/features/scanner/scanner'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ eventId: string }> }

/**
 * Door check-in surface. Server-side authorisation mirrors the scan_ticket RPC:
 * the signed-in user must be the event-org owner, an org member with a
 * scanning role (owner/admin/manager), or an active platform admin. An
 * unauthorised user never sees the scanner (and the RPC would refuse anyway).
 */
export default async function ScanPage({ params }: Props) {
  const { eventId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/scan/${eventId}`)

  // The event read uses the service-role client purely to resolve the org and
  // title for the authorisation decision below; it grants no access by itself.
  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('id, title, organisation_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!event || !event.organisation_id) notFound()

  const [{ data: owned }, { data: membership }, { data: adminRow }] = await Promise.all([
    admin.from('organisations').select('id').eq('id', event.organisation_id).eq('owner_id', user.id).maybeSingle(),
    admin
      .from('organisation_members')
      .select('role')
      .eq('organisation_id', event.organisation_id)
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin', 'manager'])
      .maybeSingle(),
    admin.from('admin_users').select('id').eq('id', user.id).is('disabled_at', null).maybeSingle(),
  ])

  const authorised = Boolean(owned) || Boolean(membership) || Boolean(adminRow)
  if (!authorised) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <h1 className="type-rail-heading text-[var(--text-primary)]">Not authorised</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          You do not have permission to scan tickets for this event. Ask the event organiser to add you to their team.
        </p>
      </main>
    )
  }

  return (
    <main className="px-4 py-10">
      <Scanner eventId={event.id} eventTitle={event.title} />
    </main>
  )
}
