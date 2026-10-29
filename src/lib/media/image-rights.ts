/**
 * EVERY IMAGE A PUBLIC NIGHT SHOWS, WITH WHERE IT CAME FROM AND ITS RIGHTS (Lawal's master mandate of 29 October 2026,
 * section 5: "Implement a media-provenance and rights-status field for each image"). The rows are written only by the
 * database (public.event_image_rights, derived on every write to a cover, a gallery or the asset register:
 * supabase/migrations/20261029221501_event_image_rights.sql); this module reads them for the founder's screen.
 *
 * Every count is an exact count, never a sum over rows a response could cap, and a failed read throws rather than
 * rendering a zero that reads like a fact.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const IMAGE_RIGHTS_STATES = ['organiser_authorised', 'separately_licensed', 'original_design', 'platform_library', 'unrecorded'] as const
export type ImageRightsState = (typeof IMAGE_RIGHTS_STATES)[number]
export type ImageRightsCounts = Record<ImageRightsState, number>

/** A library photograph is not of the night it sits on, and an unrecorded image has no rights on record. */
export function needsAttention(state: ImageRightsState): boolean {
  return state === 'platform_library' || state === 'unrecorded'
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function imageRightsLine(counts: ImageRightsCounts): string {
  const total = IMAGE_RIGHTS_STATES.reduce((t, s) => t + counts[s], 0)
  if (total === 0) return 'No image on a public night is on record yet.'
  const fine = [
    counts.original_design > 0 ? `${counts.original_design} our typographic cover${counts.original_design === 1 ? '' : 's'}` : null,
    counts.organiser_authorised > 0 ? `${counts.organiser_authorised} the organiser's own` : null,
    counts.separately_licensed > 0 ? `${counts.separately_licensed} separately licensed` : null,
  ].filter((s): s is string => s !== null)
  const attention = [
    counts.unrecorded > 0 ? `${counts.unrecorded} with rights not on record` : null,
    counts.platform_library > 0 ? plural(counts.platform_library, 'library photograph', 'library photographs') : null,
  ].filter((s): s is string => s !== null)
  const images = plural(total, 'image', 'images')
  if (attention.length === 0) return `${images} on public nights, none needing attention: ${fine.join(', ')}.`
  return `${images} on public nights: ${attention.join(' and ')} need attention${fine.length ? `; ${fine.join(', ')}` : ''}.`
}

export type ImageRightsException = {
  readonly slug: string
  readonly title: string
  readonly role: 'cover' | 'gallery'
  readonly state: ImageRightsState
  readonly provenance: string
}

export type ImageRightsReport = {
  readonly counts: ImageRightsCounts
  readonly exceptions: readonly ImageRightsException[]
  /** Every exception on a public night, of which `exceptions` shows the first, oldest night first. */
  readonly exceptionsTotal: number
}

const SHOWN = 50

/** The founder's reading of every image on a published, public night. */
export async function readImageRights(db: SupabaseClient): Promise<ImageRightsReport> {
  const onPublicNights = () =>
    db
      .from('event_image_rights')
      .select('event_id, events!inner(status, visibility)', { count: 'exact', head: true })
      .eq('events.status', 'published')
      .eq('events.visibility', 'public')

  const counted = await Promise.all(
    IMAGE_RIGHTS_STATES.map(async (state) => {
      const { count, error } = await onPublicNights().eq('rights_state', state)
      if (error) throw new Error(`the image rights could not be counted (${state}): ${error.message}`)
      if (count === null) throw new Error(`the image rights count for ${state} came back empty`)
      return [state, count] as const
    }),
  )
  const counts = Object.fromEntries(counted) as ImageRightsCounts

  const { data, error, count } = await db
    .from('event_image_rights')
    .select('image_role, rights_state, provenance, image_url, events!inner(slug, title, status, visibility, start_date)', { count: 'exact' })
    .eq('events.status', 'published')
    .eq('events.visibility', 'public')
    .in('rights_state', IMAGE_RIGHTS_STATES.filter(needsAttention))
    .order('start_date', { referencedTable: 'events', ascending: true })
    .order('event_id', { ascending: true })
    .order('image_role', { ascending: true })
    .order('image_url', { ascending: true })
    .range(0, SHOWN - 1)
  if (error) throw new Error(`the images needing attention could not be read: ${error.message}`)
  if (count === null) throw new Error('the count of images needing attention came back empty')

  const exceptions = (data ?? []).map((r) => {
    const night = r.events as unknown as { slug: string; title: string }
    return { slug: night.slug, title: night.title, role: r.image_role as 'cover' | 'gallery', state: r.rights_state as ImageRightsState, provenance: r.provenance as string }
  })
  return { counts, exceptions, exceptionsTotal: count }
}
