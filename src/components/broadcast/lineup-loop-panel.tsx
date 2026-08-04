'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CopyLinkButton } from '@/components/launch-kit/copy-link-button'
import {
  addArtistToLineupAction,
  removeArtistFromLineupAction,
  searchArtistsAction,
  type ArtistSearchHit,
} from '@/app/actions/lineup'
import type { LineupAct } from '@/lib/broadcast/lineup-panel'

/**
 * The lineup loop trigger.
 *
 * The artist layer was built but nothing asked the organiser to use it, so the
 * loop never started. This is the prompt: it explains the benefit in the
 * organiser's own terms (each act sells to their own following, so the room
 * fills faster), makes tagging one step (search the directory or add a new act
 * by name), and then shows the payoff - every act's tracked link ready to send,
 * their claim link, and the tickets their sharing actually sold.
 */

interface Props {
  eventId: string
  acts: LineupAct[]
  totals: { clicks: number; orders: number; tickets: number }
  /** 'kit' = Launch Kit (premium dialect). 'dashboard' = event overview card. */
  variant?: 'kit' | 'dashboard'
}

export function LineupLoopPanel({ eventId, acts, totals, variant = 'kit' }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ArtistSearchHit[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const boxRef = useRef<HTMLDivElement>(null)

  const trimmed = query.trim()

  // Debounced directory search so tagging is one step: pick a known act, or
  // add a new one by the name already typed.
  useEffect(() => {
    // Every setState happens inside the timeout callback, never synchronously
    // in the effect body (react-hooks/set-state-in-effect).
    const t = setTimeout(() => {
      if (trimmed.length < 2) {
        setHits([])
        return
      }
      searchArtistsAction(trimmed)
        .then(r => setHits(r.ok ? r.artists : []))
        .catch(() => setHits([]))
    }, 250)
    return () => clearTimeout(t)
  }, [trimmed])

  function tag(name: string, artistId?: string) {
    if (!name.trim()) return
    setMessage(null)
    startTransition(async () => {
      const res = await addArtistToLineupAction({ eventId, name: name.trim(), artistId })
      if (!res.ok) {
        setMessage(res.error ?? 'Could not tag that act.')
        return
      }
      setQuery('')
      setHits([])
      setMessage(`${name.trim()} is on the lineup.`)
      router.refresh()
    })
  }

  function untag(artistId: string, name: string) {
    startTransition(async () => {
      const res = await removeArtistFromLineupAction({ eventId, artistId })
      if (!res.ok) {
        setMessage(res.error ?? 'Could not remove that act.')
        return
      }
      setMessage(`${name} removed from the lineup.`)
      router.refresh()
    })
  }

  const alreadyTagged = new Set(acts.map(a => a.artistId))
  const exactHit = hits.some(h => h.name.toLowerCase() === trimmed.toLowerCase())

  const shell =
    variant === 'kit'
      ? 'rounded-2xl border border-gold-500/30 bg-white shadow-[var(--shadow-card)]'
      : 'rounded-xl border border-ink-200 bg-white'

  return (
    <div className={shell}>
      <div className="border-b border-ink-100 px-6 py-5">
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-700">
          Your lineup
        </p>
        <h2 className="mt-1 font-display text-xl font-bold text-ink-900">
          {acts.length === 0 ? 'Tag the acts playing your event' : 'Who is filling your room'}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          {acts.length === 0
            ? 'Every act you tag gets their own tracked share link and their own page on your event. They sell to their following, you see exactly how many tickets each one brought, and the room fills faster.'
            : 'Send each act their link. Every sale it brings is credited to them below, so you know who actually fills your room.'}
        </p>
      </div>

      <div className="px-6 py-5">
        {/* One-step tagger: search the directory, or add the typed name. */}
        <div ref={boxRef} className="relative">
          <label htmlFor={`lineup-search-${eventId}`} className="block text-xs font-medium text-ink-600">
            Add an act
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              id={`lineup-search-${eventId}`}
              name="lineup-search"
              type="text"
              autoComplete="off"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  tag(trimmed)
                }
              }}
              placeholder="Search performers, or type a new name"
              disabled={isPending}
              className="h-11 flex-1 rounded-lg border border-ink-200 px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => tag(trimmed)}
              disabled={isPending || trimmed.length === 0}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-ink-900 transition-all hover:-translate-y-0.5 hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {isPending ? 'Adding...' : 'Add to lineup'}
            </button>
          </div>

          {trimmed.length >= 2 && (hits.length > 0 || !exactHit) && (
            <ul className="mt-2 overflow-hidden rounded-lg border border-ink-200 bg-white">
              {hits.map(h => (
                <li key={h.id}>
                  <button
                    type="button"
                    disabled={isPending || alreadyTagged.has(h.id)}
                    onClick={() => tag(h.name, h.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-ink-900 hover:bg-ink-50 disabled:opacity-50"
                  >
                    <span className="truncate">{h.name}</span>
                    <span className="shrink-0 text-xs text-ink-500">
                      {alreadyTagged.has(h.id) ? 'Already on lineup' : h.claimed ? 'Claimed profile' : 'Known act'}
                    </span>
                  </button>
                </li>
              ))}
              {!exactHit && (
                <li className="border-t border-ink-100 first:border-0">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => tag(trimmed)}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gold-700 hover:bg-ink-50 disabled:opacity-50"
                  >
                    Add &ldquo;{trimmed}&rdquo; as a new act
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>

        {message && <p className="mt-3 text-sm text-ink-600">{message}</p>}

        {acts.length === 0 ? (
          <p className="mt-4 text-xs text-ink-500">
            Tag as many acts as you like. Each one gets a link the moment you add them.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-ink-100">
            {acts.map(act => (
              <li key={act.artistId} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/artists/${act.artistSlug}`}
                      className="font-display text-base font-bold text-ink-900 hover:text-gold-700"
                    >
                      {act.artistName}
                    </Link>
                    <span className="ml-2 text-xs text-ink-500">
                      {act.claimed ? 'Profile claimed' : 'Not claimed yet'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => untag(act.artistId, act.artistName)}
                    disabled={isPending}
                    className="text-xs text-ink-500 underline hover:text-ink-900 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>

                {/* Their sales, credited to them. */}
                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-600">
                  <div className="flex gap-1">
                    <dt>Clicks</dt>
                    <dd className="font-semibold text-ink-900">{act.clicks}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Orders</dt>
                    <dd className="font-semibold text-ink-900">{act.orders}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Tickets</dt>
                    <dd className="font-semibold text-[var(--brand-accent-strong)]">{act.tickets}</dd>
                  </div>
                </dl>

                {/* One-tap copy: the link they share, and the link that gives
                    them their profile. break-all so a long URL never overflows. */}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {act.shareUrl && (
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                        Their share link
                      </span>
                      <CopyLinkButton url={act.shareUrl} label="Copy share link" />
                    </div>
                  )}
                  {act.claimUrl && (
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                        Their claim link
                      </span>
                      <CopyLinkButton url={act.claimUrl} label="Copy claim link" />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {acts.length > 0 && totals.tickets > 0 && (
          <p className="mt-4 border-t border-ink-100 pt-4 text-sm text-ink-600">
            Your lineup has brought{' '}
            <span className="font-bold text-[var(--brand-accent-strong)]">{totals.tickets}</span>{' '}
            {totals.tickets === 1 ? 'ticket' : 'tickets'} across {totals.orders}{' '}
            {totals.orders === 1 ? 'order' : 'orders'}.
          </p>
        )}
      </div>
    </div>
  )
}
