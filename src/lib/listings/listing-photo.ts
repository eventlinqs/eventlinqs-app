/**
 * NO LIBRARY PHOTOGRAPH STANDS FOR A NIGHT (the project manager's 18:38 of 29 October 2026, under Lawal's 19:52
 * directive of 28 October: authorised photographs, else premium typography; contextual photography only for pieces
 * that name no night). It retires the 27 October 08:33 ruling's library shot for every listing night (all 334 public
 * nights on production carried one that evening): a listing night without its host's own photograph now wears the
 * typographic cover (src/lib/listings/occurrence-store.ts attachListingCover), and the city week card is drawn on its
 * own ground. The helpers that picked a library shot for a category or a city are gone, so nothing can write one.
 *
 * What stays: the test for a library photograph, and the line a page shows beside one, for a night still wearing one
 * until its cover is made again (scripts/backfill-generated-covers.mts).
 */

/** A cover from EventLinqs' licensed library (the spine's own folder), not the organiser's or the host's. */
export { isLibraryPhoto } from '@/lib/media/library-photo'

/** The line shown with a library photograph, so it is never read as the venue. */
export const LIBRARY_PHOTO_CREDIT = 'Photo from the EventLinqs library, to give a feel for the night. It is not this venue.'
