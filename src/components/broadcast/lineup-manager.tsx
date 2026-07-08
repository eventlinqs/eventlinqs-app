'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, UserPlus, X } from 'lucide-react'
import {
  addArtistToLineupAction,
  inviteGuestPerformerAction,
  removeArtistFromLineupAction,
} from '@/app/actions/lineup'

export interface LineupEntry {
  artistId: string
  artistSlug: string
  artistName: string
  status: 'confirmed' | 'invited'
  inviteUrl: string | null
  shareUrl: string | null
}

/**
 * The organiser lineup manager (SPEC 4.2): tag performers by name, invite
 * an untagged guest performer by link, remove tags, and copy each tagged
 * artist's tracked share link (SPEC 4.3) so the artist can be handed their
 * one-tap link the moment they are tagged.
 */
export function LineupManager({ eventId, entries }: { eventId: string; entries: LineupEntry[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'tag' | 'invite'>('tag')
  const [message, setMessage] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setMessage(null)
    startTransition(async () => {
      const res =
        mode === 'tag'
          ? await addArtistToLineupAction({ eventId, name: trimmed })
          : await inviteGuestPerformerAction({ eventId, name: trimmed })
      if (!res.ok) {
        setMessage(res.error ?? 'Could not save.')
        return
      }
      setName('')
      setMessage(mode === 'tag' ? 'Performer tagged.' : 'Invite created. Copy the invite link below and send it to them.')
      router.refresh()
    })
  }

  const remove = (artistId: string) => {
    setMessage(null)
    startTransition(async () => {
      const res = await removeArtistFromLineupAction({ eventId, artistId })
      if (!res.ok) setMessage(res.error ?? 'Could not remove.')
      router.refresh()
    })
  }

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1800)
    } catch {
      // The URL is visible in the row; manual selection still works.
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="text-base font-semibold text-ink-900">Add a performer</h2>
        <p className="mt-1 text-sm text-ink-600">
          Tag them directly, or create an invite link a guest performer can claim to manage
          their own profile and see their numbers.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Performer name"
            aria-label="Performer name"
            className="h-11 min-w-[220px] flex-1 rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
          />
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value === 'invite' ? 'invite' : 'tag')}
            aria-label="How to add them"
            className="h-11 rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
          >
            <option value="tag">Tag now</option>
            <option value="invite">Invite by link</option>
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !name.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            {mode === 'tag' ? 'Tag performer' : 'Create invite'}
          </button>
        </div>
        <p className="mt-3 min-h-[20px] text-xs text-ink-600" role="status">
          {isPending ? 'Saving' : message}
        </p>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white">
        <div className="border-b border-ink-200 px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-900">Lineup</h2>
        </div>
        {entries.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-600">
            No performers tagged yet. Tag your lineup and every artist gets their own tracked
            share link, so you can both see exactly who fills the room.
          </p>
        ) : (
          <ul className="divide-y divide-ink-200/60">
            {entries.map((entry) => (
              <li key={entry.artistId} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">{entry.artistName}</p>
                    <p className="text-xs text-ink-600">
                      {entry.status === 'confirmed' ? 'Confirmed' : 'Invited, awaiting claim'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {entry.shareUrl && (
                      <button
                        type="button"
                        onClick={() => copy(`share-${entry.artistId}`, entry.shareUrl as string)}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100"
                      >
                        {copiedKey === `share-${entry.artistId}` ? (
                          <Check className="h-4 w-4" aria-hidden />
                        ) : (
                          <Copy className="h-4 w-4" aria-hidden />
                        )}
                        {copiedKey === `share-${entry.artistId}` ? 'Copied' : 'Artist share link'}
                      </button>
                    )}
                    {entry.inviteUrl && (
                      <button
                        type="button"
                        onClick={() => copy(`invite-${entry.artistId}`, entry.inviteUrl as string)}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100"
                      >
                        {copiedKey === `invite-${entry.artistId}` ? (
                          <Check className="h-4 w-4" aria-hidden />
                        ) : (
                          <Copy className="h-4 w-4" aria-hidden />
                        )}
                        {copiedKey === `invite-${entry.artistId}` ? 'Copied' : 'Invite link'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(entry.artistId)}
                      className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
                      aria-label={`Remove ${entry.artistName} from the lineup`}
                    >
                      <X className="h-4 w-4" aria-hidden />
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
