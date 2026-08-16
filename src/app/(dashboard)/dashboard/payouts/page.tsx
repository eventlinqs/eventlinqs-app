import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ALLOWED_CONNECT_COUNTRIES, getConnectedBusinessName } from '@/lib/stripe/connect'
import { businessNameDivergence, type NameDivergence } from '@/lib/stripe/business-profile'
import { BusinessNameMismatch } from '@/components/payouts/business-name-mismatch'
import {
  ConnectOnboardingCard,
  type ConnectOnboardingState,
} from '@/components/organiser/connect-onboarding-card'
import {
  getOrganiserPayouts,
  getOrganiserPayoutSummary,
  getOrganiserPayoutTerms,
  getReserveReleaseSchedule,
  getRefundImpact,
} from '@/lib/payouts/queries'
import { SummaryCards } from '@/components/payouts/summary-cards'
import { PayoutTermsCard } from '@/components/payouts/payout-terms-card'
import { ReserveReleaseTimeline } from '@/components/payouts/reserve-release-timeline'
import { PayoutsHistoryTable } from '@/components/payouts/payouts-history-table'
import { StripeDashboardButton } from '@/components/payouts/stripe-dashboard-button'
import { RefreshStripeStatus } from '@/components/payouts/refresh-stripe-status'
import { OrganisationSwitcher } from '@/components/organisations/organisation-switcher'
import { resolveOrganiserScope } from '@/lib/payouts/auth'
import { organisationIdFromParams } from '@/lib/organisations/scope'
import { outstandingFrom } from '@/lib/stripe/reconcile-connect'
import { RefundsList } from '@/components/payouts/refunds-list'
import type { Organisation } from '@/types/database'
import { jsonAsRecord } from '@/lib/json-narrow'

export const metadata = {
  title: 'Payouts | EventLinqs Dashboard',
  alternates: {
    canonical: '/dashboard/payouts',
  },
}

export const dynamic = 'force-dynamic'

function deriveState(org: Organisation): ConnectOnboardingState {
  if (!org.stripe_account_id) return 'not_started'
  if (
    org.stripe_onboarding_complete &&
    org.stripe_charges_enabled &&
    org.stripe_payouts_enabled
  ) {
    return 'complete'
  }
  return 'in_progress'
}

/**
 * Compare the organisation name against the business name Stripe holds.
 *
 * Never throws into the render. A Stripe outage or a revoked key must degrade to
 * "we could not check", because a payouts page that 500s is a worse failure than
 * an unreported name mismatch, and this page is where an organiser goes when
 * they are already worried about their money.
 */
async function checkBusinessName(org: Organisation): Promise<NameDivergence> {
  if (!org.stripe_account_id) return { status: 'not_set' }
  try {
    const stripeName = await getConnectedBusinessName(org.stripe_account_id)
    return businessNameDivergence(org.name, stripeName)
  } catch (err) {
    console.error('[payouts] business-name divergence check failed', err)
    return { status: 'not_set' }
  }
}

function readRequirements(value: Record<string, unknown> | null | undefined): string[] {
  if (!value) return []
  const due = value.currently_due
  if (Array.isArray(due)) return due.filter((x): x is string => typeof x === 'string')
  return []
}

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/payouts')

  const searchParamsResolved = (await searchParams) ?? {}

  // Owner-scoped read of Stripe-posture columns.
  //
  // Identity is verified with the SESSION client above (getUser, never
  // getSession), then the row is read with the service role scoped to
  // owner_id = the verified user. That is the pattern resolveOrganiserScope()
  // in src/lib/payouts/auth.ts already uses and which was reviewed and
  // accepted.
  //
  // It has to be the service role now: the stripe_* columns are revoked from
  // `authenticated` by column privilege (migration 20260808000010), because
  // `authenticated` is one role serving both the owner AND any logged-in
  // visitor, and column privileges cannot tell them apart. Leaving those
  // columns granted to `authenticated` would have meant a free signup could
  // read every organiser's payout posture. The ownership filter below is what
  // makes the service-role read safe.
  // WHICH organisation. This used to be `.eq('owner_id', user.id).maybeSingle()`,
  // and maybeSingle returns a PGRST116 error rather than the first row when several
  // match. One owner_id on production holds SIXTEEN organisations, so this page
  // showed "Create your organisation first" to the person who owns all sixteen.
  //
  // resolveOrganiserScope now lists them, honours ?org=<id>, verifies ownership and
  // returns the full set so the switcher below can render.
  const scope = await resolveOrganiserScope(organisationIdFromParams(searchParamsResolved))

  const { data: org } = scope.ok
    ? ((await createAdminClient()
        .from('organisations')
        .select(
          'id, name, stripe_account_id, stripe_account_country, stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarding_complete, stripe_requirements',
        )
        .eq('id', scope.org.organisationId)
        .maybeSingle()) as { data: Organisation | null })
    : { data: null }

  if (!org) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Payouts</h1>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-ink-100 bg-white px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 text-gold-600">
            <Wallet className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-5 font-display text-xl font-bold text-ink-900">
            Create your organisation first
          </h2>
          <p className="mt-2 max-w-md text-sm text-ink-600">
            You need an organisation before you can connect payouts. Set one up
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

  const state = deriveState(org)
  const nameCheck = await checkBusinessName(org)
  // organisations.stripe_requirements is jsonb (Stripe Account requirements
  // payload). Narrow from Json union to Record before passing.
  const requirements = readRequirements(jsonAsRecord(org.stripe_requirements))
  const isOnboarded = state === 'complete'

  // What Stripe last told us is outstanding, so the control is not blank before it
  // is pressed. Derived from the stored requirements payload via the same pure
  // function the reconciler uses, so the page and a fresh reconcile agree.
  const storedOutstanding = outstandingFrom({
    requirements: jsonAsRecord(org.stripe_requirements),
  } as never)

  if (!isOnboarded) {
    return (
      <div className="max-w-3xl">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Payouts</h1>
            <p className="mt-1 text-sm text-ink-600">
              Manage how {org.name} gets paid for ticket sales.
            </p>
          </div>
        </header>

        {scope.ok ? (
          <OrganisationSwitcher
            organisations={scope.organisations}
            activeId={org.id}
            basePath="/dashboard/payouts"
          />
        ) : null}

        {/* The way out of a stranded state. Placed ABOVE the onboarding card on
            purpose: an organiser whose Stripe is already finished but whose row is
            stale must meet the control that fixes it before the card that tells
            them to go and finish onboarding they have already done. */}
        <div className="mb-6">
          <RefreshStripeStatus organisationId={org.id} initialOutstanding={storedOutstanding} />
        </div>

        {nameCheck.status === 'diverged' && (
          <div className="mb-6">
            <BusinessNameMismatch
              platformName={nameCheck.platformName}
              stripeName={nameCheck.stripeName}
              organisationId={org.id}
            />
          </div>
        )}

        <ConnectOnboardingCard
          organisationId={org.id}
          state={state}
          chargesEnabled={Boolean(org.stripe_charges_enabled)}
          payoutsEnabled={Boolean(org.stripe_payouts_enabled)}
          country={org.stripe_account_country}
          pendingRequirements={requirements}
          allowedCountries={ALLOWED_CONNECT_COUNTRIES}
        />
      </div>
    )
  }

  const [summary, terms, schedule, payouts, refunds] = await Promise.all([
    getOrganiserPayoutSummary(org.id),
    getOrganiserPayoutTerms(org.id),
    getReserveReleaseSchedule(org.id, 30),
    getOrganiserPayouts(org.id, { limit: 20, offset: 0 }),
    getRefundImpact(org.id, { limit: 10, offset: 0 }),
  ])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Payouts</h1>
          <p className="mt-1 text-sm text-ink-600">
            Track every payout, reserve release, and refund for {org.name}.
          </p>
        </div>
        <StripeDashboardButton
          enabled={Boolean(org.stripe_account_id)}
          organisationId={org.id}
        />
      </header>

      {scope.ok ? (
        <OrganisationSwitcher
          organisations={scope.organisations}
          activeId={org.id}
          basePath="/dashboard/payouts"
        />
      ) : null}

      {/* Available on the healthy path too, not only when something looks wrong. An
          organiser whose row says onboarded can still be stranded by a stale
          payout_status, which is exactly the state the founder was in, and it does
          not announce itself on this screen. */}
      <RefreshStripeStatus organisationId={org.id} initialOutstanding={storedOutstanding} />

      {nameCheck.status === 'diverged' && (
        <BusinessNameMismatch
          platformName={nameCheck.platformName}
          stripeName={nameCheck.stripeName}
          organisationId={org.id}
        />
      )}

      <SummaryCards summary={summary} />

      <PayoutTermsCard terms={terms} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ReserveReleaseTimeline rows={schedule} />
        <RefundsList page={refunds} />
      </div>

      <PayoutsHistoryTable initialPage={payouts} organisationId={org.id} />
    </div>
  )
}
