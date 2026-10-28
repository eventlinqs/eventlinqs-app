'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { actionRateLimit } from '@/lib/rate-limit/action'
import {
  addOrganiserMedia,
  keepOrganiserSeries,
  mediaDeps,
  replaceOrganiserMedia,
  withdrawOrganiserMedia,
  withdrawOrganiserYes,
  type MediaAnswer,
} from '@/lib/listings/organiser-media'

/**
 * The organiser's presses on /dashboard/organisation/media and on the claim page's last steps
 * (src/lib/listings/organiser-media.ts holds the order and why). Signed in always; the database checks that the user runs the night or holds the yes, so nothing here
 * trusts an id from the form. Adding and replacing are limited per user ('organiser-media', fail closed: each stores a
 * file); a withdrawal never is, because taking an image or a permission back is the organiser's right.
 */

export type MediaState = MediaAnswer | null

const TRY_LATER: MediaAnswer = { state: 'refused', reason: 'You have made several changes in the last hour. Try again later.' }

async function signedIn(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function guarded(run: (userId: string) => Promise<MediaAnswer>, limit: boolean): Promise<MediaState> {
  const userId = await signedIn()
  if (!userId) return { state: 'refused', reason: 'Sign in to change your photos and artwork.' }
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

export async function addMedia(_prev: MediaState, formData: FormData): Promise<MediaState> {
  return guarded((userId) =>
    addOrganiserMedia(
      {
        userId,
        eventId: String(formData.get('eventId') ?? ''),
        file: fileOf(formData),
        kind: formData.get('kind') === 'artwork' ? 'artwork' : 'photo',
        attribution: String(formData.get('attribution') ?? '') || null,
        restrictions: String(formData.get('restrictions') ?? '') || null,
      },
      mediaDeps(),
    ),
    true,
  )
}

export async function replaceMedia(_prev: MediaState, formData: FormData): Promise<MediaState> {
  return guarded((userId) => replaceOrganiserMedia({ userId, assetId: String(formData.get('assetId') ?? ''), file: fileOf(formData) }, mediaDeps()), true)
}

export async function withdrawMedia(_prev: MediaState, formData: FormData): Promise<MediaState> {
  return guarded((userId) =>
    withdrawOrganiserMedia({ userId, assetId: String(formData.get('assetId') ?? ''), reason: String(formData.get('reason') ?? '') }, mediaDeps()),
    false,
  )
}

export async function withdrawYes(_prev: MediaState, formData: FormData): Promise<MediaState> {
  return guarded((userId) =>
    withdrawOrganiserYes({ userId, permissionId: String(formData.get('permissionId') ?? ''), reason: String(formData.get('reason') ?? '') }, mediaDeps()),
    false,
  )
}

export async function keepSeries(_prev: MediaState, formData: FormData): Promise<MediaState> {
  return guarded((userId) => keepOrganiserSeries({ userId, seriesId: String(formData.get('seriesId') ?? ''), keep: formData.get('keep') === 'yes' }, mediaDeps()), false)
}
