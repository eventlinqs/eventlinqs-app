'use client'

import { useActionState } from 'react'
import { addVenuePhotoAction, challengeVenuePhotoAction, replaceVenuePhotoAction, withdrawVenuePhotoAction, type VenueMediaState } from '@/app/actions/venue-media'
import { VENUE_PHOTO_YES_WORDS } from '@/lib/venues/venue-photo-words'

/**
 * A claimed venue's own photograph forms on /dashboard/organisation/media, each showing the database's answer in its
 * own words. Classes are the organiser media forms' own (src/components/listings/organiser-media-forms.tsx), so nothing
 * here is new to the design system.
 */

const input = 'mt-1 h-11 w-full rounded-lg border border-ink-200 px-3 text-sm text-ink-900'
const file = 'mt-1 block w-full text-sm text-ink-600 file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-ink-100 file:px-4 file:text-sm file:font-semibold file:text-ink-900'
const button = 'inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:opacity-60'
const quiet = 'inline-flex h-11 items-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100 disabled:opacity-60'

function Answer({ state, done }: { state: VenueMediaState; done: string }) {
  if (!state) return null
  return (
    <p role="status" className="mt-2 text-sm text-ink-600">
      {state.state === 'done' ? done : state.reason}
    </p>
  )
}

/** The yes, ticked, with the person's word they can give it; the words are the constant's, shown as they are kept. */
function YesBoxes() {
  return (
    <div className="mt-4 space-y-2">
      <label className="flex min-h-[44px] items-start gap-2 text-sm text-ink-600">
        <input type="checkbox" name="yes" required className="mt-1 h-5 w-5" />
        <span>&ldquo;{VENUE_PHOTO_YES_WORDS}&rdquo;</span>
      </label>
      <label className="flex min-h-[44px] items-start gap-2 text-sm text-ink-600">
        <input type="checkbox" name="authority" required className="mt-1 h-5 w-5" />
        <span>I can give this permission for the venue, and we own these photographs or may share them.</span>
      </label>
    </div>
  )
}

export function AddVenuePhotoForm({ venues }: { venues: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<VenueMediaState, FormData>(addVenuePhotoAction, null)
  return (
    <form action={action} className="text-left">
      {venues.length === 1 ? (
        <input type="hidden" name="venueId" value={venues[0].id} />
      ) : (
        <label className="block text-sm font-medium text-ink-900">
          Venue
          <select name="venueId" required className={input} defaultValue="">
            <option value="" disabled>
              Choose your venue
            </option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="mt-4 block text-sm font-medium text-ink-900">
        A photograph of the venue (JPEG, PNG, WebP, AVIF or HEIC, under 10MB)
        <input type="file" name="file" accept="image/*" required className={file} />
      </label>
      <label className="mt-4 block text-sm font-medium text-ink-900">
        Credit to show (optional)
        <input name="credit" maxLength={200} placeholder="Photo: your name or the photographer's" className={input} />
      </label>
      <YesBoxes />
      <Answer state={state} done="Added. Our team checks each photograph before it shows on your nights." />
      <div className="mt-6">
        <button type="submit" disabled={pending} className={button}>
          Add photograph
        </button>
      </div>
    </form>
  )
}

export function ReplaceVenuePhotoForm({ venueId, imageId }: { venueId: string; imageId: string }) {
  const [state, action, pending] = useActionState<VenueMediaState, FormData>(replaceVenuePhotoAction, null)
  return (
    <form action={action} className="text-left">
      <input type="hidden" name="venueId" value={venueId} />
      <input type="hidden" name="imageId" value={imageId} />
      <label className="block text-sm font-medium text-ink-900">
        Replace with
        <input type="file" name="file" accept="image/*" required className={file} />
      </label>
      <YesBoxes />
      <Answer state={state} done="Sent. The current photograph stays until our team approves the new one." />
      <button type="submit" disabled={pending} className={`mt-3 ${quiet}`}>
        Replace
      </button>
    </form>
  )
}

export function ChallengeVenuePhotoForm({ imageId, eventId }: { imageId: string; eventId: string }) {
  const [state, action, pending] = useActionState<VenueMediaState, FormData>(challengeVenuePhotoAction, null)
  return (
    <form action={action} className="text-left">
      <input type="hidden" name="imageId" value={imageId} />
      <input type="hidden" name="eventId" value={eventId} />
      <label className="block text-sm font-medium text-ink-900">
        What is wrong with this photograph?
        <input name="reason" required minLength={5} maxLength={300} className={input} />
      </label>
      <Answer state={state} done="Thank you. It no longer shows while we look at it." />
      <button type="submit" disabled={pending} className={`mt-3 ${quiet}`}>
        Tell us it is wrong
      </button>
    </form>
  )
}

export function WithdrawVenuePhotoForm({ imageId }: { imageId: string }) {
  const [state, action, pending] = useActionState<VenueMediaState, FormData>(withdrawVenuePhotoAction, null)
  return (
    <form action={action} className="text-left">
      <input type="hidden" name="imageId" value={imageId} />
      <Answer state={state} done="Withdrawn. It no longer shows anywhere on EventLinqs." />
      <button type="submit" disabled={pending} className={`mt-3 ${quiet}`}>
        Withdraw
      </button>
    </form>
  )
}
