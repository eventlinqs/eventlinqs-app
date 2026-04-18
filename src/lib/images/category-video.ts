import { unstable_cache } from 'next/cache'

/**
 * Category-aware video pipeline backed by Pexels.
 *
 * Returns null if PEXELS_API_KEY is missing, no suitable video exists,
 * or the network call fails. Callers fall back to photography.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PEXELS_VIDEO_API = 'https://api.pexels.com/videos'

// Queries bias toward multicultural, diverse crowds to reflect the communities
// EventLinqs serves. Avoid single-demographic stock imagery.
const VIDEO_QUERIES: Record<string, string> = {
  'afrobeats': 'multicultural music festival diverse crowd',
  'amapiano': 'african diaspora dance floor celebration',
  'gospel': 'community gospel worship together',
  'owambe': 'african wedding celebration diverse families',
  'caribbean': 'caribbean carnival dance diverse crowd',
  'heritage-and-independence': 'cultural festival diverse families parade',
  'networking': 'diverse business conference professionals',
  'business-networking': 'diverse business conference professionals',
  'comedy': 'diverse audience laughing comedy show',
  'music': 'diverse audience live music celebration',
  'festival': 'diverse crowd outdoor music festival',
  'food-drink': 'diverse friends food market gathering',
  'sports': 'diverse fans stadium cheering',
  'nightlife': 'friends nightclub celebration diverse',
  'arts-culture': 'diverse art gallery culture event',
  'family': 'multicultural family outdoor festival',
  'fashion': 'diverse models fashion runway',
  'film': 'diverse cinema premiere audience',
  'health-wellness': 'diverse yoga wellness outdoor',
  'religion': 'diverse congregation worship community',
  'community': 'multicultural community gathering friends families',
  'charity': 'diverse volunteers fundraiser helping',
  'education': 'diverse audience seminar lecture',
  'technology': 'diverse tech conference speakers',
  'other': 'diverse friends community celebration together',
}

export interface PexelsVideo {
  /** mp4 URL, roughly 720p */
  src: string
  /** thumbnail still */
  poster: string
  duration: number
}

interface PexelsVideoFile {
  file_type: string
  width: number
  height: number
  link: string
}

interface PexelsApiVideo {
  duration: number
  image: string
  video_files: PexelsVideoFile[]
}

async function fetchVideoRaw(query: string): Promise<PexelsVideo | null> {
  if (!PEXELS_API_KEY) return null

  try {
    const res = await fetch(
      `${PEXELS_VIDEO_API}/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`,
      {
        headers: { Authorization: PEXELS_API_KEY },
        next: { revalidate: 60 * 60 * 24 * 30 },
      }
    )
    if (!res.ok) return null

    const data = (await res.json()) as { videos?: PexelsApiVideo[] }
    if (!data.videos?.length) return null

    const candidates = data.videos.filter(v => v.duration >= 8 && v.duration <= 20)
    const video = candidates[0] ?? data.videos[0]
    if (!video) return null

    const file = video.video_files
      .filter(f => f.file_type === 'video/mp4')
      .sort((a, b) => Math.abs(a.width - 1280) - Math.abs(b.width - 1280))[0]

    if (!file) return null

    return {
      src: file.link,
      poster: video.image,
      duration: video.duration,
    }
  } catch {
    return null
  }
}

const fetchVideo = unstable_cache(
  fetchVideoRaw,
  ['pexels-category-video'],
  { revalidate: 60 * 60 * 24 * 30, tags: ['pexels-video'] }
)

export async function getCategoryVideo(
  categorySlug: string | null | undefined,
): Promise<PexelsVideo | null> {
  const slug = (categorySlug || 'other').toLowerCase()
  const query = VIDEO_QUERIES[slug] ?? VIDEO_QUERIES.other
  return await fetchVideo(query)
}
