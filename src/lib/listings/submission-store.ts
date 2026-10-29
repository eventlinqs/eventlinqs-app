import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { processEventImage } from '@/lib/media/image-pipeline'
import { MAX_IMAGE_BYTES } from '@/lib/media/limits'
import type { SubmissionCity, SubmissionEntry, SubmissionRole, SubmissionRow } from './submission'

/**
 * WHERE A SUBMISSION IS KEPT (H1). The photo is re-encoded by the image pipeline (magic bytes, dimensions, EXIF
 * stripped) and stored in the private listing-submissions bucket under a random name; then the row is written. If
 * the row is refused, the photo is removed, so nothing is left without its permission line. Service role only.
 */

type Admin = ReturnType<typeof createAdminClient>

export const SUBMISSION_BUCKET = 'listing-submissions'

export type Recorded = { readonly state: 'recorded' } | { readonly state: 'refused'; readonly reason: string }

/** True when a file was chosen; an empty file input posts a nameless empty File. */
export function sentPhoto(photo: unknown): photo is File {
  return photo instanceof File && photo.size > 0
}

export async function recordSubmission(admin: Admin, row: SubmissionRow, photo: File | null): Promise<Recorded> {
  if (!sentPhoto(photo)) {
    // No photo is a whole submission: the listing is designed from its details (the checklist's section K, path B).
    const { error } = await admin.from('listing_submissions').insert({ ...row, photo_path: null, photo_owned: false })
    return error ? { state: 'refused', reason: 'Your event could not be sent just now. Try again in a minute.' } : { state: 'recorded' }
  }
  if (photo.size > MAX_IMAGE_BYTES) return { state: 'refused', reason: 'The photo must be under 10MB.' }
  let processed
  try {
    const result = await processEventImage(await photo.arrayBuffer(), { role: 'cover' })
    if (!result.ok) return { state: 'refused', reason: result.error }
    processed = result.image
  } catch {
    return { state: 'refused', reason: 'That photo could not be read. Try a JPEG or PNG.' }
  }

  const path = `${crypto.randomUUID()}.${processed.ext}`
  const { error: storeError } = await admin.storage.from(SUBMISSION_BUCKET).upload(path, processed.buffer, {
    upsert: false,
    contentType: processed.contentType,
  })
  if (storeError) return { state: 'refused', reason: 'Your event could not be sent just now. Try again in a minute.' }

  const { error } = await admin.from('listing_submissions').insert({ ...row, photo_path: path })
  if (error) {
    await admin.storage.from(SUBMISSION_BUCKET).remove([path])
    return { state: 'refused', reason: 'Your event could not be sent just now. Try again in a minute.' }
  }
  return { state: 'recorded' }
}

export interface Submission {
  readonly id: string
  readonly createdAt: string
  readonly name: string
  readonly email: string
  readonly role: SubmissionRole
  readonly title: string
  readonly startsAt: string
  readonly endsAt: string | null
  readonly venueName: string
  readonly venueAddress: string
  readonly city: SubmissionCity
  readonly bookingUrl: string
  readonly entry: SubmissionEntry
  readonly priceFromCents: number | null
  readonly description: string | null
  readonly permissionWords: string
  readonly permissionGivenAt: string
  /** Whether a photo came with it; a submission never needs one. */
  readonly photoSent: boolean
  /** A signed address good for ten minutes, or null when none was sent or it could not be signed. */
  readonly photoUrl: string | null
}

/** What waits for a person, soonest event first. Throws when it cannot be read, so the page says so. */
export async function waitingSubmissions(admin: Admin): Promise<Submission[]> {
  const { data, error } = await admin
    .from('listing_submissions')
    .select('id, created_at, name, email, role, title, starts_at, ends_at, venue_name, venue_address, city_slug, booking_url, entry, price_from_cents, description, permission_words, permission_given_at, photo_path')
    .eq('status', 'waiting')
    .order('starts_at', { ascending: true })
    .limit(200)
  if (error) throw new Error(`listing submissions could not be read: ${error.message}`)
  const rows = data ?? []
  const signed = new Map<string, string>()
  const paths = rows.map((r) => r.photo_path as string | null).filter((p): p is string => p !== null)
  if (paths.length > 0) {
    const { data: urls } = await admin.storage.from(SUBMISSION_BUCKET).createSignedUrls(paths, 600)
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl)
  }
  return rows.map((r) => ({
    id: r.id as string,
    createdAt: r.created_at as string,
    name: r.name as string,
    email: r.email as string,
    role: r.role as SubmissionRole,
    title: r.title as string,
    startsAt: r.starts_at as string,
    endsAt: (r.ends_at as string | null) ?? null,
    venueName: r.venue_name as string,
    venueAddress: r.venue_address as string,
    city: r.city_slug as SubmissionCity,
    bookingUrl: r.booking_url as string,
    entry: r.entry as SubmissionEntry,
    priceFromCents: (r.price_from_cents as number | null) ?? null,
    description: (r.description as string | null) ?? null,
    permissionWords: r.permission_words as string,
    permissionGivenAt: r.permission_given_at as string,
    photoSent: r.photo_path !== null,
    photoUrl: r.photo_path === null ? null : (signed.get(r.photo_path as string) ?? null),
  }))
}

/** One review, written only while the submission still waits, so two people pressing at once review it once. */
export async function reviewSubmission(
  admin: Admin,
  id: string,
  reviewer: string,
  outcome: { readonly status: 'accepted' } | { readonly status: 'refused'; readonly because: string },
): Promise<'done' | 'gone' | 'error'> {
  const { data, error } = await admin
    .from('listing_submissions')
    .update({
      status: outcome.status,
      reviewed_by: reviewer,
      reviewed_at: new Date().toISOString(),
      refused_because: outcome.status === 'refused' ? outcome.because : null,
    })
    .eq('id', id)
    .eq('status', 'waiting')
    .select('id')
  if (error) return 'error'
  return (data ?? []).length === 1 ? 'done' : 'gone'
}
