'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateShowcaseAction } from '@/app/actions/showcase'
import {
  PERFORMANCE_TYPES,
  PERFORMANCE_TYPE_LABELS,
  type PerformanceType,
} from '@/lib/marketplace/gigs'

const inputClass =
  'h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20'
const labelClass = 'block text-sm font-semibold text-ink-900'

export type ShowcaseEditorInitial = {
  bio: string
  performanceTypes: PerformanceType[]
  genres: string
  citySlug: string
  availableForBooking: boolean
  payExpectation: string
  embedUrls: string[]
  drawConsent: boolean
  mentorOpen: boolean
}

/**
 * The performer's showcase editor: types, city base, availability, pay
 * expectation, up to six allowlisted video links, the draw-data consent
 * toggle, and the mentor flag. Every video URL is validated server-side
 * against the platform allowlist; a rejected link names itself.
 */
export function ShowcaseEditor({
  initial,
  cities,
}: {
  initial: ShowcaseEditorInitial
  cities: { slug: string; name: string }[]
}) {
  const router = useRouter()
  const [bio, setBio] = useState(initial.bio)
  const [types, setTypes] = useState<PerformanceType[]>(initial.performanceTypes)
  const [genres, setGenres] = useState(initial.genres)
  const [citySlug, setCitySlug] = useState(initial.citySlug)
  const [available, setAvailable] = useState(initial.availableForBooking)
  const [payExpectation, setPayExpectation] = useState(initial.payExpectation)
  const [embeds, setEmbeds] = useState(initial.embedUrls.join('\n'))
  const [drawConsent, setDrawConsent] = useState(initial.drawConsent)
  const [mentorOpen, setMentorOpen] = useState(initial.mentorOpen)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function toggleType(type: PerformanceType) {
    setTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : prev.length < 4 ? [...prev, type] : prev,
    )
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    startTransition(async () => {
      const res = await updateShowcaseAction({
        bio,
        performanceTypes: types,
        genres: genres
          .split(',')
          .map((g) => g.trim())
          .filter((g) => g.length >= 2)
          .slice(0, 8),
        citySlug: citySlug || null,
        availableForBooking: available,
        payExpectation,
        embedUrls: embeds
          .split(/\r?\n/)
          .map((u) => u.trim())
          .filter(Boolean),
        drawConsent,
        mentorOpen,
      })
      if (res.ok) {
        setMessage({ kind: 'ok', text: 'Profile saved.' })
        router.refresh()
      } else {
        setMessage({ kind: 'err', text: res.error ?? 'Could not save.' })
      }
    })
  }

  const checkboxRow = 'flex items-start gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3'

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-ink-200 bg-white p-6">
      <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-900">Your showcase</h2>

      <div>
        <label htmlFor="sc-bio" className={labelClass}>Bio</label>
        <textarea
          id="sc-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Who you are on stage. Two or three sentences."
          className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
        />
      </div>

      <fieldset>
        <legend className={labelClass}>What you do (up to 4)</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {PERFORMANCE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={types.includes(t)}
              onClick={() => toggleType(t)}
              className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors ${
                types.includes(t)
                  ? 'border-gold-800 bg-gold-100 text-gold-800'
                  : 'border-ink-200 bg-white text-ink-700 hover:border-gold-800'
              }`}
            >
              {PERFORMANCE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sc-genres" className={labelClass}>Genres (comma separated)</label>
          <input
            id="sc-genres"
            value={genres}
            onChange={(e) => setGenres(e.target.value)}
            placeholder="Indie, soul, crowd work"
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <div>
          <label htmlFor="sc-city" className={labelClass}>Home city</label>
          <select id="sc-city" value={citySlug} onChange={(e) => setCitySlug(e.target.value)} className={`mt-1 ${inputClass}`}>
            <option value="">Not set</option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="sc-pay" className={labelClass}>Pay expectation (optional, shows on your profile)</label>
        <input
          id="sc-pay"
          value={payExpectation}
          onChange={(e) => setPayExpectation(e.target.value)}
          maxLength={140}
          placeholder="From $200 a set, negotiable for the right room"
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor="sc-embeds" className={labelClass}>Showcase videos (up to 6 links, one per line)</label>
        <textarea
          id="sc-embeds"
          value={embeds}
          onChange={(e) => setEmbeds(e.target.value)}
          rows={4}
          placeholder={'https://youtube.com/watch?v=...\nhttps://instagram.com/reel/...'}
          className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
        />
        <p className="mt-1 text-xs text-ink-600">
          YouTube, Vimeo, Instagram, or TikTok links. Your videos stay on those platforms; we
          embed them.
        </p>
      </div>

      <div className="space-y-2">
        <label className={checkboxRow}>
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-ink-300 text-gold-600 focus:ring-gold-400"
          />
          <span className="text-sm text-ink-900">
            <span className="font-semibold">Open to bookings.</span>{' '}
            <span className="text-ink-600">
              You appear as bookable in the directory and hear about new gigs in your city and
              type. Switch off any time to stop both.
            </span>
          </span>
        </label>
        <label className={checkboxRow}>
          <input
            type="checkbox"
            checked={drawConsent}
            onChange={(e) => setDrawConsent(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-ink-300 text-gold-600 focus:ring-gold-400"
          />
          <span className="text-sm text-ink-900">
            <span className="font-semibold">Show my draw numbers publicly.</span>{' '}
            <span className="text-ink-600">
              Your attributed ticket sales appear on your profile and in the directory. Your
              numbers always travel with your gig applications either way; this controls the
              public page only.
            </span>
          </span>
        </label>
        <label className={checkboxRow}>
          <input
            type="checkbox"
            checked={mentorOpen}
            onChange={(e) => setMentorOpen(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-ink-300 text-gold-600 focus:ring-gold-400"
          />
          <span className="text-sm text-ink-900">
            <span className="font-semibold">Open to mentoring.</span>{' '}
            <span className="text-ink-600">
              Newer performers can send you a structured request (subject and note); you accept
              or decline. Never an open inbox.
            </span>
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-6 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Saving' : 'Save showcase'}
      </button>
      {message && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${message.kind === 'ok' ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
          {message.text}
        </p>
      )}
    </form>
  )
}
