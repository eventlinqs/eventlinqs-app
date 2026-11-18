import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderCampaignSlide } from '@/lib/broadcast/campaign-slides'
import { isApprovedFileUrl, type Slide } from './campaign'
import { graphCaller, makeMetaPublisher, metaConfigFrom } from './meta-publisher'
import { blotatoConfigFrom, makeBlotatoPublisher, makeBlotatoReader, makeBlotatoSearch, type BlotatoPostReader, type BlotatoPublishedSearch } from './blotato-publisher'
import { slideImagesNow, type Publisher } from './store'

type Db = SupabaseClient

/**
 * THE META PUBLISHER, WIRED (car 58). Null until Lawal's script has written all five META_ names (the run then holds a
 * due piece with "no Meta publisher is connected", as before); with them, the publisher of src/lib/social/meta-publisher.ts
 * with its two real dependencies:
 *   the Graph API through the Page token Lawal's script wrote (for Instagram with Facebook Login, Meta's publishing page
 *   names the "Facebook Page access token" and the graph.facebook.com host);
 *   each slide drawn exactly as /admin/social/piece/<id>/<n> draws it (renderCampaignSlide, its photograph asked of the
 *   register at this moment), the feed at 4:5 and a story at 9:16, stored once as a public JPEG in the event-images
 *   bucket, because Meta fetches every image by its address.
 * The switch social_auto_publish still decides whether anything is sent; it is Lawal's alone.
 */
/** Each slide drawn exactly as /admin/social/piece/<id>/<n> draws it and stored once as a public JPEG: one step for both routes. */
function slideUrlsFor(db: Db, now: Date, route: string) {
  return async (pieceId: string, slides: readonly Slide[], format: 'feed' | 'story'): Promise<readonly string[]> => {
      const images = await slideImagesNow(db, slides, now)
      const stamp = now.getTime()
      const urls: string[] = []
      for (let i = 0; i < slides.length; i += 1) {
        const s = slides[i]
        // An approved file is posted as it is, from its own address on www, never drawn again (Lawal's 11:55 approval).
        if (s.t === 'file') {
          if (!isApprovedFileUrl(s.url)) throw new Error(`slide ${i + 1} is not an approved file's own address on www: ${s.url}`)
          urls.push(s.url)
          continue
        }
        const bytes = await renderCampaignSlide(format, slides[i], i + 1, slides.length, null, images.get(i) ?? null, slides[i + 1] ?? null)
        const path = `social/${pieceId}/${stamp}-${String(i + 1).padStart(2, '0')}-${format}.jpg`
        const bucket = db.storage.from('event-images')
        const up = await bucket.upload(path, bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' })
        if (up.error) throw new Error(`slide ${i + 1} could not be stored for ${route}: ${up.error.message}`)
        urls.push(bucket.getPublicUrl(path).data.publicUrl)
      }
      return urls
  }
}

export function metaPublisherFromEnv(db: Db, now: Date): Publisher | null {
  const config = metaConfigFrom(process.env)
  if (config === null) return null
  return makeMetaPublisher({ config, graph: graphCaller(config.pageToken), slideUrls: slideUrlsFor(db, now, 'Meta') })
}

/** Route B (Lawal's yes of 15 November 2026, 13:55): Blotato, once BLOTATO_API_KEY exists. */
export function blotatoPublisherFromEnv(db: Db, now: Date): Publisher | null {
  const config = blotatoConfigFrom(process.env)
  if (config === null) return null
  return makeBlotatoPublisher({ config, slideUrls: slideUrlsFor(db, now, 'Blotato') })
}

/**
 * THE ONE PUBLISHER THE SOCIAL RUN USES: our own Meta app when its five names exist (route A, no fee), else Blotato
 * (route B), else none, and a due piece is held as before. One route a post, so a post never goes twice.
 */
export function socialPublisherFromEnv(db: Db, now: Date): Publisher | null {
  return metaPublisherFromEnv(db, now) ?? blotatoPublisherFromEnv(db, now)
}

/** Blotato's read of a post it accepted, when its key is set (route B); null on the Meta route or with no key. */
export function socialPostReaderFromEnv(): BlotatoPostReader | null {
  const config = blotatoConfigFrom(process.env)
  return config === null ? null : makeBlotatoReader(config)
}

/** Blotato's list of published posts, when its key is set (route B); null otherwise. */
export function socialPublishedSearchFromEnv(): BlotatoPublishedSearch | null {
  const config = blotatoConfigFrom(process.env)
  return config === null ? null : makeBlotatoSearch(config)
}
