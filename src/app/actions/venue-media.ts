'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { addVenuePhoto, challengeVenuePhoto, replaceVenuePhoto, venueMediaDeps, withdrawVenuePhoto, type VenuePhotoAnswer } from '@/lib/venues/venue-images'
import { venuePhotoYes } from '@/lib/venues/venue-photo-words'

/**
 * A claimed venue's presses on /dashboard/organisation/media: add a photograph of the venue with its yes, replace one,
 * withdraw one (src/lib/venues/venue-images.ts holds the order and why). Signed in always; the database checks the
 * person is one of the venue's own people, so nothing here trusts an id from the form. The yes is the constant line,
 * never the form's words. Adding and replacing are limited per user (the 'organiser-media' policy: each stores a file);
 * a withdrawal never is.
 */

export type VenueMediaState = VenuePhotoAnswer | null

const TRY_LATER: VenuePhotoAnswer = { state: 'refused', reason: 'You have made several changes in the last hour. Try again later.' }
const WHERE = 'https://www.eventlinqs.com.au/dashboard/organisation/media'
const Id = z.string().uuid()

async function signedIn(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function guarded(run: (userId: string) => Promise<VenuePhotoAnswer>, limit: boolean): Promise<VenueMediaState> {
  const userId = await signedIn()
  if (!userId) return { state: 'refused', reason: 'Sign in to change your venue photographs.' }
  if (limit) {
    const limited = await actionRateLimit('organiser-media', `user:${userId}`)
    if (!limited.ok) return TRY_LATER
  }
  const answer = await run(userId)
  if (answer.state === 'done') revalidatePath('/dashboard/organisation/media')
  return answer
}

function fileOf(formData: FormData): File | null {
  const f = formData.get('file')
  return f instanceof File ? f : null
}

function yesOf(formData: FormData) {
  return venuePhotoYes({ ticked: formData.get('yes') === 'on', authority: formData.get('authority') === 'on' })
}

export async function addVenuePhotoAction(_: VenueMediaState, formData: FormData): Promise<VenueMediaState> {
  const venueId = Id.safeParse(formData.get('venueId'))
  if (!venueId.success) return { state: 'refused', reason: 'Choose your venue.' }
  const yes = yesOf(formData)
  if (yes.state === 'refused') return yes
  const credit = formData.get('credit')
  return guarded(
    (userId) =>
      addVenuePhoto(
        { userId, venueId: venueId.data, file: fileOf(formData), permissionWords: yes.words, sourceUrl: WHERE, credit: typeof credit === 'string' ? credit : null },
        venueMediaDeps(),
      ),
    true,
  )
}

export async function replaceVenuePhotoAction(_: VenueMediaState, formData: FormData): Promise<VenueMediaState> {
  const venueId = Id.safeParse(formData.get('venueId'))
  const imageId = Id.safeParse(formData.get('imageId'))
  if (!venueId.success || !imageId.success) return { state: 'refused', reason: 'That photograph could not be found.' }
  const yes = yesOf(formData)
  if (yes.state === 'refused') return yes
  return guarded(
    (userId) =>
      replaceVenuePhoto({ userId, venueId: venueId.data, imageId: imageId.data, file: fileOf(formData), permissionWords: yes.words, sourceUrl: WHERE }, venueMediaDeps()),
    true,
  )
}

/**
 * A venue's people, or an organiser with nights there, say a photograph is wrong: on the event dashboard. The database
 * decides who may, and the photograph stops showing at once and waits for a person. Limited per user, as one press takes
 * a photograph off every night at that venue.
 */
export async function challengeVenuePhotoAction(_: VenueMediaState, formData: FormData): Promise<VenueMediaState> {
  const imageId = Id.safeParse(formData.get('imageId'))
  if (!imageId.success) return { state: 'refused', reason: 'That photograph could not be found.' }
  const reason = String(formData.get('reason') ?? '').trim()
  if (reason.length > 300) return { state: 'refused', reason: 'Keep it under 300 characters.' }
  const answer = await guarded((userId) => challengeVenuePhoto({ userId, imageId: imageId.data, reason }, venueMediaDeps()), true)
  const eventId = Id.safeParse(formData.get('eventId'))
  if (answer?.state === 'done' && eventId.success) revalidatePath(`/dashboard/events/${eventId.data}`)
  return answer
}

export async function withdrawVenuePhotoAction(_: VenueMediaState, formData: FormData): Promise<VenueMediaState> {
  const imageId = Id.safeParse(formData.get('imageId'))
  if (!imageId.success) return { state: 'refused', reason: 'That photograph could not be found.' }
  return guarded((userId) => withdrawVenuePhoto({ userId, imageId: imageId.data }, venueMediaDeps()), false)
}
