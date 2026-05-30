import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Scanner } from '@/components/features/scanner/scanner'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Door check-in | EventLinqs',
  robots: { index: false, follow: false },
}

type Props = {
  params: Promise<{ eventId: string }>
}

/**
 * Whether the signed-in user may scan for this event: the event org's owner, an
 * organisation_member with role owner/admin/manager, or an active platform
 * admin. Mirrors the authorisation inside the scan_ticket RPC so the UI never
 * shows a scanner the RPC would refuse.
 */
async function canScan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organisationId: string,
): Promise<boolean> {
  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', organisationId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (org) return true

  const { data: member } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
    .in('role', ['owner', 'admin', 'manager'])
    .maybeSingle()
  if (member) return true

  const { data: admin } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', userId)
    .is('disabled_at', null)
    .maybeSingle()
  return Boolean(admin)
}

export default async function ScanPage({ params }: Props) {
  const { eventId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/scan/${eventId}`)

  const { data: event } = await supabase
    .from('events')
    .select('id, title, organisation_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) notFound()

  const authorised = await canScan(supabase, user.id, event.organisation_id)
  if (!authorised) {
    return (
      <main className="min-h-screen bg-ink-950 text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">Not authorised</h1>
        <p className="text-white/70 max-w-sm">
          You do not have permission to scan tickets for this event. Ask the event organiser to add
          you to their team.
        </p>
        <Link
          href="/dashboard"
          className="min-h-[44px] inline-flex items-center rounded-lg bg-gold-500 px-5 font-semibold text-ink-900 hover:bg-gold-600 focus:outline-none focus:ring-2 focus:ring-gold-500"
        >
          Back to dashboard
        </Link>
      </main>
    )
  }

  return <Scanner eventId={event.id} eventTitle={event.title} />
}
