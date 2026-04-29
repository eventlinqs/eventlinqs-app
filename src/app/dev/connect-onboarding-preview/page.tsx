import type { Metadata } from 'next'
import { ConnectOnboardingCard } from '@/components/organiser/connect-onboarding-card'
import { ALLOWED_CONNECT_COUNTRIES } from '@/lib/stripe/connect'

export const metadata: Metadata = {
  title: 'Connect onboarding preview | EventLinqs (dev)',
  robots: { index: false, follow: false },
}

const FIXED_ORG_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Static preview of the three onboarding states for visual regression
 * and accessibility audits. Not linked from the app shell. Indexers are
 * blocked via the robots meta tag and the route is excluded from
 * sitemap.xml.
 */
export default function ConnectOnboardingPreviewPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Connect onboarding card states</h1>
        <p className="mt-1 text-sm text-ink-600">
          Dev-only preview. Three states stacked for screenshot diffing.
        </p>
      </header>

      <section aria-labelledby="state-not-started">
        <h2 id="state-not-started" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Not started
        </h2>
        <ConnectOnboardingCard
          organisationId={FIXED_ORG_ID}
          state="not_started"
          chargesEnabled={false}
          payoutsEnabled={false}
          country={null}
          pendingRequirements={[]}
          allowedCountries={ALLOWED_CONNECT_COUNTRIES}
        />
      </section>

      <section aria-labelledby="state-in-progress">
        <h2 id="state-in-progress" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
          In progress
        </h2>
        <ConnectOnboardingCard
          organisationId={FIXED_ORG_ID}
          state="in_progress"
          chargesEnabled={false}
          payoutsEnabled={false}
          country="AU"
          pendingRequirements={[
            'external_account',
            'individual.verification.document',
            'tos_acceptance.date',
            'individual.dob.day',
          ]}
          allowedCountries={ALLOWED_CONNECT_COUNTRIES}
        />
      </section>

      <section aria-labelledby="state-complete">
        <h2 id="state-complete" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Complete
        </h2>
        <ConnectOnboardingCard
          organisationId={FIXED_ORG_ID}
          state="complete"
          chargesEnabled={true}
          payoutsEnabled={true}
          country="AU"
          pendingRequirements={[]}
          allowedCountries={ALLOWED_CONNECT_COUNTRIES}
        />
      </section>
    </main>
  )
}
