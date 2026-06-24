'use client'

import {
  organiserMarketingConsentWording,
  PLATFORM_UPDATES_CONSENT_WORDING,
} from '@/lib/consent/wording'

interface MarketingConsentProps {
  organiserName: string
  organiserConsent: boolean
  platformConsent: boolean
  onOrganiserChange: (value: boolean) => void
  onPlatformChange: (value: boolean) => void
  /** Hide the platform-updates box where it is not wanted (kept on by default). */
  showPlatform?: boolean
}

/**
 * Marketing opt-in at checkout (Australian Spam Act 2003 / ACMA).
 *
 * Two SEPARATE, INDEPENDENT, UNCHECKED opt-ins, never bundled with each other or
 * with any terms acceptance. The organiser box names the specific organiser; the
 * platform box is a distinct EventLinqs opt-in. Both are optional: the purchase
 * succeeds with neither ticked. Inherits the checkout card tokens.
 */
export function MarketingConsent({
  organiserName,
  organiserConsent,
  platformConsent,
  onOrganiserChange,
  onPlatformChange,
  showPlatform = true,
}: MarketingConsentProps) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      <h3 className="text-base font-semibold text-ink-900">Stay in the loop</h3>
      <p className="mt-1 text-xs text-ink-400">
        Optional. Your tickets and receipt arrive either way.
      </p>
      <div className="mt-4 space-y-3">
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-1">
          <input
            type="checkbox"
            checked={organiserConsent}
            onChange={(e) => onOrganiserChange(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 text-gold-500 focus:ring-2 focus:ring-gold-500"
          />
          <span className="text-sm text-ink-700">
            {organiserMarketingConsentWording(organiserName)}
          </span>
        </label>

        {showPlatform && (
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-1">
            <input
              type="checkbox"
              checked={platformConsent}
              onChange={(e) => onPlatformChange(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 text-gold-500 focus:ring-2 focus:ring-gold-500"
            />
            <span className="text-sm text-ink-700">{PLATFORM_UPDATES_CONSENT_WORDING}</span>
          </label>
        )}
      </div>
    </div>
  )
}
