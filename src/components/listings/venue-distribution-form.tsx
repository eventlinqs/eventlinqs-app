'use client'

import { useActionState } from 'react'
import { setVenueDistributionAction, type VenueDistributionState } from '@/app/actions/venue-distribution'

/**
 * A claimed venue's two answers on where EventLinqs carries its nights (D3 (6)), one form per venue, showing the
 * database's answer in its own words. Classes are the venue media forms' own (venue-media-forms.tsx), so nothing here
 * is new to the design system.
 */

const button = 'inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:opacity-60'

export function VenueDistributionForm({ venue, ourPosts, weeklyRoundup }: { venue: { id: string; name: string }; ourPosts: boolean; weeklyRoundup: boolean }) {
  const [state, action, pending] = useActionState<VenueDistributionState, FormData>(setVenueDistributionAction, null)
  return (
    <form action={action} className="text-left" data-venue-distribution={venue.id}>
      <input type="hidden" name="venueId" value={venue.id} />
      <p className="font-semibold text-ink-900">{venue.name}</p>
      <div className="mt-2 space-y-2">
        <label className="flex min-h-[44px] items-start gap-2 text-sm text-ink-600">
          <input type="checkbox" name="ourPosts" defaultChecked={ourPosts} className="mt-1 h-5 w-5" />
          <span>Feature our nights in EventLinqs&apos; own Instagram and Facebook posts</span>
        </label>
        <label className="flex min-h-[44px] items-start gap-2 text-sm text-ink-600">
          <input type="checkbox" name="weeklyRoundup" defaultChecked={weeklyRoundup} className="mt-1 h-5 w-5" />
          <span>Include our nights in EventLinqs&apos; weekly round-up for our city, by email and on WhatsApp</span>
        </label>
      </div>
      <button type="submit" disabled={pending} className={`${button} mt-3`}>
        {pending ? 'Saving' : 'Save'}
      </button>
      {state ? (
        <p role="status" className="mt-2 text-sm text-ink-600">
          {state.state === 'done' ? 'Saved. We follow this from the next plan and the next round-up.' : state.reason}
        </p>
      ) : null}
    </form>
  )
}
