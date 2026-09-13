'use client'

import { organiserMarketingConsentWording } from '@/lib/consent/wording'

/**
 * The wording as it is stored, passed in from the server.
 *
 * Close-out GA1: the label and the body are NEVER typed into this page. They
 * are read from public.consent_wordings, which is immutable and versioned, so
 * the sentence the buyer reads is the sentence recorded as evidence and a past
 * consent can always be produced exactly as it was given. A surface that cannot
 * read the record asks nothing at all rather than asking under wording it
 * cannot prove.
 */
export interface PlatformConsentWording {
  label: string
  body: string
  version: string
}

interface MarketingConsentProps {
  organiserName: string
  organiserConsent: boolean
  platformConsent: boolean
  onOrganiserChange: (value: boolean) => void
  onPlatformChange: (value: boolean) => void
  /** Null hides the platform question entirely: no record, no question. */
  platformWording: PlatformConsentWording | null
}

/**
 * Marketing opt-in at checkout (Australian Privacy Principle 7, Spam Act 2003).
 *
 * TWO SEPARATE, INDEPENDENT, UNTICKED opt-ins, never bundled with each other and
 * never with the terms. The organiser box names the specific organiser and is a
 * consent to that organiser. The platform box is EventLinqs' own, and its words
 * name who sends, what about, on which channels, who the service provider is,
 * how to stop it and how to ask where the details came from, because a vague
 * question does not authorise marketing another organiser's event.
 *
 * Both are optional: the purchase succeeds with neither ticked, and the panel
 * says so before it asks anything.
 */
export function MarketingConsent({
  organiserName,
  organiserConsent,
  platformConsent,
  onOrganiserChange,
  onPlatformChange,
  platformWording,
}: MarketingConsentProps) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6">
      <h3 className="text-base font-semibold text-ink-900">Stay in the loop</h3>
      <p className="mt-1 text-xs text-ink-400">
        Optional. Your tickets and receipt arrive either way.
      </p>
      <div className="mt-4 space-y-3">
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-1">
          <input
            id="organiser-marketing-consent"
            name="organiser-marketing-consent"
            type="checkbox"
            checked={organiserConsent}
            onChange={(e) => onOrganiserChange(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 text-gold-500 focus:ring-2 focus:ring-gold-500"
          />
          <span className="text-sm text-ink-700">
            {organiserMarketingConsentWording(organiserName)}
          </span>
        </label>

        {platformWording && (
          <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-4">
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
              <input
                id="platform-marketing-consent"
                name="platform-marketing-consent"
                type="checkbox"
                checked={platformConsent}
                onChange={(e) => onPlatformChange(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 text-gold-500 focus:ring-2 focus:ring-gold-500"
              />
              <span className="text-sm font-medium text-ink-900">{platformWording.label}</span>
            </label>
            <p
              className="mt-2 text-xs leading-relaxed text-ink-500"
              data-consent-wording-version={platformWording.version}
            >
              {platformWording.body}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
