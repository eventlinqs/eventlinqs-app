import { getSpineCategoryTile, getSpineCategoryHero, getSpineHero } from '@/lib/images/spine'

/**
 * THE ILLUSTRATIVE PHOTOGRAPHS (law 46 (f); Lawal's 09:16 of 21 November 2026 through the PM: "licensed stock is
 * labelled 'Illustrative photo' and avoids recognisable people as the subject").
 *
 * A night with no photograph of its own and no approved photograph of its venue may stand on a licensed photograph of
 * its kind, labelled 'Illustrative photo' wherever it shows. Only the photographs named here may, each looked at on
 * 21 November 2026 (C:\dev\EVIDENCE\EL-21NOV\ph1\look): no person its recognisable subject, no brand, no printed words.
 * A kind with none here takes the brand panel (no picture at all), never a photograph whose subject is someone's face.
 * - music: the licensed library's live band, seen from behind the stage;
 * - festival: the library's field stage, the crowd seen from behind;
 * - community: the library's raised hands against the stage lights, in silhouette;
 * - arts: the library's gallery, its visitors seen from behind, the paintings the subject;
 * - health and wellness: one figure in silhouette against the sky (the library, Pexels);
 * - family, comedy, education, sports: kept from Pexels under the Pexels License, each with its photographer and page
 *   in public/images/library/attribution.json (crayons on yellow; a microphone under stage lights; library shelves;
 *   stadium floodlights over empty seats).
 * Refused that morning, the face being the subject: the library's family picnic, comedy clown, education presenter,
 * sports fans, food stall couple and rooftop friends. Food and drink, nightlife, theatre and classes take the brand
 * panel until a photograph of theirs is looked at and added here.
 */
const LIBRARY: Record<string, string> = {
  family: '/images/library/illustrative-family.jpg',
  comedy: '/images/library/illustrative-comedy.jpg',
  education: '/images/library/illustrative-education.jpg',
  sports: '/images/library/illustrative-sports.jpg',
  'health-wellness': '/images/library/health-wellness.jpg',
}

export function illustrativePhoto(categorySlug: string | null | undefined): string | null {
  const slug = (categorySlug ?? '').toLowerCase()
  switch (slug) {
    case 'music':
      return getSpineCategoryTile('music')?.src ?? null
    case 'festival':
      return getSpineCategoryTile('festival')?.src ?? null
    case 'community':
      return getSpineHero('supportingCrowd')?.src ?? null
    case 'arts-community':
      // The arts landing hero is the gallery photograph (its file under the key 'arts'); the tile is the theatre one.
      return getSpineCategoryHero('arts-community')?.src ?? null
    default:
      return LIBRARY[slug] ?? null
  }
}
