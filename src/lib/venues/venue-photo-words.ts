/**
 * THE WORDS OF A VENUE'S OWN PHOTOGRAPHS (the project manager's 16:42 of 30 October 2026: venues add, replace or
 * withdraw photos of their venue, with their yes). The yes is this constant line, never anything a form sends, given
 * with a tick and the person's word that they can give it, as the claim's yes is (src/lib/listings/claim-acceptance.ts).
 * It is kept on each photograph (venue_images.permission_evidence) and only staff approval puts one on a night.
 * Pure, so a client form may show the same words.
 */

export const VENUE_PHOTO_YES_WORDS = 'Yes, EventLinqs may show these photographs of our venue on its listings and posts for nights at our venue.'

export type VenuePhotoYes = { readonly state: 'given'; readonly words: string } | { readonly state: 'refused'; readonly reason: string }

export function venuePhotoYes(input: { ticked: boolean; authority: boolean }): VenuePhotoYes {
  if (!input.ticked) return { state: 'refused', reason: 'Tick the box to say EventLinqs may show these photographs.' }
  if (!input.authority) return { state: 'refused', reason: 'Confirm you can give this permission for the venue.' }
  return { state: 'given', words: VENUE_PHOTO_YES_WORDS }
}

const STATE_WORDS: Record<string, string> = {
  candidate: 'Waiting for our team to check it',
  pending: 'Waiting for our team to check it',
  approved: 'Showing on your nights',
  refused: 'Not used',
  challenged: 'Taken down while we look at a concern',
  withdrawn: 'Withdrawn',
}

/** Where one photograph stands, in plain words. */
export function venuePhotoStateWords(state: string): string {
  return STATE_WORDS[state] ?? 'Waiting for our team to check it'
}
