import { isOwnPhoto } from '@/lib/images/event-media'

/**
 * THE RAILS LEAD WITH PHOTOGRAPHS (the CONTROLLER's 31 October 2026 13:45; Lawal at 11:11: "I shouldn't be seeing
 * EventLinqs on there"): within one rail, the nights holding a real photo of their own (the organiser's, or the venue
 * photo dealt to that night, already on the row as its cover) come first in their own order, then the rest in theirs.
 * A stable partition: nothing is dropped and nothing else is reordered (no-display-time-exclusion).
 */
export function photoFirst<E extends { readonly cover_image_url?: string | null }>(events: readonly E[]): E[] {
  const withPhoto: E[] = []
  const rest: E[] = []
  for (const e of events) (isOwnPhoto(e.cover_image_url ?? null) ? withPhoto : rest).push(e)
  return [...withPhoto, ...rest]
}
