import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ALLOWED_CONNECT_COUNTRIES } from '@/lib/stripe/connect'
import {
  ConnectOnboardingCard,
  type ConnectOnboardingState,
} from '@/components/organiser/connect-onboarding-card'
import type { Organisation } from '@/types/database'

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

function readRequirements(value: Record<string, unknown> | null | undefined): string[] {
  if (!value) return []
  const due = value.currently_due
  if (Array.isArray(due)) return due.filter((x): x is string => typeof x === 'string')
  return []
}

export default async function PayoutsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/payouts')

  const { data: org } = (await supabase
    .from('organisations')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle()) as { data: Organisation | null }

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
  const requirements = readRequirements(org.stripe_requirements)

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
