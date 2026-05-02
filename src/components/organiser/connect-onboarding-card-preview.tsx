import { AlertCircle, Check, ExternalLink, ShieldCheck } from 'lucide-react'
import type { ConnectOnboardingState } from './connect-onboarding-card'

const COUNTRY_LABELS: Record<string, string> = {
  AU: 'Australia',
  GB: 'United Kingdom',
  US: 'United States',
  NZ: 'New Zealand',
  CA: 'Canada',
  IE: 'Ireland',
  AT: 'Austria',
  BE: 'Belgium',
  BG: 'Bulgaria',
  HR: 'Croatia',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DK: 'Denmark',
  EE: 'Estonia',
  FI: 'Finland',
  FR: 'France',
  DE: 'Germany',
  GR: 'Greece',
  HU: 'Hungary',
  IT: 'Italy',
  LV: 'Latvia',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  MT: 'Malta',
  NL: 'Netherlands',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  SK: 'Slovakia',
  SI: 'Slovenia',
  ES: 'Spain',
  SE: 'Sweden',
}

export type ConnectOnboardingCardPreviewProps = {
  state: ConnectOnboardingState
  chargesEnabled: boolean
  payoutsEnabled: boolean
  country: string | null
  pendingRequirements: string[]
  allowedCountries: readonly string[]
}

const FRIENDLY_REQ: Record<string, string> = {
  'business_profile.url': 'Business website or social link',
  'business_profile.mcc': 'Business category',
  'external_account': 'Bank account for payouts',
  'tos_acceptance.date': 'Accept Stripe terms of service',
  'individual.verification.document': 'Government issued ID',
  'individual.dob.day': 'Date of birth',
  'individual.dob.month': 'Date of birth',
  'individual.dob.year': 'Date of birth',
  'individual.address.line1': 'Home address',
  'individual.address.city': 'Home address',
  'individual.address.postal_code': 'Home address',
  'individual.first_name': 'Legal first name',
  'individual.last_name': 'Legal last name',
  'individual.email': 'Email address',
  'individual.phone': 'Phone number',
}

function friendly(key: string): string {
  return FRIENDLY_REQ[key] ?? key.replace(/[._]/g, ' ')
}

function dedupe(keys: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const k of keys) {
    const f = friendly(k)
    if (!seen.has(f)) {
      seen.add(f)
      out.push(f)
    }
  }
  return out
}

/**
 * Server-rendered, non-interactive twin of ConnectOnboardingCard.
 *
 * Markup is byte-identical to the production component so visual
 * regression baselines and axe-core audits hold. Buttons are still
 * focusable and have the same aria-labels, but they do not submit
 * because this surface is screenshot/audit-only.
 *
 * The production interactive card lives in connect-onboarding-card.tsx
 * and is what /dashboard/payouts renders.
 */
export function ConnectOnboardingCardPreview({
  state,
  chargesEnabled,
  payoutsEnabled,
  country,
  pendingRequirements,
  allowedCountries,
}: ConnectOnboardingCardPreviewProps) {
  const sortedCountries = [...allowedCountries].sort((a, b) => {
    const la = COUNTRY_LABELS[a] ?? a
    const lb = COUNTRY_LABELS[b] ?? b
    return la.localeCompare(lb)
  })
  const requirements = dedupe(pendingRequirements)
  const selectedCountry = country ?? 'AU'

  return (
    <section
      aria-labelledby="connect-onboarding-heading"
      className="rounded-2xl border border-ink-100 bg-white shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2
            id="connect-onboarding-heading"
            className="font-display text-lg font-bold text-ink-900"
          >
            Get paid for ticket sales
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            We use Stripe to verify your identity and route payouts. Verification
            is handled on Stripe and usually takes a few minutes.
          </p>
        </div>
        <StatusPill state={state} />
      </header>

      <div className="px-5 py-5 sm:px-6">
        {state === 'not_started' && (
          <div className="space-y-4">
            <ul className="grid gap-2 text-sm text-ink-700 sm:grid-cols-2">
              <BulletItem text="Transparent fees, no hidden charges" />
              <BulletItem text="Payouts begin three days after the event" />
              <BulletItem text="Bank verification is done by Stripe, not us" />
              <BulletItem text="Switch payout schedule once you reach Tier 2" />
            </ul>

            <div>
              <label
                htmlFor="connect-country"
                className="block text-xs font-semibold uppercase tracking-wide text-ink-600"
              >
                Where is your business based?
              </label>
              <p className="mt-1 text-xs text-ink-500">
                You cannot change this after onboarding starts.
              </p>
              <select
                id="connect-country"
                name="country"
                defaultValue={selectedCountry}
                aria-label="Business country"
                className="mt-2 block w-full min-h-[44px] rounded-lg border border-ink-200 bg-white px-3 py-2 text-base text-ink-900 transition-colors focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/30 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
              >
                {sortedCountries.map((code) => (
                  <option key={code} value={code}>
                    {COUNTRY_LABELS[code] ?? code}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              aria-label="Set up payouts with Stripe"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Set up payouts
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {state === 'in_progress' && (
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              You started onboarding but Stripe still needs a few details before we
              can route payouts to you. Pick up where you left off below.
            </p>

            {requirements.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                  Still required by Stripe
                </p>
                <ul className="mt-2 space-y-1.5">
                  {requirements.map((req) => (
                    <li
                      key={req}
                      className="flex items-start gap-2 text-sm text-ink-700"
                    >
                      <AlertCircle
                        className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                        aria-hidden="true"
                      />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              aria-label="Continue setup with Stripe"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continue setup
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {state === 'complete' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 px-3 py-3">
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-success"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-ink-900">
                  Payouts are active for this organisation.
                </p>
                <p className="mt-0.5 text-xs text-ink-600">
                  You can publish paid events. Your first payout starts the Tier 2
                  review automatically.
                </p>
              </div>
            </div>

            <ul className="space-y-1.5">
              <CapabilityRow label="Accept ticket payments" enabled={chargesEnabled} />
              <CapabilityRow label="Receive payouts" enabled={payoutsEnabled} />
            </ul>

            <button
              type="button"
              aria-label="Refresh status"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/40 focus-visible:ring-offset-2"
            >
              Refresh status
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function StatusPill({ state }: { state: ConnectOnboardingState }) {
  const styles: Record<ConnectOnboardingState, string> = {
    not_started: 'border-ink-200 bg-ink-50 text-ink-700',
    in_progress: 'border-warning bg-warning text-ink-900',
    complete: 'border-success bg-success text-ink-900',
  }
  const label: Record<ConnectOnboardingState, string> = {
    not_started: 'Not started',
    in_progress: 'In progress',
    complete: 'Active',
  }
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
        styles[state],
      ].join(' ')}
      aria-label={`Payouts status: ${label[state]}`}
    >
      {label[state]}
    </span>
  )
}

function CapabilityRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        aria-hidden="true"
        className={[
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
          enabled
            ? 'border-success bg-success text-white'
            : 'border-ink-200 bg-white text-ink-400',
        ].join(' ')}
      >
        {enabled && <Check className="h-3 w-3" aria-hidden="true" />}
      </span>
      <span className={enabled ? 'text-ink-700' : 'text-ink-500'}>{label}</span>
      <span className="ml-auto text-xs font-medium text-ink-500" aria-hidden="true">
        {enabled ? 'Enabled' : 'Pending'}
      </span>
    </li>
  )
}

function BulletItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      <span>{text}</span>
    </li>
  )
}
