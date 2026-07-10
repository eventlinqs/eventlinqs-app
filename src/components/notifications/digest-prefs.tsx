'use client'

import { useState, useTransition } from 'react'
import { setDigestConsentAction } from '@/app/actions/consent'
import { DIGEST_CONSENT_WORDING } from '@/lib/consent/wording'

/**
 * The weekly digest preference (SPEC 3.5): express opt-in or instant opt-out
 * plus the digest city. Server state arrives from the page; changes go
 * through the session-authenticated server action, so consent stays audited.
 */
export function DigestPrefs({
  consented,
  citySlug,
  cities,
}: {
  consented: boolean
  citySlug: string | null
  cities: { slug: string; name: string }[]
}) {
  const [optIn, setOptIn] = useState(consented)
  const [city, setCity] = useState(citySlug ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const apply = (nextOptIn: boolean, nextCity: string) => {
    setMessage(null)
    startTransition(async () => {
      const res = await setDigestConsentAction({
        optIn: nextOptIn,
        citySlug: nextCity || null,
      })
      setMessage(res.ok ? 'Saved.' : res.error ?? 'Could not save. Try again.')
    })
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      <h2 className="text-base font-semibold text-ink-900">Weekly local digest</h2>
      <label className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => {
            setOptIn(e.target.checked)
            apply(e.target.checked, city)
          }}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-200 text-gold-500 focus:ring-2 focus:ring-gold-400"
        />
        <span className="text-sm text-ink-700">{DIGEST_CONSENT_WORDING}</span>
      </label>

      {optIn && (
        <label className="mt-4 block max-w-xs">
          <span className="text-xs font-medium text-ink-600">Your digest city</span>
          <select
            value={city}
            onChange={(e) => {
              setCity(e.target.value)
              apply(true, e.target.value)
            }}
            className="mt-1 block h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
          >
            <option value="">Choose a city</option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      <p className="mt-3 min-h-[20px] text-xs text-ink-600" role="status">
        {isPending ? 'Saving' : message}
      </p>
    </div>
  )
}
