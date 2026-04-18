import { unstable_cache } from 'next/cache'

/**
 * Category-aware video pipeline backed by Pexels.
 *
 * Returns null if PEXELS_API_KEY is missing, no suitable video exists,
 * or the network call fails. Callers fall back to photography.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PEXELS_VIDEO_API = 'https://api.pexels.com/videos'

const VIDEO_QUERIES: Record<string, string> = {
  'afrobeats': 'concert crowd dancing lights',
  'amapiano': 'club dancing party night',
  'gospel': 'choir singing worship',
  'owambe': 'wedding celebration dancing',
  'caribbean': 'carnival dancing tropical',
  'heritage-and-independence': 'festival flag parade',
  'networking': 'business conference people talking',
  'business-networking': 'business conference people talking',
  'comedy': 'comedy stage performance',
  'music': 'concert stage lights crowd',
  'festival': 'festival crowd outdoor music',
  'food-drink': 'food market people eating',
  'sports': 'stadium fans cheering',
  'nightlife': 'nightclub dj party',
  'arts-culture': 'art gallery museum',
  'family': 'family outdoor festival',
  'fashion': 'fashion runway models',
  'film': 'cinema premiere screen',
  'health-wellness': 'yoga outdoor calm',
  'religion': 'church worship service',
  'community': 'community gathering people',
  'charity': 'fundraiser volunteers helping',
  'education': 'seminar lecture audience',
  'technology': 'tech conference speaker',
  'other': 'people celebrating event',
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
