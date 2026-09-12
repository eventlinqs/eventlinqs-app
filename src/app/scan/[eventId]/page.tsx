import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { Scanner } from '@/components/features/scanner/scanner'
import { noIndexMetadata } from '@/lib/seo/indexing-policy'

export const dynamic = 'force-dynamic'

// The door scanner is staff only and NEVER indexable
// (src/lib/seo/indexing-policy.ts). It declared no robots directive until
// 8 September 2026, so it inherited the root layout's index, follow. It is
// not in robots.txt's disallow list either, so nothing anywhere said no.
export const metadata: Metadata = {
  title: 'Door check-in | EventLinqs',
  ...noIndexMetadata(),
}

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
  // Every read on the door's way in goes through readOrThrow: a blink at the
  // door must answer "try again", never "this event does not exist" and never
  // "you are not authorised" (src/lib/supabase/read-or-throw.ts).
  const admin = createAdminClient()
  const event = await readOrThrow('door event', () =>
    admin.from('events').select('id, title, organisation_id').eq('id', eventId).maybeSingle(),
  )
  if (!event || !event.organisation_id) notFound()

  const [owned, membership, adminRow] = await Promise.all([
    readOrThrow('door owner', () =>
      admin.from('organisations').select('id').eq('id', event.organisation_id).eq('owner_id', user.id).maybeSingle(),
    ),
    readOrThrow('door membership', () =>
      admin
        .from('organisation_members')
        .select('role')
        .eq('organisation_id', event.organisation_id)
        .eq('user_id', user.id)
        .in('role', ['owner', 'admin', 'manager'])
        .maybeSingle(),
    ),
    readOrThrow('door admin', () =>
      admin.from('admin_users').select('id').eq('id', user.id).is('disabled_at', null).maybeSingle(),
    ),
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
