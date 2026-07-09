'use client'

import { useRef, useState, useTransition } from 'react'
import { Check, MapPin } from 'lucide-react'
import { CityTileImage } from '@/components/media/CityTileImage'
import {
  MARKETING_OPT_IN_LABEL,
  joinConsentText,
  type WaitlistCity,
  type WaitlistRole,
} from '@/lib/waitlist/city-waitlist'
import { joinCityWaitlist } from './actions'

export interface WaitlistCityWithImage extends WaitlistCity {
  image: string | null
}

/**
 * The waitlist chooser + join form. City tiles are real controls (buttons):
 * tapping one selects that city and moves focus to the form, so every tile a
 * finger lands on does something (interactive-affordance law). Consent is
 * Spam Act clean: the submit button is the express consent to the one
 * city-opening email (wording shown beside it and stored verbatim), and the
 * marketing opt-in is a separate, unticked box.
 */
export function WaitlistClient({ cities }: { cities: WaitlistCityWithImage[] }) {
  const [selected, setSelected] = useState<WaitlistCityWithImage>(cities[0])
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<WaitlistRole>('organiser')
  const [optIn, setOptIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState<{
    cityName: string
    foundingCandidate: boolean
    role: WaitlistRole
  } | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLDivElement>(null)

  const pickCity = (city: WaitlistCityWithImage) => {
    setSelected(city)
    setJoined(null)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await joinCityWaitlist({
        citySlug: selected.slug,
        fullName,
        email,
        role,
        marketingOptIn: optIn,
      })
      if (result.ok) {
        setJoined({
          cityName: result.cityName,
          foundingCandidate: result.foundingCandidate,
          role: result.role,
        })
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-12">
      {/* ── City tiles ──────────────────────────────────────────────────── */}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label="Choose your city">
        {cities.map(city => {
          const isSelected = city.slug === selected.slug
          return (
            <li key={city.slug}>
              <button
                type="button"
                onClick={() => pickCity(city)}
                aria-pressed={isSelected}
                className={`group block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 ${
                  isSelected ? '' : ''
                }`}
              >
                <div
                  className={`relative aspect-[16/11] w-full overflow-hidden rounded-2xl bg-ink-200 transition-all group-hover:-translate-y-0.5 group-hover:shadow-lg ${
                    isSelected
                      ? 'ring-2 ring-[var(--brand-accent)] ring-offset-2 ring-offset-[var(--surface-1)]'
                      : 'ring-1 ring-black/5'
                  }`}
                >
                  {city.image ? (
                    <CityTileImage src={city.image} alt={`${city.name}, ${city.state}`} />
                  ) : (
                    <div
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          'linear-gradient(135deg, rgb(10,22,40) 0%, rgb(20,32,56) 50%, rgb(10,22,40) 100%)',
                      }}
                    />
                  )}
                  {/* Place-name gradient band: the single allowed on-photo overlay. */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(10,22,40,0.0) 40%, rgba(10,22,40,0.55) 72%, rgba(10,22,40,0.92) 100%)',
                    }}
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 sm:p-4">
                    <div>
                      <p className="font-display text-lg font-extrabold leading-tight text-white">
                        {city.name}
                      </p>
                      <p className="text-[11px] font-medium text-white/80">{city.state}</p>
                    </div>
                    {isSelected && (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gold-500 text-ink-900">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                      </span>
                    )}
                  </div>
                  {city.openingFirst && (
                    <span className="absolute left-3 top-3 rounded-full bg-[#0A1628] px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--brand-accent)]">
                      Opening first
                    </span>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {/* ── Join form ───────────────────────────────────────────────────── */}
      <div ref={formRef}>
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-[var(--shadow-card)] sm:p-7">
          {joined ? (
            <div aria-live="polite">
              <p className="inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">
                <Check className="h-4 w-4" aria-hidden />
                You are on the list
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold text-ink-900">
                {joined.cityName} will hear from us first.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">
                {joined.foundingCandidate && joined.role === 'organiser'
                  ? 'You are registered as a founding candidate. Founding Organiser invitations are limited to the first 50 organisers across Geelong and Melbourne: 6 months fee-free, and 3 more months for every organiser you refer. Invitations go out personally.'
                  : joined.role === 'organiser'
                    ? `We will email you the moment ${joined.cityName} opens, with organiser onboarding first in line. Until then the platform already works Australia-wide: you can build your event and get your launch kit today.`
                    : `We will email you the moment ${joined.cityName} opens. One email, no noise, and one click unsubscribes you.`}
              </p>
              <button
                type="button"
                onClick={() => setJoined(null)}
                className="mt-5 inline-flex min-h-[44px] items-center rounded-full border border-ink-200 bg-white px-5 py-2 text-sm font-semibold text-ink-900 transition-colors hover:border-[var(--brand-accent-strong)]"
              >
                Join another city
              </button>
            </div>
          ) : (
            <>
              <p className="inline-flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-accent-strong)]">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {selected.name}, {selected.state}
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold text-ink-900">
                Join the {selected.name} waitlist
              </h2>
              {selected.openingFirst && (
                <p className="mt-2 rounded-lg border border-gold-500/40 bg-gold-500/10 px-3 py-2 text-xs leading-relaxed text-ink-900">
                  <span className="font-semibold">{selected.name} opens first.</span> Organisers
                  who join here are candidates for the invite-only Founding Organiser programme:
                  first 50 across Geelong and Melbourne, 6 months fee-free, plus 3 more months
                  for every organiser you refer.
                </p>
              )}

              <div className="mt-5 space-y-4">
                <div>
                  <label htmlFor="wl-name" className="mb-1.5 block text-sm font-medium text-ink-900">
                    Your name
                  </label>
                  <input
                    id="wl-name"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label htmlFor="wl-email" className="mb-1.5 block text-sm font-medium text-ink-900">
                    Email
                  </label>
                  <input
                    id="wl-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
                    placeholder="you@example.com"
                  />
                </div>

                <fieldset>
                  <legend className="mb-1.5 block text-sm font-medium text-ink-900">
                    Which are you?
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: 'organiser', label: 'I run events' },
                        { value: 'attendee', label: 'I go to events' },
                      ] as const
                    ).map(option => (
                      <label
                        key={option.value}
                        className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                          role === option.value
                            ? 'border-gold-500 bg-gold-500/10 text-ink-900'
                            : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'
                        }`}
                      >
                        <input
                          type="radio"
                          name="wl-role"
                          value={option.value}
                          checked={role === option.value}
                          onChange={() => setRole(option.value)}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {/* OPTIONAL marketing opt-in: unticked by default, always. */}
                <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-600">
                  <input
                    type="checkbox"
                    checked={optIn}
                    onChange={e => setOptIn(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-ink-300 text-gold-500 focus:ring-gold-400"
                  />
                  <span>{MARKETING_OPT_IN_LABEL}</span>
                </label>

                {error && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending}
                  className="w-full rounded-xl bg-gold-500 py-3 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? 'Joining…' : `Join the ${selected.name} waitlist`}
                </button>

                {/* The consent wording, shown at the moment of consent and
                    stored verbatim with the signup. */}
                <p className="text-xs leading-relaxed text-ink-500">
                  {joinConsentText(selected.name)}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
