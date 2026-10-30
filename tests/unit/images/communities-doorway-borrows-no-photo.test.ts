import { describe, expect, it } from 'vitest'
import { COMMUNITY_DOOR_TILE } from '@/components/features/home/category-nav-rail'

/**
 * NO PHOTO IS EVER REUSED (Lawal, 31 October 2026 00:14; the photo system's P6).
 *
 * The home page's Communities doorway tile borrowed the African community's own photo, which also stands on the
 * African tile, the African page and the /communities hero (the live crawl of 31 October). The brand library holds no
 * unused photo for it, so the doorway draws the branded tile until Lawal gives the Communities surface its own photo.
 */
describe('the Communities doorway tile', () => {
  it('opens /communities and borrows no community photo', () => {
    expect(COMMUNITY_DOOR_TILE.href).toBe('/communities')
    expect(COMMUNITY_DOOR_TILE.imageSrc).toBe('')
  })
})
