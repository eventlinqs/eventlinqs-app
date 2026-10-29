import { getSpineSceneForCommunity } from './spine'
import { storedCommunityPhoto } from './stored-photos'

/**
 * The photograph for a community: its hero band, its card, its tile.
 *
 * STORED PHOTOGRAPHS ONLY, NEVER A REQUEST-TIME CALL (Lawal, 22:17 and 22:23 on 29 October 2026, through the project
 * manager's 22:20 and 22:24). This used to ask Pexels on every render for a community the spine did not name, and
 * cached the answer for a week through unstable_cache: when Pexels refused (a quota or rate limit that evening), the
 * refusal itself was kept, so production's African card and the Communities doorway showed no photograph for a week
 * to come. Now: Lawal's own licensed photograph through the spine, else the stored photograph the community is given
 * in src/lib/images/stored-photos.ts (a bundled original, or one kept once with its licence). Null only for a slug no
 * table names, and scripts/guards/tiles-on-stored-photos.mjs fails the build if a community route is one.
 */

export interface GetCommunityHeroPhotoOptions {
  /**
   * Kept for the callers that pass it (the community page heroes, the organisers strip). It used to opt into a
   * bundled raster when Pexels failed; every community now resolves to a stored photograph first, so it no longer
   * changes the answer.
   */
  allowBundledFallback?: boolean
}

export async function getCommunityHeroPhoto(slug: string, opts: GetCommunityHeroPhotoOptions = {}): Promise<string | null> {
  void opts
  const spine = getSpineSceneForCommunity(slug)
  if (spine) return spine.src
  return storedCommunityPhoto(slug)?.src ?? null
}

/** True for a community slug with a stored photograph, through the spine or the stored table. */
export function isKnownCommunityQuerySlug(slug: string): boolean {
  return getSpineSceneForCommunity(slug) !== null || storedCommunityPhoto(slug) !== null
}
