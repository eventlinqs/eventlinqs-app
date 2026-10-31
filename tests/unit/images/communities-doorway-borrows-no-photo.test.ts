import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMMUNITY_DOOR_TILE } from '@/components/features/home/category-nav-rail'

/**
 * NO PHOTO IS EVER REUSED (Lawal, 31 October 2026 00:14; the photo system's P6), AND EVERY TILE HAS A PHOTO (Lawal on
 * live, 31 October 2026, through the controller's 11:15: 'lock that in').
 *
 * The home page's Communities doorway tile borrowed the African community's own photo, so car 18 took it away and the
 * tile drew the EventLinqs placeholder on live. It now has its own photograph: the founder's rooftop gathering of
 * friends from several backgrounds (public/images/hero/homepage-rooftop.jpg, on record in
 * homepage-hero-attribution.json), which no community, city or category uses, and which leaves the home hero's raster
 * pool so the one page never shows it twice. scripts/guards/tiles-on-stored-photos.mjs clause 9 holds the same rule.
 */
describe('the Communities doorway tile', () => {
  it('opens /communities with a photograph of its own that exists', () => {
    expect(COMMUNITY_DOOR_TILE.href).toBe('/communities')
    expect(COMMUNITY_DOOR_TILE.imageSrc).not.toBe('')
    expect(existsSync(join(process.cwd(), 'public', COMMUNITY_DOOR_TILE.imageSrc))).toBe(true)
  })

  it('borrows no community photo and is not in the home hero raster pool', () => {
    expect(COMMUNITY_DOOR_TILE.imageSrc).not.toMatch(/african|afrobeats|scenes\//)
    const media = readFileSync(join(process.cwd(), 'src/lib/images/event-media.ts'), 'utf8')
    const pool = /HOMEPAGE_HERO_RASTERS\s*=\s*\[([^\]]*)\]/.exec(media)?.[1] ?? ''
    const base = COMMUNITY_DOOR_TILE.imageSrc.replace(/^.*\//, '').replace(/\.[a-z]+$/, '')
    expect(pool).not.toContain(`'${base}'`)
  })
})
