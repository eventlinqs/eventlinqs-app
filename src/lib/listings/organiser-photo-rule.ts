/**
 * AN ORGANISER'S EVENT NEVER GOES UP WITHOUT THE PHOTO THEY SENT (Lawal's law of 8 November 2026, 13:32 (1) and (4):
 * "an event whose organiser supplied a photo NEVER goes up without that photo. No text only listing of an organiser's
 * event, ever. The organiser's photo is used as they supplied it ... Make it impossible to repeat").
 *
 * The defect it ends: Kyivska Perepichka, A Moment of Sanity and Mr Snotbottom's two sessions were sent in with their
 * organisers' own photos, accepted, and published text only on 8 November, because the import that listed them carried
 * no photo and a ruling had withheld one. Their photos went on through the live photo path at 13:44 the same day.
 *
 * One rule, read by three places: the self-listing run (which takes a night away rather than leave it up without its
 * photo), its hourly backstop for accepted submissions, and scripts/guards/organiser-photo-before-publish.mjs (which
 * reads every accepted or published submission that carries a photo and fails the build where no published event shows
 * it). Pure: no database, no network.
 */

/** Lawal's words, the reason a night is held or a build fails. */
export const ORGANISER_PHOTO_LAW =
  "an organiser's event never goes up without the photo they sent (Lawal's law of 8 November 2026, 13:32)"

/** Where an organiser's own photo is stored once it is on its event, in the event-images bucket. */
export function organiserCoverObject(submissionId: string, extension: string): string {
  return `submissions/${submissionId}/cover.${extension}`
}

/** Whether an event's cover address is this submission's own photo. */
export function isOrganiserCover(coverUrl: string | null | undefined, submissionId: string): boolean {
  return typeof coverUrl === 'string' && coverUrl.includes(`/event-images/${organiserCoverObject(submissionId, '')}`)
}

/** What putting an organiser's photo on its event did: attached, or why not, in words for Lawal and the record. */
export type PhotoAttach = { readonly attached: boolean; readonly words: string }

/** A submission may stay published only when it sent no photo, or its photo is on its event. */
export function mayStayPublished(sub: { readonly photo_path: string | null }, photo: PhotoAttach): boolean {
  return !sub.photo_path || photo.attached
}

/** The hourly backstop gives an accepted submission its photo until the record says it is on. */
export function photoStillOwed(sub: { readonly photo_path: string | null }, checkResult: Record<string, unknown> | null): boolean {
  return Boolean(sub.photo_path) && checkResult?.photo_attached !== true
}
