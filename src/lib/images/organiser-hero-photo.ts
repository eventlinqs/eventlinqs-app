/**
 * EACH ORGANISER PAGE'S OWN PHOTOGRAPH (the controller's ruling of 31 October 2026, 13:18; the photo system's A1: one
 * photo, one subject). The subject of an organiser page is the organiser, and the photos of its own events are its own
 * media, so its page may lead with one of them. Every organiser page drew an initials circle on navy (coverImage null)
 * while some organisers' own events held real photographs.
 *
 * Each photo here was chosen by eye (law 5) from that organiser's own event photos, never the photo that leads its event
 * page, so no page shows another page's lead. An organiser whose only photo is a poster with text across it keeps its
 * initials: printed words never sit under the hero's own name and stats (MKLStudios, looked at 31 October 2026).
 * tests/unit/images/organiser-hero-own-photo.test.ts holds it.
 */
export interface OrganiserHeroPhoto {
  src: string
  alt: string
  credit: string
  /** The subject's place in the wide crop, as a CSS background-position (looked at at 1440 and 390). */
  position: string
}

export const ORGANISER_HERO_PHOTOS: Record<string, OrganiserHeroPhoto> = {
  amcf: {
    src: 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/3b753251-8986-4ac4-8a0e-db2e5cbf9998/5d664060-a175-4b07-9c07-5e3c4a934c69/1792997333745-461a7f89.jpg',
    alt: 'A drummer singing on stage behind red drums at a past AMCF festival',
    credit: 'Photo: AMCF, past festival',
    // Centred, the 1440 crop cut off the top of his head; at 20 per cent his whole head and the microphone sit in the
    // upper half, clear of the avatar. At 390 the crop only trims the sides, so this changes nothing there.
    position: 'center 20%',
  },
}
