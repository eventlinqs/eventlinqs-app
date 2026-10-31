import type { FaithSlug } from '@/lib/faiths/data'

/**
 * EACH FAITH PAGE'S OWN PHOTOGRAPH (Lawal's standing directive of 31 October 2026: one photo, one subject; the photo
 * system's A1; the controller's 11:18: no hero drawn empty). Each faith page used to borrow a community's photograph,
 * then car 20 drew all five navy. These are photographs of each faith's own gatherings and places in Australia, chosen
 * by eye on 31 October 2026 from Wikimedia Commons, each free to use with its credit (licence and author read from the
 * file's own Commons record, C:\dev\EVIDENCE\FAITH-PHOTOS-31OCT\chosen.json). The 1920 px thumbnail of the same file is
 * served, a standard Wikimedia thumbnail width (https://www.mediawiki.org/wiki/Common_thumbnail_sizes), on the Commons
 * host our image allow-list carries; the page shows the credit under the hero, linked to the file's page, as the
 * licences ask.
 */
export interface FaithPhoto {
  src: string
  alt: string
  author: string
  licence: string
  licenceUrl: string
  filePage: string
}

export const FAITH_PHOTOS: Record<FaithSlug, FaithPhoto> = {
  christian: {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/View_from_the_rear_of_the_2024_Manningham_Carols_by_Candlelight_in_Ruffey_Lake_Park_in_Doncaster%2C_Melbourne.jpg/1920px-View_from_the_rear_of_the_2024_Manningham_Carols_by_Candlelight_in_Ruffey_Lake_Park_in_Doncaster%2C_Melbourne.jpg',
    alt: 'Families gathered on the grass at Carols by Candlelight in Ruffey Lake Park, Doncaster, Melbourne',
    author: 'Philip Mallis',
    licence: 'CC BY-SA 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
    filePage: 'https://commons.wikimedia.org/wiki/File:View_from_the_rear_of_the_2024_Manningham_Carols_by_Candlelight_in_Ruffey_Lake_Park_in_Doncaster,_Melbourne.jpg',
  },
  muslim: {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Eid_Prayer_at_Lakemba_Mosque.jpg/1920px-Eid_Prayer_at_Lakemba_Mosque.jpg',
    alt: 'Worshippers filling Lakemba Mosque in Sydney for Eid prayer',
    author: 'Dnalyensid',
    licence: 'CC BY-SA 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    filePage: 'https://commons.wikimedia.org/wiki/File:Eid_Prayer_at_Lakemba_Mosque.jpg',
  },
  hindu: {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Shiva_vishnu_koyil.jpg/1920px-Shiva_vishnu_koyil.jpg',
    alt: 'Visitors outside the gopurams of the Shri Shiva Vishnu Temple in Carrum Downs, Melbourne',
    author: 'கோபி',
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    filePage: 'https://commons.wikimedia.org/wiki/File:Shiva_vishnu_koyil.jpg',
  },
  buddhist: {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/2009-01-23_Nan_Tien_Temple_-_01.jpg/1920px-2009-01-23_Nan_Tien_Temple_-_01.jpg',
    alt: 'The main shrine of Nan Tien Temple in Wollongong, hung with lanterns for the new year',
    author: 'Maksym Kozlenko',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    filePage: 'https://commons.wikimedia.org/wiki/File:2009-01-23_Nan_Tien_Temple_-_01.jpg',
  },
  jewish: {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/%281%29Great_Synagogue_Sydney.jpg/1920px-%281%29Great_Synagogue_Sydney.jpg',
    alt: 'The carved sandstone facade and rose window of the Great Synagogue, Sydney',
    author: 'Sardaka',
    licence: 'CC BY 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0',
    filePage: 'https://commons.wikimedia.org/wiki/File:(1)Great_Synagogue_Sydney.jpg',
  },
}
