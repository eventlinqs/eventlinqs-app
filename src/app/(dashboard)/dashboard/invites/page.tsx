import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFlagEnabled } from '@/lib/flags'
import { getRequestOrigin } from '@/lib/site-origin'
import { INVITES_PER_FOUNDING_ORGANISER, REFERRAL_BONUS_MONTHS } from '@/lib/founding/invites'
import { getCity } from '@/lib/cities/data'
import { InvitesClient } from './invites-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Founding invites | EventLinqs',
  robots: { index: false, follow: false },
}

/**
 * A Founding Organiser's invite surface: generate personal links for fellow
 * organisers in an open city, and watch conversions turn into fee-free months.
 * Non-founding organisers see the page but are told the programme is
 * invite-only, never a broken control.
 */
export default async function InvitesPage() {
  if (!(await isFlagEnabled('launch_kit'))) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: org } = await supabase
    .from('organisations')
    .select('id, name, is_founding, founding_city, founding_bonus_months')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!org) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center">
        <h1 className="font-display text-2xl font-bold text-ink-900">Founding invites</h1>
        <p className="mt-3 text-sm text-ink-600">Create your organisation first to take part.</p>
        <Link href="/dashboard/organisation/create" className="mt-5 inline-block rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900">
          Set up your organisation
        </Link>
      </div>
    )
  }

  const origin = await getRequestOrigin()
  const admin = createAdminClient()
  const { data: invites } = org.is_founding
    ? await admin
        .from('founding_invites')
        .select('code, city_slug, status, invitee_email, accepted_at, created_at')
        .eq('inviter_org_id', org.id)
        .order('created_at', { ascending: false })
    : { data: [] }

  const rows = (invites ?? []).map(i => ({
    code: i.code,
    url: `${origin}/join/${i.code}`,
    cityName: getCity(i.city_slug as never)?.name ?? i.city_slug,
    status: i.status,
    acceptedAt: i.accepted_at,
  }))
  const acceptedCount = rows.filter(r => r.status === 'accepted').length

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-700">
          The founding programme
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink-900">Invite fellow organisers</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-600">
          Every organiser you bring on earns you {REFERRAL_BONUS_MONTHS} more fee-free months, and gives them
          their own founding spot while any of the 50 remain.
        </p>
      </div>

      {org.is_founding ? (
        <InvitesClient
          initialInvites={rows}
          allowance={INVITES_PER_FOUNDING_ORGANISER}
          bonusMonths={org.founding_bonus_months ?? 0}
          bonusPerReferral={REFERRAL_BONUS_MONTHS}
          acceptedCount={acceptedCount}
        />
      ) : (
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-ink-900">The founding programme is invite-only.</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Founding Organisers are the first 50 across Geelong and Melbourne, invited personally. If you were
            invited, sign up through your invitation link and your founding spot is applied automatically. You can
            still build events and get your launch kit today.
          </p>
          <Link href="/dashboard/events/create" className="mt-4 inline-block rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900">
            Build an event
          </Link>
        </div>
      )}
    </div>
  )
}
