import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderCampaignSlide } from '@/lib/broadcast/campaign-slides'
import { makeDailyStories, makeWeeklyCarousels, type CarouselDeps, type CarouselMade } from './carousel-make'
import { readCampaignCities, readCampaignNights, receiveIntake, slideImagesNow, type UsableImage } from './store'

type Db = SupabaseClient

/**
 * THE CAROUSEL'S MAKE STEP, WIRED (WINDOW 5C, 25 November 2026; ./carousel-make.ts): the guide's own readers, each slide
 * drawn exactly as /admin/social draws it (renderCampaignSlide, the feed at 4:5, its photograph the register's answer that
 * minute), stored once as a finished file under event-images/creative/<uuid>/ (never overwritten), and the creative
 * intake (store.ts receiveIntake), whose gates leave an unapproved piece for the PM's verify.
 */
export function carouselDepsFor(db: Db, opts: { readonly now: Date; readonly siteOrigin: string }): CarouselDeps {
  return {
    readCities: (d) => readCampaignCities(d),
    // The week's seven days from its Monday (the reader starts at this minute and reads on to the week's end).
    readNights: (d, cities, weekStart, now) => readCampaignNights(d, cities, weekStart, now, { aheadDays: 7 }),
    pictures: (d, slides, now) => slideImagesNow(d, slides, now),
    // The picture handed back is the register's own answer for that slide (slideImagesNow), passed through as it came.
    render: (slide, n, total, picture, next, format) => renderCampaignSlide(format, slide, n, total, null, picture as UsableImage | null, next),
    store: async (path, bytes) => {
      const bucket = db.storage.from('event-images')
      const up = await bucket.upload(path, bytes, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' })
      if (up.error) throw new Error(`the slide ${path} could not be stored: ${up.error.message}`)
      return bucket.getPublicUrl(path).data.publicUrl
    },
    intake: async (record) => {
      const r = await receiveIntake(db, record, { now: opts.now, siteOrigin: opts.siteOrigin })
      return r.state === 'refused' ? { state: 'refused', reason: r.reason } : { state: r.state, pieceId: r.pieceId, faults: r.faults }
    },
  }
}

/** Makes each city's story of the day due now with the wired hands (./carousel-make.ts makeDailyStories); one line a city. */
export function makeStoriesNow(db: Db, input: { readonly now: Date; readonly siteOrigin: string }): Promise<CarouselMade[]> {
  return makeDailyStories(db, { now: input.now, deps: carouselDepsFor(db, input) })
}

/** Makes each carousel due now with the wired hands; one line a city. */
export function makeCarouselsNow(db: Db, input: { readonly now: Date; readonly siteOrigin: string }): Promise<CarouselMade[]> {
  return makeWeeklyCarousels(db, { now: input.now, deps: carouselDepsFor(db, input) })
}
