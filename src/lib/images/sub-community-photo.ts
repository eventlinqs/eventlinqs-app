import { unstable_cache } from 'next/cache'

/**
 * Sub-community photo pipeline backed by Pexels.
 *
 * Mirrors community-photo.ts but for the sub-communities rail tiles. Tier 1
 * communities expose 4-6 sub-communities each (filipino 4; mediterranean and
 * middle-eastern 5; the rest 6). Each gets a community-specific Pexels
 * query that trades genre tags for visually-recognisable shots (gele
 * wrappers over "african party", aso ebi over "nigerian music").
 *
 * Falls back to null when PEXELS_API_KEY is missing or the request
 * fails. The SubCommunityTileImage component substitutes a branded
 * navy gradient when null.
 *
 * Key shape: `${communitySlug}:${subCommunitySlug}` so sub-communities with
 * the same slug across different communities (none today, but cheap
 * insurance) never collide.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PEXELS_API = 'https://api.pexels.com/v1'

const SUB_COMMUNITY_QUERIES: Record<string, string> = {
  // ---- African (6) -------------------------------------------------
  'african:afrobeats':           'african music concert dancing crowd vibrant',
  'african:amapiano':            'south african dance music party youth',
  'african:owambe':              'nigerian wedding aso ebi colorful gele celebration',
  'african:west-african':        'west african drum dance traditional dress',
  'african:east-african':        'east african celebration colorful traditional',
  'african:pan-african-gospel':  'african gospel choir worship celebration',

  // ---- South Asian (6) ---------------------------------------------
  'south-asian:bollywood':       'bollywood dance saree colorful indian wedding',
  'south-asian:bhangra':         'punjabi bhangra dance turban energy',
  'south-asian:garba-raas':      'navratri garba dance colorful traditional',
  'south-asian:holi-diwali':     'diwali holi colorful celebration lights',
  'south-asian:tamil-telugu':    'tamil telugu south indian wedding traditional',
  'south-asian:classical':       'indian classical bharatanatyam temple',

  // ---- Caribbean (6) -----------------------------------------------
  'caribbean:reggae':            'reggae jamaica music dreadlocks celebration',
  'caribbean:soca':              'soca caribbean carnival feathers dancing',
  'caribbean:dancehall':         'dancehall jamaica music party celebration',
  'caribbean:afro-caribbean':    'afro caribbean drumming celebration colorful',
  'caribbean:trinidadian':       'trinidad carnival mas costume celebration',
  'caribbean:jamaican':          'jamaica beach music celebration tropical',

  // ---- Latin (6) ---------------------------------------------------
  'latin:mexican':               'mexican mariachi celebration colorful traditional',
  'latin:colombian':             'colombian salsa cumbia celebration vibrant',
  'latin:cuban':                 'cuban salsa havana music celebration',
  'latin:argentinian':           'argentine tango buenos aires dance passion',
  'latin:brazilian':             'brazil samba carnival rio celebration',
  'latin:spanish-latin':         'latin spanish dance flamenco passion',

  // ---- East Asian (6) ----------------------------------------------
  'east-asian:chinese':          'chinese new year dragon lanterns celebration',
  'east-asian:korean':           'korean kpop concert seoul lights crowd',
  'east-asian:japanese':         'japanese matsuri festival lanterns kimono',
  'east-asian:vietnamese':       'vietnamese tet lunar new year celebration',
  'east-asian:thai':             'thai songkran water festival celebration',
  'east-asian:lunar':            'lunar new year red lanterns dragon celebration',

  // ---- Filipino (4) ------------------------------------------------
  'filipino:opm':                'filipino music concert manila celebration',
  'filipino:fiesta':             'filipino fiesta parol traditional colorful',
  'filipino:sinulog':            'sinulog cebu festival dance colorful',
  'filipino:modern-filipino':    'filipino modern music youth celebration',

  // ---- Mediterranean (5) -------------------------------------------
  'mediterranean:italian':       'italian wedding tuscany celebration warm',
  'mediterranean:greek':         'greek dance santorini celebration plates',
  'mediterranean:spanish':       'spanish flamenco guitar passion dance',
  'mediterranean:portuguese':    'portugal fado lisbon music traditional',
  'mediterranean:cypriot':       'cyprus mediterranean celebration traditional',

  // ---- Middle Eastern (5) ------------------------------------------
  'middle-eastern:lebanese':     'lebanese wedding dabke celebration colorful',
  'middle-eastern:persian':      'persian iranian celebration traditional colorful',
  'middle-eastern:turkish':      'turkish wedding folk dance celebration',
  'middle-eastern:arab':         'arabic celebration traditional colorful music',
  'middle-eastern:egyptian':     'egypt celebration traditional dance colorful',

  // ---- European (6) ------------------------------------------------
  'european:polish':             'polish folk dance celebration traditional',
  'european:russian':            'russian celebration traditional folk colorful',
  'european:german':             'german oktoberfest celebration beer dirndl',
  'european:french':             'french celebration paris cafe traditional',
  'european:hungarian':          'hungarian folk dance celebration traditional',
  'european:romanian':           'romanian folk dance celebration traditional',

  // ---- Pacific (6) -------------------------------------------------
  'pacific:maori':               'maori haka celebration traditional new zealand',
  'pacific:samoan':              'samoa pacific celebration traditional dance',
  'pacific:tongan':              'tonga pacific celebration traditional ceremony',
  'pacific:fijian':              'fiji pacific celebration traditional dance',
  'pacific:aboriginal':          'aboriginal australia celebration traditional ceremony',
  'pacific:torres-strait':       'torres strait islander celebration traditional',

  // ---- Gospel (Tier 2, 6) ------------------------------------------
  'gospel:african-gospel':   'african gospel choir nigeria worship raised hands',
  'gospel:pacific-choir':    'pacific church choir samoan tongan worship',
  'gospel:filipino-praise':  'filipino worship church praise night',
  'gospel:black-gospel':     'black gospel choir united states worship celebration',
  'gospel:latin-christian':  'latin worship spanish church praise band',
  'gospel:caribbean-gospel': 'caribbean gospel jamaica worship choir',

  // ---- Comedy (Tier 2, 6) ------------------------------------------
  'comedy:african-comedy':     'african comedian stage microphone audience laughing',
  'comedy:south-asian-comedy': 'indian standup comedy stage microphone audience',
  'comedy:latin-comedy':       'spanish standup comedy stage performance',
  'comedy:filipino-comedy':    'filipino standup comedy stage audience',
  'comedy:open-mic':           'comedy open mic small club intimate stage',
  'comedy:improv':             'improv comedy stage troupe performance',

  // ---- Wellness (Tier 2, 6) ----------------------------------------
  'wellness:yoga':           'yoga class group studio sunrise mats',
  'wellness:meditation':     'meditation group circle peaceful zen',
  'wellness:sound-bath':     'sound bath crystal bowls gong meditation',
  'wellness:breathwork':     'breathwork class group studio breathing',
  'wellness:retreats':       'wellness retreat outdoor nature group',
  'wellness:tai-chi':        'tai chi park morning practice group',

  // ---- Pride (Tier 2, 6) -------------------------------------------
  'pride:mardi-gras':        'sydney mardi gras parade rainbow flags celebration',
  'pride:drag':              'drag queen performance stage glamorous',
  'pride:ballroom':          'ballroom voguing dance house queer performance',
  'pride:queer-film':        'film festival cinema audience event',
  'pride:queer-dance':       'queer dance party rainbow lights crowd celebration',
  'pride:pride-fest':        'pride festival rainbow flags crowd celebration city',
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

interface PexelsApiPhoto {
  src: { large: string; medium: string; landscape?: string }
  width?: number
  height?: number
  alt: string | null
  photographer: string
}

const TOP_N = 5

async function fetchSubCommunityPhotoRaw(query: string): Promise<string | null> {
  if (!PEXELS_API_KEY) return null

  try {
    const res = await fetch(
      `${PEXELS_API}/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&size=large`,
      {
        headers: { Authorization: PEXELS_API_KEY },
        next: { revalidate: 60 * 60 * 24 * 7 },
      }
    )
    if (!res.ok) return null

    const data = (await res.json()) as { photos?: PexelsApiPhoto[] }
    if (!data.photos?.length) return null

    const usable = data.photos.filter(p => (p.width ?? 0) >= 1200 && (p.height ?? 0) >= 700)
    const pool = (usable.length > 0 ? usable : data.photos).slice(0, TOP_N)
    const photo = pool[simpleHash(query + ':sub-community') % pool.length]

    return photo.src.landscape ?? photo.src.large
  } catch {
    return null
  }
}

const fetchSubCommunityPhoto = unstable_cache(
  fetchSubCommunityPhotoRaw,
  ['pexels-sub-community-v1'],
  { revalidate: 60 * 60 * 24 * 7, tags: ['pexels', 'pexels-sub-community'] }
)

export async function getSubCommunityPhoto(
  communitySlug: string,
  subCommunitySlug: string,
): Promise<string | null> {
  const key = `${communitySlug.toLowerCase()}:${subCommunitySlug.toLowerCase()}`
  const query = SUB_COMMUNITY_QUERIES[key]
  if (!query) return null
  return await fetchSubCommunityPhoto(query)
}

export function isKnownSubCommunityKey(communitySlug: string, subCommunitySlug: string): boolean {
  return `${communitySlug.toLowerCase()}:${subCommunitySlug.toLowerCase()}` in SUB_COMMUNITY_QUERIES
}
