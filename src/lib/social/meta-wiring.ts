import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderCampaignSlide } from '@/lib/broadcast/campaign-slides'
import type { Slide } from './campaign'
import { graphCaller, makeMetaPublisher, metaConfigFrom } from './meta-publisher'
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
export function metaPublisherFromEnv(db: Db, now: Date): Publisher | null {
  const config = metaConfigFrom(process.env)
  if (config === null) return null
  return makeMetaPublisher({
    config,
    graph: graphCaller(config.pageToken),
    slideUrls: async (pieceId: string, slides: readonly Slide[], format: 'feed' | 'story') => {
      const images = await slideImagesNow(db, slides, now)
      const stamp = now.getTime()
      const urls: string[] = []
      for (let i = 0; i < slides.length; i += 1) {
        const bytes = await renderCampaignSlide(format, slides[i], i + 1, slides.length, null, images.get(i) ?? null)
        const path = `social/${pieceId}/${stamp}-${String(i + 1).padStart(2, '0')}-${format}.jpg`
        const bucket = db.storage.from('event-images')
        const up = await bucket.upload(path, bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' })
        if (up.error) throw new Error(`slide ${i + 1} could not be stored for Meta: ${up.error.message}`)
        urls.push(bucket.getPublicUrl(path).data.publicUrl)
      }
      return urls
    },
  })
}
