import { FOUNDING_TERMS, isWaiverActive } from '@/lib/payments/founding-waiver'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { isFlagEnabled } from '@/lib/flags'
import { getRequestOrigin } from '@/lib/site-origin'
import {
  INVITES_PER_FOUNDING_ORGANISER,
  getFoundingReferralSummary,
} from '@/lib/founding/invites'
import { getCity } from '@/lib/cities/data'
import { OrganisationSwitcher } from '@/components/organisations/organisation-switcher'
import { organisationIdFromParams, resolveOrganisationScope } from '@/lib/organisations/scope'
import { getAllCities } from '@/lib/cities/data'
import { InvitesClient } from './invites-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Referral invites | EventLinqs',
  robots: { index: false, follow: false },
}

/**
 * A Founding Organiser's invite surface: generate personal links for fellow
 * organisers anywhere in Australia, and watch conversions turn into fee-free
 * months. There are no "open cities": the platform is open nationwide from day
 * one (founder ruling 2026-08-23), so the picker offers every city.
 * Every organiser gets the whole surface: LAW 24 as ruled (26 September 2026)
 * makes every organiser a Founding Organiser, so there is no second, lesser
 * version of this page for an organiser who registered without an invitation.
 */
export default async function InvitesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!(await isFlagEnabled('launch_kit'))) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // WHICH business's invites. This was `.eq('owner_id', user.id).maybeSingle()`,
  // which returns PGRST116 and `data: null` when the caller owns more than one, so
  // an owner of several was told to create the organisation they already had. The
  // allowance is counted per `inviter_org_id`, so the business has to be named.
  //
  // Service role scoped to the organisation the resolver verified. The founding_*
  // columns are revoked from `authenticated` by column privilege (20260808000010);
  // see the note in ./actions.ts for why the split is in the application rather
  // than the grant.
  //
  // A FAILED READ IS NOT A MISSING ORGANISATION. The error was discarded here,
  // so a dropped socket left `org` null and this screen told a founding
  // organiser to "create your organisation first", under a button that starts
  // making a second one. readOrThrow answers null only when PostgREST said
  // there is no row, and throws otherwise, so a blink becomes "try again"
  // rather than "you have no business here".
  const scope = await resolveOrganisationScope(organisationIdFromParams(await searchParams))
  const org = scope.ok
    ? await readOrThrow('founding-invites-organisation', () =>
        createAdminClient()
          .from('organisations')
          .select('id, name, founding_fee_free_until')
          .eq('id', scope.active.id)
          .maybeSingle(),
      )
    : null

  if (!org) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center">
        <h1 className="font-display text-2xl font-bold text-ink-900">Referral invites</h1>
        <p className="mt-3 text-sm text-ink-600">Create your organisation first to take part.</p>
        <Link href="/dashboard/organisation/create" className="mt-5 inline-block rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900">
          Set up your organisation
        </Link>
      </div>
    )
  }

  const origin = await getRequestOrigin()
  const admin = createAdminClient()
  // EVERY INVITE, AND A FAILURE IS A FAILURE. This read discarded its error and
  // carried no bound, and the two faults compound: a blink drew "no invites
  // yet" while the action below refuses to mint another because its own count
  // says five have been issued, which is a screen an organiser cannot answer.
  // The list is small by construction (five per organiser) so the ceiling has
  // never been reached, and it is paged anyway because a bound stated in the
  // source is the only kind a reader can see.
  //
  // ORDERED ON created_at AND THEN id, because created_at is not unique and
  // paging over a partial order can hand back one row in two windows and no
  // window at all for another.
  const invites = await readEveryRow<{
        code: string
        city_slug: string
        status: string
        invitee_email: string | null
        accepted_at: string | null
        created_at: string
      }>('this organiser\'s founding invites', (from, to) =>
        admin
          .from('founding_invites')
          .select('code, city_slug, status, invitee_email, accepted_at, created_at')
          .eq('inviter_org_id', org.id)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      )

  const rows = (invites ?? []).map(i => ({
    code: i.code,
    url: `${origin}/join/${i.code}`,
    cityName: getCity(i.city_slug as never)?.name ?? i.city_slug,
    status: i.status,
    acceptedAt: i.accepted_at,
  }))
  const acceptedCount = rows.filter(r => r.status === 'accepted').length

  // WHAT HAS ACTUALLY BEEN EARNED, close-out FO1. "Organisers joined" counted
  // accepted invites, which under the old rule was the same thing as months
  // credited because the credit landed at signup. It is not the same thing any
  // more: the three months arrive when the referred organiser's first paid
  // ticket sells, so the screen has to separate the two or it promises time the
  // charge has not granted.
  const referrals = await getFoundingReferralSummary(org.id)

  return (
    <div className="mx-auto max-w-3xl">
      {scope.ok ? (
        <OrganisationSwitcher
          organisations={scope.organisations}
          activeId={org.id}
          basePath="/dashboard/invites"
        />
      ) : null}

      <div className="mb-6">
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gold-700">
          Referrals
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink-900">Invite fellow organisers</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-600">
          {FOUNDING_TERMS.referral}
        </p>
      </div>

      <InvitesClient
        initialInvites={rows}
        allowance={INVITES_PER_FOUNDING_ORGANISER}
        feeFreeUntil={org.founding_fee_free_until ?? null}
        waiverActive={isWaiverActive(org.founding_fee_free_until)}
        offerInitial={FOUNDING_TERMS.initial}
        acceptedCount={acceptedCount}
        referralsConfirmed={referrals.confirmed}
        referralsPending={referrals.pending}
        cities={getAllCities().map(c => ({ slug: c.slug, name: c.name, state: c.state }))}
      />
    </div>
  )
}
